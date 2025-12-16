const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export interface DevServerStatus {
  customerId: string
  port: number | null
  pid: number | null
  status: 'stopped' | 'starting' | 'running'
  startedAt: string | null
  lastActivity: string | null
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
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

export async function getDevServerStatus(): Promise<{ status: DevServerStatus | 'not_started' }> {
  return fetchWithAuth('/api/devserver/status')
}

export async function startDevServer(): Promise<{
  port: number
  url: string
  status: string
}> {
  return fetchWithAuth('/api/devserver/start', {
    method: 'POST',
  })
}

export async function stopDevServer(): Promise<{ status: string }> {
  return fetchWithAuth('/api/devserver/stop', {
    method: 'POST',
  })
}





