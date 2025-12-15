import { useNavigate } from '@tanstack/react-router'
import { useSession } from '@/lib/auth'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getUsers } from './admin-api'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isPending && !session?.user) {
      navigate({ to: '/sign-in' })
    }
  }, [session, isPending, navigate])

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-stone-600" />
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      navigate({ to: '/sign-in' })
      return
    }

    if (session?.user) {
      // Check if user is admin by trying to access admin endpoint
      getUsers()
        .then(() => {
          setIsAdmin(true)
          setIsChecking(false)
        })
        .catch(() => {
          setIsAdmin(false)
          setIsChecking(false)
        })
    }
  }, [session, sessionPending, navigate])

  if (sessionPending || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-stone-600" />
      </div>
    )
  }

  if (!session?.user || !isAdmin) {
    navigate({ to: '/dashboard' })
    return null
  }

  return <>{children}</>
}
