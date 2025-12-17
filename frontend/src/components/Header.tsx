import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Home, Menu, X, LogOut, User, LayoutDashboard, MessageSquare, Settings, Play, Square, ExternalLink, Loader2 } from 'lucide-react'
import { useSession, authClient } from '@/lib/auth'
import { getDevServerStatus, startDevServer, stopDevServer } from '@/lib/devserver-api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  const { data: serverStatusData, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['devServerStatus'],
    queryFn: getDevServerStatus,
    enabled: !!session?.user,
    refetchInterval: 5000,
  })

  const startServerMutation = useMutation({
    mutationFn: startDevServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devServerStatus'] })
    },
  })

  const stopServerMutation = useMutation({
    mutationFn: stopDevServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devServerStatus'] })
    },
  })

  const handleSignOut = async () => {
    await authClient.signOut()
    window.location.href = '/sign-in'
  }

  const getUserInitials = (email: string) => {
    return email.slice(0, 2).toUpperCase()
  }

  const status = serverStatusData?.status
  const isRunning = typeof status !== 'string' && status?.status === 'running'
  const isStarting = typeof status !== 'string' && status?.status === 'starting'
  const serverPort = typeof status !== 'string' ? status?.port : null

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-gray-800 text-white shadow-lg">
        <div className="flex items-center">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <h1 className="ml-4 text-xl font-semibold">
            <Link to="/">
              <span className="text-xl font-bold tracking-tight">UpServer</span>
            </Link>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {session?.user && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-stone-800 border-stone-600 hover:bg-stone-100"
                onClick={() => {
                  if (serverPort) {
                    window.open(`http://localhost:${serverPort}`, '_blank')
                  }
                }}
                disabled={!isRunning || !serverPort}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Staging Site
              </Button>

              {isRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => stopServerMutation.mutate()}
                  disabled={stopServerMutation.isPending}
                >
                  {stopServerMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  Stop Server
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => startServerMutation.mutate()}
                  disabled={startServerMutation.isPending || isStarting}
                >
                  {(startServerMutation.isPending || isStarting) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {isStarting ? 'Starting...' : 'Start Server'}
                </Button>
              )}
            </div>
          )}

          {/* User Profile Dropdown */}
          {session?.user && (
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-10 w-10 rounded-full hover:bg-gray-700"
              >
                <Avatar>
                  <AvatarFallback className="bg-stone-700">
                    {getUserInitials(session.user.email)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {session.user.name || 'User'}
                  </p>
                  <p className="text-xs text-stone-500">{session.user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>

        {/* Sign In Button (when not authenticated) */}
        {!session?.user && (
          <Link to="/sign-in">
            <Button variant="secondary" size="sm">
              <User className="mr-2 h-4 w-4" />
              Sign In
            </Button>
          </Link>
        )}
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {/* Auth-Protected Links */}
          {session?.user && (
            <>
              <Link
                to="/dashboard"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                  className:
                    'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
                }}
              >
                <LayoutDashboard size={20} />
                <span className="font-medium">Dashboard</span>
              </Link>
              <Link
                to="/chat"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                  className:
                    'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
                }}
              >
                <MessageSquare size={20} />
                <span className="font-medium">Chat</span>
              </Link>
              {/* @ts-ignore - Role might not be typed yet */}
              {session.user.role === 'admin' && (
                <Link
                  to="/admin"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                  activeProps={{
                    className:
                      'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
                  }}
                >
                  <Settings size={20} />
                  <span className="font-medium">Admin</span>
                </Link>
              )}
            </>
          )}
        </nav>
      </aside>
    </>
  )
}
