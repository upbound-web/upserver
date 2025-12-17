import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useSession } from '@/lib/auth'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return null
  }

  if (session?.user) {
    return <Navigate to="/chat" />
  }

  return <Navigate to="/sign-in" />
}
