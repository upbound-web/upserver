import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChatSessions, createChatSession, type ChatSession } from '@/lib/chat-api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MessageSquare, Plus, Loader2 } from 'lucide-react'

interface SessionSidebarProps {
  currentSessionId: string | null
  onSessionSelect: (sessionId: string) => void
}

export function SessionSidebar({ currentSessionId, onSessionSelect }: SessionSidebarProps) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['chatSessions'],
    queryFn: getChatSessions,
  })

  const createSessionMutation = useMutation({
    mutationFn: createChatSession,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chatSessions'] })
      onSessionSelect(data.session.id)
    },
  })

  const handleNewChat = () => {
    createSessionMutation.mutate()
  }

  const sessions = data?.sessions || []

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="w-64 border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 flex flex-col h-full">
      <div className="p-4 border-b border-stone-200 dark:border-stone-800">
        <Button
          onClick={handleNewChat}
          className="w-full"
          disabled={createSessionMutation.isPending}
        >
          {createSessionMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              New Chat
            </>
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-sm text-stone-500 dark:text-stone-400">
            No chat sessions yet. Start a new chat!
          </div>
        ) : (
          <div className="p-2">
            {sessions.map((session: ChatSession) => (
              <button
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg mb-1 transition-colors',
                  'hover:bg-stone-100 dark:hover:bg-stone-800',
                  currentSessionId === session.id &&
                    'bg-stone-200 dark:bg-stone-800 border border-stone-300 dark:border-stone-700'
                )}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 mt-0.5 text-stone-500 dark:text-stone-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                      Chat {sessions.indexOf(session) + 1}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                      {formatDate(session.updatedAt)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}



