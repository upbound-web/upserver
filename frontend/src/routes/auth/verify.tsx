import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { z } from 'zod'

const verifySearchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/auth/verify')({
  validateSearch: verifySearchSchema,
  component: VerifyPage,
})

function VerifyPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const verifyToken = async () => {
      // Check for error in URL params first
      if (search.error) {
        setStatus('error')
        setErrorMessage(search.error)
        return
      }

      // Check for token
      if (!search.token) {
        setStatus('error')
        setErrorMessage('No verification token provided')
        return
      }

      // Better Auth automatically handles verification via the URL
      // Just check if session was established
      try {
        // Small delay to allow Better Auth to process the token
        await new Promise((resolve) => setTimeout(resolve, 500))

        // Check if session exists
        const session = await authClient.getSession()

        if (session.data) {
          setStatus('success')
          setTimeout(() => {
            navigate({ to: '/dashboard' })
          }, 1000)
        } else {
          setStatus('error')
          setErrorMessage('Failed to establish session')
        }
      } catch (err) {
        setStatus('error')
        setErrorMessage('Verification failed')
      }
    }

    verifyToken()
  }, [search, navigate])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verifying Magic Link</CardTitle>
          <CardDescription>
            Please wait while we verify your login
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' && (
            <div className="flex items-center gap-3 text-stone-600 dark:text-stone-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Verifying your magic link...</span>
            </div>
          )}

          {status === 'success' && (
            <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Successfully verified! Redirecting to dashboard...
              </AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorMessage || 'An error occurred during verification'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
