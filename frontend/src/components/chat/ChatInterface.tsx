import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSessionMessages, sendMessage, streamMessage, rewindToMessage, type Message } from '@/lib/chat-api'
import { MessageBubble } from './MessageBubble'
import { AdminImpersonationBanner } from './AdminImpersonationBanner'
import { Button } from '@/components/ui/button'
import { Loader2, Send, Image as ImageIcon, X, AlertCircle, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import imageCompression from 'browser-image-compression'
import { Alert, AlertDescription } from '../ui/alert'

interface ChatInterfaceProps {
  sessionId: string | null
  viewAsUserId?: string | null
}

const PROMPT_TEMPLATES = [
  'Can you update our opening hours on the contact page?',
  'Please change our phone number everywhere to 07 3000 0000.',
  'Swap the hero image with this new one and keep the same layout.',
  'Add a new testimonial for us near the bottom of the homepage.',
  'Please tidy up any obvious typos on the services page.',
]

export function ChatInterface({ sessionId, viewAsUserId }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('')
  const [showPromptTemplates, setShowPromptTemplates] = useState(false)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [optimizedImages, setOptimizedImages] = useState<File[]>([])
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamError, setStreamError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error: messagesError } = useQuery({
    queryKey: ['chatMessages', sessionId, viewAsUserId],
    queryFn: () => getSessionMessages(sessionId!, viewAsUserId),
    enabled: !!sessionId,
  })

  const [undoSuccess, setUndoSuccess] = useState<string | null>(null)

  const sendMessageMutation = useMutation({
    mutationFn: ({ sessionId, content, images }: { sessionId: string; content: string; images?: File[] }) =>
      sendMessage(sessionId, content, images, viewAsUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatMessages', sessionId, viewAsUserId] })
      queryClient.invalidateQueries({ queryKey: ['chatSessions', viewAsUserId] })
      setInputValue('')
      setSelectedImages([])
      setOptimizedImages([])
    },
  })

  const rewindMutation = useMutation({
    mutationFn: ({ sessionId, messageId }: { sessionId: string; messageId: string }) =>
      rewindToMessage(sessionId, messageId, viewAsUserId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chatMessages', sessionId, viewAsUserId] })
      setUndoSuccess(variables.messageId)
      setTimeout(() => setUndoSuccess(null), 2000)
    },
  })

  // Optimize images when selected
  useEffect(() => {
    const optimizeImages = async () => {
      if (selectedImages.length === 0) {
        setOptimizedImages([])
        return
      }

      setIsOptimizing(true)
      try {
        const optimized = await Promise.all(
          selectedImages.map(async (file) => {
            const options = {
              maxSizeMB: 2,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            }
            const compressed = await imageCompression(file, options)
            // Preserve original filename and type
            return new File([compressed], file.name, {
              type: file.type,
              lastModified: file.lastModified,
            })
          })
        )
        setOptimizedImages(optimized)
      } catch (error) {
        console.error('Error optimizing images:', error)
        // Fallback to original images if optimization fails
        setOptimizedImages(selectedImages)
      } finally {
        setIsOptimizing(false)
      }
    }

    optimizeImages()
  }, [selectedImages])

  const messages = data?.messages || []

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (inputValue === '' && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputValue])

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/')
    )

    if (imageFiles.length > 0) {
      setSelectedImages((prev) => [...prev, ...imageFiles])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !sessionId ||
      (!inputValue.trim() && optimizedImages.length === 0) ||
      sendMessageMutation.isPending ||
      isStreaming
    )
      return

    const content = inputValue.trim() || 'Please update the images'

    // If we have images, fall back to non-streaming API which already handles uploads
    if (optimizedImages.length > 0) {
      sendMessageMutation.mutate({
        sessionId,
        content,
        images: optimizedImages,
      })
      return
    }

    try {
      setIsStreaming(true)
      setStreamingText('')
      setStreamError(null)

      await streamMessage(sessionId, content, (event) => {
        if (event.type === 'text') {
          setStreamingText((prev) => prev + event.text)
        } else if (event.type === 'error') {
          setStreamError(event.message)
          setIsStreaming(false)
        } else if (event.type === 'done') {
          setIsStreaming(false)
          setInputValue('')
          setSelectedImages([])
          setOptimizedImages([])
          // Refresh messages and sessions to show the persisted assistant message
          queryClient.invalidateQueries({ queryKey: ['chatMessages', sessionId, viewAsUserId] })
          queryClient.invalidateQueries({ queryKey: ['chatSessions', viewAsUserId] })
        }
      }, viewAsUserId)
    } catch (error) {
      console.error('Streaming error:', error)
      setStreamError(
        error instanceof Error
          ? error.message
          : 'Failed to stream response. Please try again.'
      )
      setIsStreaming(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-stone-600 dark:text-stone-400">
              Select a chat session from the sidebar or create a new one to start chatting.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-stone-50 dark:bg-stone-950 h-full">
      {/* Admin Impersonation Banner */}
      {viewAsUserId && (
        <div className="px-4 pt-4">
          <AdminImpersonationBanner userId={viewAsUserId} />
        </div>
      )}
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messagesError && (
          <div className="max-w-3xl mx-auto w-full mb-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                We couldn't load messages right now. Please try again.
              </AlertDescription>
            </Alert>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Card className="w-full max-w-md">
              <CardContent className="p-8 text-center">
                <p className="text-stone-600 dark:text-stone-400">
                  No messages yet. Start the conversation!
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full">
            {messages.map((message: Message) => (
              <MessageBubble
                key={message.id}
                message={message}
                userId={viewAsUserId}
                onUndo={
                  sessionId
                    ? (messageId) => rewindMutation.mutate({ sessionId, messageId })
                    : undefined
                }
              />
            ))}
            {undoSuccess && (
              <div className="flex justify-start mb-4">
                <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Files reverted successfully
                </div>
              </div>
            )}
            {(sendMessageMutation.isPending || isStreaming) && (
              <div className="flex justify-start mb-4">
                <div className="bg-stone-100 dark:bg-stone-800 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">
                      {isStreaming ? 'Claude is responding...' : 'Claude is thinking...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {isStreaming && streamingText && (
              <MessageBubble
                message={{
                  id: 'streaming',
                  sessionId: sessionId,
                  role: 'assistant',
                  content: streamingText,
                  images: null,
                  flagged: false,
                  createdAt: new Date().toISOString(),
                }}
                userId={viewAsUserId}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPromptTemplates((v) => !v)}
              disabled={sendMessageMutation.isPending || isStreaming}
            >
              {showPromptTemplates ? 'Hide prompt ideas' : 'Show prompt ideas'}
            </Button>
          </div>
          {showPromptTemplates && (
            <div className="mb-3 flex flex-wrap gap-2">
              {PROMPT_TEMPLATES.map((template) => (
                <Button
                  key={template}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInputValue(template)}
                  disabled={sendMessageMutation.isPending || isStreaming}
                >
                  {template.length > 38 ? `${template.slice(0, 38)}...` : template}
                </Button>
              ))}
            </div>
          )}
          {(sendMessageMutation.isError || streamError) && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {streamError
                  ? streamError
                  : sendMessageMutation.error instanceof Error
                  ? sendMessageMutation.error.message
                  : 'Failed to send message. Please try again.'}
              </AlertDescription>
            </Alert>
          )}
          {/* Image Preview */}
          {selectedImages.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-2">
              {selectedImages.map((file, index) => (
                <div key={index} className="relative flex-shrink-0">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Preview ${index + 1}`}
                    className="h-20 w-20 rounded-lg object-cover border border-stone-200 dark:border-stone-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {isOptimizing && (
                    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex gap-2 ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="flex gap-2 flex-1 items-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendMessageMutation.isPending}
                className="flex-shrink-0"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  // Auto-resize textarea
                  const textarea = e.target
                  textarea.style.height = 'auto'
                  textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (inputValue.trim() || optimizedImages.length > 0) {
                      handleSubmit(e)
                    }
                  }
                }}
                placeholder={
                  selectedImages.length > 0
                    ? 'Add a message about these images (optional)...'
                    : 'Type your message or drag images here...'
                }
                disabled={sendMessageMutation.isPending || isStreaming}
                rows={1}
                className="flex-1 min-h-[2.25rem] max-h-32 w-full min-w-0 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto break-words whitespace-pre-wrap focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
              <Button
                type="submit"
                disabled={
                  (!inputValue.trim() && optimizedImages.length === 0) ||
                  sendMessageMutation.isPending ||
                  isOptimizing ||
                  isStreaming
                }
                className="flex-shrink-0"
              >
                {sendMessageMutation.isPending || isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
