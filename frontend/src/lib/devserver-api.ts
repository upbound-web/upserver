const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export interface DevServerStatus {
  customerId: string
  port: number | null
  pid: number | null
  status: 'stopped' | 'starting' | 'running'
  startedAt: string | null
  lastActivity: string | null
}

export interface DevServerPreflight {
  checks: {
    siteFolderExists: boolean
    devServerHealthy: boolean
    stagingUrlConfigured: boolean
    gitRemoteConfigured: boolean
    hasUncommittedChanges: boolean
    claudeReady: boolean
  }
  sitePath: string
  status: DevServerStatus | null
}

/**
 * Helper to append userId query param to URL if provided
 */
function appendUserIdParam(url: string, userId?: string | null): string {
  if (!userId) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}userId=${encodeURIComponent(userId)}`
}

async function fetchWithAuth(url: string, options: RequestInit = {}, userId?: string | null) {
  // Append userId query param if provided
  const finalUrl = appendUserIdParam(url, userId)
  
  const response = await fetch(`${API_BASE_URL}${finalUrl}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export async function getDevServerStatus(userId?: string | null): Promise<{ status: DevServerStatus | 'not_started' }> {
  return fetchWithAuth('/api/devserver/status', {}, userId)
}

export async function startDevServer(userId?: string | null): Promise<{
  port: number
  url: string
  status: string
}> {
  return fetchWithAuth('/api/devserver/start', {
    method: 'POST',
  }, userId)
}

export async function getDevServerPreflight(
  userId?: string | null
): Promise<DevServerPreflight> {
  return fetchWithAuth('/api/devserver/preflight', {}, userId)
}

export async function stopDevServer(userId?: string | null): Promise<{ status: string }> {
  return fetchWithAuth('/api/devserver/stop', {
    method: 'POST',
  }, userId)
}




