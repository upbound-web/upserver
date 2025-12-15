import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { RequireAuth } from '@/lib/route-guards'
import { SessionSidebar } from '@/components/chat/SessionSidebar'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { useQuery } from '@tanstack/react-query'
import { getChatSessions } from '@/lib/chat-api'
import { Loader2 } from 'lucide-react'

export const Route = createFileRoute('/chat')({
  component: ChatPage,
})

function ChatPage() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['chatSessions'],
    queryFn: getChatSessions,
  })

  // Auto-select first session if available and none selected
  useEffect(() => {
    if (!currentSessionId && sessionsData?.sessions && sessionsData.sessions.length > 0) {
      setCurrentSessionId(sessionsData.sessions[0].id)
    }
  }, [sessionsData, currentSessionId])

  return (
    <RequireAuth>
      <div className="h-[calc(100vh-4rem)] flex">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-stone-600" />
          </div>
        ) : (
          <>
            <SessionSidebar
              currentSessionId={currentSessionId}
              onSessionSelect={setCurrentSessionId}
            />
            <ChatInterface sessionId={currentSessionId} />
          </>
        )}
      </div>
    </RequireAuth>
  )
}
