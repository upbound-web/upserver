const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers: HeadersInit = {
    ...options.headers,
    'Content-Type': 'application/json',
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export async function publishSite(): Promise<{ success: boolean; message: string; commitHash?: string; warning?: string }> {
  return fetchWithAuth('/api/publish', { method: 'POST' })
}

export async function getPublishStatus(): Promise<{ lastPublish?: { commitHash: string; timestamp: number; message: string } }> {
  return fetchWithAuth('/api/publish/status')
}





