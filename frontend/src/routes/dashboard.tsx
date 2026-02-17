import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useSession } from '@/lib/auth'
import { RequireAuth } from '@/lib/route-guards'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDevServerStatus,
  getDevServerPreflight,
  startDevServer,
  stopDevServer,
  type DevServerStatus,
} from '@/lib/devserver-api'
import { publishSite, getPublishHistory, getPublishStatus, rollbackToCommit } from '@/lib/publish-api'
import { approveReviewRequest, getCustomerProfile, getCustomerReviewRequests } from '@/lib/customer-api'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [publishMessage, setPublishMessage] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null)
  const [selectedRollbackCommit, setSelectedRollbackCommit] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [startPendingMs, setStartPendingMs] = useState(0)

  const { data: statusData, isLoading } = useQuery({
    queryKey: ['devServerStatus'],
    queryFn: () => getDevServerStatus(),
    refetchInterval: 5000,
  })

  const { data: preflightData } = useQuery({
    queryKey: ['devServerPreflight'],
    queryFn: () => getDevServerPreflight(),
    refetchInterval: 15000,
  })

  const { data: customerData } = useQuery({
    queryKey: ['customerProfile'],
    queryFn: getCustomerProfile,
  })

  const { data: publishStatusData, refetch: refetchPublishStatus } = useQuery({
    queryKey: ['publishStatus'],
    queryFn: getPublishStatus,
  })

  const { data: publishHistoryData, refetch: refetchPublishHistory } = useQuery({
    queryKey: ['publishHistory'],
    queryFn: getPublishHistory,
  })

  const { data: reviewRequestsData } = useQuery({
    queryKey: ['customerReviewRequests'],
    queryFn: getCustomerReviewRequests,
    refetchInterval: 10000,
  })

  const { data: sessionsData } = useQuery({
    queryKey: ['chatSessions'],
    queryFn: () => getChatSessions(),
  })

  const startMutation = useMutation({
    mutationFn: () => startDevServer(),
    onSuccess: () => {
      setStartPendingMs(0)
      queryClient.invalidateQueries({ queryKey: ['devServerStatus'] })
      queryClient.invalidateQueries({ queryKey: ['devServerPreflight'] })
    },
    onError: () => {
      setStartPendingMs(0)
    },
  })

  const stopMutation = useMutation({
    mutationFn: () => stopDevServer(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devServerStatus'] })
      queryClient.invalidateQueries({ queryKey: ['devServerPreflight'] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: publishSite,
    onSuccess: (data) => {
      setPublishError(null)
      setPublishMessage(data.message || 'Your changes are now live! It may take a minute to update.')
      refetchPublishStatus()
      refetchPublishHistory()
    },
    onError: (error: unknown) => {
      setPublishMessage(null)
      setPublishError(error instanceof Error ? error.message : 'Failed to publish changes')
    },
  })

  const rollbackMutation = useMutation({
    mutationFn: (commitHash: string) => rollbackToCommit(commitHash),
    onSuccess: (data) => {
      setRollbackError(null)
      setRollbackSuccess(data.message || 'Rollback completed.')
      refetchPublishStatus()
      refetchPublishHistory()
      queryClient.invalidateQueries({ queryKey: ['devServerPreflight'] })
    },
    onError: (error: unknown) => {
      setRollbackSuccess(null)
      setRollbackError(error instanceof Error ? error.message : 'Failed to roll back')
    },
  })

  const approveQuoteMutation = useMutation({
    mutationFn: (id: string) => approveReviewRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerReviewRequests'] })
    },
  })

  const status = statusData?.status === 'not_started' ? null : (statusData?.status as DevServerStatus | undefined)
  const isRunning = status?.status === 'running'
  const isStarting = status?.status === 'starting'
  const stagingUrl = customerData?.customer?.stagingUrl || null
  const reviewRequests = reviewRequestsData?.reviewRequests || []
  const quotedRequests = reviewRequests.filter((request) => request.status === 'quoted')

  const onboardingKey = useMemo(() => {
    const userId = session?.user?.id
    return userId ? `upserver-onboarding-v1:${userId}` : null
  }, [session?.user?.id])

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

  const handleRollback = (commitHash: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to roll back to this version? This will create a new rollback commit and publish it.'
    )
    if (!confirmed) return
    setRollbackError(null)
    setRollbackSuccess(null)
    setSelectedRollbackCommit(commitHash)
    rollbackMutation.mutate(commitHash)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const getFriendlyStartError = (raw: string) => {
    const lower = raw.toLowerCase()
    if (lower.includes('site folder not found')) {
      return 'We couldn’t find your website files on the server yet. Please contact support and we’ll sort it quickly.'
    }
    if (lower.includes('configured port') && lower.includes('in use')) {
      return 'Your staging server port is already in use right now. Give it a minute and try again, or contact support.'
    }
    if (lower.includes('dependency install failed')) {
      return 'Your site needs a quick dependency setup before staging can run. Please contact support and we’ll fix it.'
    }
    if (lower.includes('no free ports')) {
      return 'Staging is currently at capacity. Please try again shortly.'
    }
    return 'The staging server couldn’t start right now. Please try again, and if it keeps happening, contact support.'
  }

  useEffect(() => {
    if (!onboardingKey) return
    const alreadySeen = localStorage.getItem(onboardingKey)
    setShowOnboarding(!alreadySeen)
  }, [onboardingKey])

  useEffect(() => {
    if (!startMutation.isPending) return
    const interval = window.setInterval(() => {
      setStartPendingMs((ms) => ms + 1000)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [startMutation.isPending])

  const startPhase = useMemo(() => {
    if (!startMutation.isPending) return null
    if (startPendingMs < 4_000) return 'Preparing your staging server...'
    if (startPendingMs < 25_000) return 'Installing dependencies if needed...'
    return 'Starting your website preview...'
  }, [startMutation.isPending, startPendingMs])

  return (
    <RequireAuth>
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Welcome to UpServer</DialogTitle>
            <DialogDescription>
              Quick heads up: this is your spot to run staging, ask for edits, and publish changes when you’re happy.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-stone-700 dark:text-stone-300 space-y-2">
            <p>1. Start your staging server</p>
            <p>2. Ask for updates in chat using plain English</p>
            <p>3. Preview in staging, then publish when ready</p>
            <p>4. Bigger jobs get flagged and quoted in-app</p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (onboardingKey) localStorage.setItem(onboardingKey, 'seen')
                setShowOnboarding(false)
              }}
            >
              Sweet, let’s go
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <CardTitle>Staging Readiness</CardTitle>
            <CardDescription>Quick checks before you hit start</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {preflightData ? (
              <>
                <div>Site files present: {preflightData.checks.siteFolderExists ? 'Yes' : 'No'}</div>
                <div>Staging URL configured: {preflightData.checks.stagingUrlConfigured ? 'Yes' : 'No'}</div>
                <div>Git remote connected: {preflightData.checks.gitRemoteConfigured ? 'Yes' : 'No'}</div>
                <div>AI editing ready: {preflightData.checks.claudeReady ? 'Yes' : 'No'}</div>
                <div>Server healthy now: {preflightData.checks.devServerHealthy ? 'Yes' : 'No'}</div>
                <div>Local changes waiting to publish: {preflightData.checks.hasUncommittedChanges ? 'Yes' : 'No'}</div>
              </>
            ) : (
              <p>Checking readiness...</p>
            )}
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
                        ? getFriendlyStartError(startMutation.error.message)
                        : 'Couldn’t start staging right now.'}
                    </AlertDescription>
                  </Alert>
                )}

                {startMutation.isError &&
                  startMutation.error instanceof Error &&
                  (session?.user as { role?: string } | undefined)?.role === 'admin' && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Technical details (admin):</strong> {startMutation.error.message}
                      </AlertDescription>
                    </Alert>
                  )}

                {startPhase && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{startPhase}</AlertDescription>
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

        <Card>
          <CardHeader>
            <CardTitle>Bigger Jobs & Quotes</CardTitle>
            <CardDescription>
              Bigger requests land here so you can track updates and approve quotes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewRequests.length === 0 ? (
              <p className="text-sm text-stone-600 dark:text-stone-400">No flagged jobs at the moment.</p>
            ) : (
              reviewRequests.slice(0, 6).map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-stone-200 dark:border-stone-800 p-3 space-y-2"
                >
                  <p className="text-sm line-clamp-2">{request.requestContent}</p>
                  <div className="text-xs text-stone-500">
                    Status: <strong>{request.status}</strong>
                  </div>
                  {request.quotedPriceCents !== null && (
                    <div className="text-sm font-medium">
                      Quote:{' '}
                      {new Intl.NumberFormat('en-AU', {
                        style: 'currency',
                        currency: 'AUD',
                      }).format(request.quotedPriceCents / 100)}
                    </div>
                  )}
                  {request.quoteNote && (
                    <p className="text-xs text-stone-600 dark:text-stone-300">{request.quoteNote}</p>
                  )}
                  {request.status === 'quoted' && (
                    <Button
                      size="sm"
                      onClick={() => approveQuoteMutation.mutate(request.id)}
                      disabled={approveQuoteMutation.isPending}
                    >
                      {approveQuoteMutation.isPending ? 'Approving...' : 'Approve Quote'}
                    </Button>
                  )}
                </div>
              ))
            )}
            {quotedRequests.length > 0 && (
              <p className="text-xs text-stone-500">
                Nice one, you’ve got {quotedRequests.length} quote{quotedRequests.length > 1 ? 's' : ''} ready for approval.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rollback</CardTitle>
            <CardDescription>
              Revert to one of your last 10 versions if something doesn’t look right.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishHistoryData?.history?.length ? (
              publishHistoryData.history.map((item) => (
                <div
                  key={item.commitHash}
                  className="rounded-lg border border-stone-200 dark:border-stone-800 p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{item.message}</p>
                    <p className="text-xs text-stone-500">
                      {new Date(item.timestamp).toLocaleString()} • {item.commitHash.slice(0, 7)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRollback(item.commitHash)}
                    disabled={rollbackMutation.isPending}
                  >
                    {rollbackMutation.isPending && selectedRollbackCommit === item.commitHash
                      ? 'Rolling back...'
                      : 'Rollback'}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-400">No commit history available yet.</p>
            )}
            {(rollbackError || rollbackSuccess) && (
              <Alert variant={rollbackError ? 'destructive' : undefined}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{rollbackError || rollbackSuccess}</AlertDescription>
              </Alert>
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
