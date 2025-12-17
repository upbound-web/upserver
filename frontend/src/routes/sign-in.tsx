import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'

import { authClient, useSession } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

const codeSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric'),
})

type EmailForm = z.infer<typeof emailSchema>
type CodeForm = z.infer<typeof codeSchema>

function SignInPage() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [userEmail, setUserEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  })

  const codeForm = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  })

  // Redirect authenticated users to chat
  useEffect(() => {
    if (session?.user) {
      navigate({ to: '/chat' })
    }
  }, [session, navigate])

  const onEmailSubmit = async (values: EmailForm) => {
    setError(null)

    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email: values.email,
      type: 'sign-in',
    })

    if (otpError) {
      setError(otpError.message || 'Failed to send code')
      return
    }

    setUserEmail(values.email)
    setStep('code')
  }

  const onCodeSubmit = async (values: CodeForm) => {
    setError(null)

    const { error: verifyError } = await authClient.signIn.emailOtp({
      email: userEmail,
      otp: values.code,
    })

    if (verifyError) {
      setError(verifyError.message || 'Invalid code')
      return
    }

    // Success - redirect to chat
    navigate({ to: '/chat' })
  }

  const handleBackToEmail = () => {
    setStep('email')
    setError(null)
    codeForm.reset()
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Enter your email to receive a verification code'
              : 'Enter the 6-digit code sent to your email'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'email' ? (
            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="name@example.com"
                          {...field}
                          disabled={emailForm.formState.isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={emailForm.formState.isSubmitting}
                >
                  {emailForm.formState.isSubmitting ? (
                    <>Sending...</>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Code
                    </>
                  )}
                </Button>
              </form>
            </Form>
          ) : (
            <>
              <Alert className="mb-4 border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Code sent to <strong>{userEmail}</strong>
                  <br />
                  Check your console for the code (email not configured yet)
                </AlertDescription>
              </Alert>

              <Form {...codeForm}>
                <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Verification Code</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="123456"
                            maxLength={6}
                            className="text-center text-2xl tracking-widest"
                            {...field}
                            disabled={codeForm.formState.isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBackToEmail}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={codeForm.formState.isSubmitting}
                    >
                      {codeForm.formState.isSubmitting ? (
                        <>Verifying...</>
                      ) : (
                        <>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Verify
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
