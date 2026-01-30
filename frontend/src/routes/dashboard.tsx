import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useSession } from '@/lib/auth'
import { RequireAuth } from '@/lib/route-guards'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDevServerStatus,
  startDevServer,
  stopDevServer,
  type DevServerStatus,
} from '@/lib/devserver-api'
import { publishSite, getPublishStatus } from '@/lib/publish-api'
import { getCustomerProfile } from '@/lib/customer-api'
import { getChatSessions } from '@/lib/chat-api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Play, Square, ExternalLink, AlertCircle, Globe, Rocket, MessageSquare } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [publishMessage, setPublishMessage] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

  const { data: statusData, isLoading } = useQuery({
    queryKey: ['devServerStatus'],
    queryFn: () => getDevServerStatus(),
    refetchInterval: 5000,
  })

  const { data: customerData } = useQuery({
    queryKey: ['customerProfile'],
    queryFn: getCustomerProfile,
  })

  const { data: publishStatusData, refetch: refetchPublishStatus } = useQuery({
    queryKey: ['publishStatus'],
    queryFn: getPublishStatus,
  })

  const { data: sessionsData } = useQuery({
    queryKey: ['chatSessions'],
    queryFn: () => getChatSessions(),
  })

  const startMutation = useMutation({
    mutationFn: () => startDevServer(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devServerStatus'] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: () => stopDevServer(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devServerStatus'] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: publishSite,
    onSuccess: (data) => {
      setPublishError(null)
      setPublishMessage(data.message || 'Your changes are now live! It may take a minute to update.')
      refetchPublishStatus()
    },
    onError: (error: unknown) => {
      setPublishMessage(null)
      setPublishError(error instanceof Error ? error.message : 'Failed to publish changes')
    },
  })

  const status = statusData?.status === 'not_started' ? null : (statusData?.status as DevServerStatus | undefined)
  const isRunning = status?.status === 'running'
  const isStarting = status?.status === 'starting'
  const stagingUrl = customerData?.customer?.stagingUrl || null

  const handleStart = () => {
    startMutation.mutate()
  }

  const handleStop = () => {
    stopMutation.mutate()
  }

  const handlePublish = () => {
    const confirmed = window.confirm('Are you sure you want to publish these changes?')
    if (!confirmed) return
    publishMutation.mutate()
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  return (
    <RequireAuth>
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>Welcome back, {session?.user?.email}!</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Debug info removed */}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Preview on staging and publish to live</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="secondary"
                disabled={!stagingUrl}
                asChild={!!stagingUrl}
              >
                {stagingUrl ? (
                  <a href={`https://${stagingUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    View Staging Site
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Staging URL not set
                  </span>
                )}
              </Button>

              <Button
                onClick={handlePublish}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Publish to Live Site
                  </>
                )}
              </Button>
            </div>

            <div className="text-xs text-stone-600 dark:text-stone-400">
              {publishStatusData?.lastPublish
                ? `Last publish: ${new Date(publishStatusData.lastPublish.timestamp).toLocaleString()}`
                : 'No previous publishes'}
            </div>
          </CardContent>
          {(publishMessage || publishError) && (
            <div className="px-6 pb-4">
              <Alert variant={publishError ? 'destructive' : undefined}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{publishError || publishMessage}</AlertDescription>
              </Alert>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Development Server</CardTitle>
            <CardDescription>Manage your local development server for testing changes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">Status:</span>
                      {isRunning ? (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm font-medium">
                          Running
                        </span>
                      ) : isStarting ? (
                        <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-sm font-medium flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Starting...
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded text-sm font-medium">
                          Stopped
                        </span>
                      )}
                    </div>
                    {status?.port && (
                      <div className="mt-2 text-sm text-stone-600 dark:text-stone-400 space-y-1">
                        <div>Port: {status.port}</div>
                        <div className="mt-1">
                          URL:{' '}
                          <a
                            href={stagingUrl ? `https://${stagingUrl}` : `http://localhost:${status.port}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {stagingUrl ? `https://${stagingUrl}` : `http://localhost:${status.port}`}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        {status.startedAt && (
                          <div className="mt-1 text-xs">
                            Started: {formatDate(status.startedAt)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!isRunning && !isStarting && (
                      <Button onClick={handleStart} disabled={startMutation.isPending}>
                        {startMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Start Server
                          </>
                        )}
                      </Button>
                    )}
                    {isRunning && (
                      <Button
                        onClick={handleStop}
                        variant="destructive"
                        disabled={stopMutation.isPending}
                      >
                        {stopMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Stopping...
                          </>
                        ) : (
                          <>
                            <Square className="mr-2 h-4 w-4" />
                            Stop Server
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {startMutation.isError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {startMutation.error instanceof Error
                        ? startMutation.error.message
                        : 'Failed to start dev server'}
                    </AlertDescription>
                  </Alert>
                )}

                {stopMutation.isError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {stopMutation.error instanceof Error
                        ? stopMutation.error.message
                        : 'Failed to stop dev server'}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[40vh]">
          <CardHeader>
            <CardTitle>Latest Chats</CardTitle>
            <CardDescription>Recent conversations with the AI assistant</CardDescription>
          </CardHeader>
          <CardContent>
            {sessionsData?.sessions && sessionsData.sessions.length > 0 ? (
              <div className="space-y-2">
                {sessionsData.sessions.slice(0, 5).map((session) => (
                  <Link
                    key={session.id}
                    to="/chat"
                    search={{ sessionId: session.id }}
                    className="flex items-center justify-between p-3 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-stone-900 dark:text-stone-100">
                        {session.title || 'New Chat'}
                      </p>
                      <p className="text-xs text-stone-500 truncate">
                        {new Date(session.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-stone-400 group-hover:text-primary transition-colors" />
                  </Link>
                ))}
                <div className="pt-2">
                  <Button variant="outline" className="w-full" asChild>
                    <Link to="/chat">View All Chats</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-stone-500">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No chats yet</p>
                <Button variant="link" asChild className="mt-2">
                  <Link to="/chat">Start a new chat</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequireAuth>
  )
}
