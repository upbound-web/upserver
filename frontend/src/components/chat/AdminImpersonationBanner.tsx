import { useNavigate } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { X, User } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getUsers } from '@/lib/admin-api'

interface AdminImpersonationBannerProps {
  userId: string
}

export function AdminImpersonationBanner({ userId }: AdminImpersonationBannerProps) {
  const navigate = useNavigate()

  // Fetch user info to display name
  const { data: usersData } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: getUsers,
  })

  const user = usersData?.users.find((u) => u.id === userId)

  const handleExit = () => {
    navigate({ to: '/chat', search: {} })
  }

  return (
    <Alert className="mb-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            Viewing as <strong>{user?.name || user?.email || 'User'}</strong>
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExit}
          className="text-blue-800 hover:text-blue-900 dark:text-blue-200 dark:hover:text-blue-100"
        >
          <X className="h-4 w-4 mr-1" />
          Exit View As
        </Button>
      </div>
    </Alert>
  )
}

