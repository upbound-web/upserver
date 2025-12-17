const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

/**
 * Get the full URL for an image path stored in a message
 */
export function getImageUrl(imagePath: string): string {
  // imagePath is like "public/uploads/filename.jpg"
  // We need to encode it for the URL
  return `${API_BASE_URL}/api/chat/images/${encodeURIComponent(imagePath)}`
}

export interface ChatSession {
  id: string
  customerId: string
  title: string | null
  status: 'active' | 'closed'
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  sessionId: string
  role: 'customer' | 'assistant' | 'system'
  content: string
  images?: string | null
  flagged: boolean
  createdAt: string
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  // Only set Content-Type for non-FormData requests
  const isFormData = options.body instanceof FormData
  const headers: HeadersInit = {
    ...options.headers,
  }

  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include', // Include cookies for authentication
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export async function getChatSessions(): Promise<{ sessions: ChatSession[] }> {
  return fetchWithAuth('/api/chat/sessions')
}

export async function createChatSession(): Promise<{ session: ChatSession }> {
  return fetchWithAuth('/api/chat/sessions', {
    method: 'POST',
  })
}

export async function getSessionMessages(sessionId: string): Promise<{ messages: Message[] }> {
  return fetchWithAuth(`/api/chat/sessions/${sessionId}`)
}

export async function sendMessage(
  sessionId: string,
  content: string,
  images?: File[]
): Promise<{ message: Message }> {
  // If images are provided, use FormData; otherwise use JSON
  if (images && images.length > 0) {
    const formData = new FormData()
    formData.append('content', content)
    images.forEach((image) => {
      formData.append('images', image)
    })

    return fetchWithAuth(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        // Don't set Content-Type for FormData - browser will set it with boundary
      },
      body: formData,
    })
  } else {
    return fetchWithAuth(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  }
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | {
    type: 'done'
    flagged: boolean
    filesModified: string[]
    claudeSessionId?: string
  }
  | { type: 'error'; message: string }

/**
 * Stream a chat message response using the SSE endpoint.
 * This uses fetch + ReadableStream so we can POST JSON and still parse SSE.
 */
export async function streamMessage(
  sessionId: string,
  content: string,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      errorText || `HTTP error while starting stream: ${response.status}`
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const processBuffer = () => {
    const events = buffer.split('\n\n')
    // Keep the last partial chunk in the buffer
    buffer = events.pop() || ''

    for (const rawEvent of events) {
      const lines = rawEvent.split('\n')
      let eventType = 'message'
      let data = ''

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.replace('event:', '').trim()
        } else if (line.startsWith('data:')) {
          data += line.replace('data:', '').trim()
        }
      }

      if (!data) continue

      try {
        const parsed = JSON.parse(data)
        if (eventType === 'text') {
          onEvent({ type: 'text', text: parsed.text })
        } else if (eventType === 'done') {
          onEvent({
            type: 'done',
            flagged: !!parsed.flagged,
            filesModified: parsed.filesModified || [],
            claudeSessionId: parsed.claudeSessionId,
          })
        } else if (eventType === 'error') {
          onEvent({ type: 'error', message: parsed.message || 'Unknown error' })
        }
      } catch (error) {
        console.error('Failed to parse SSE event data', error, data)
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    processBuffer()
  }
}

