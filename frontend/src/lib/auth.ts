import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BACKEND_URL || "http://localhost:4000",
  basePath: "/api/auth",
  plugins: [emailOTPClient()],
})

export const { useSession, signIn, signOut } = authClient
