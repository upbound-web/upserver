const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

function appendUserId(url: string, userId?: string | null): string {
  if (!userId) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}userId=${encodeURIComponent(userId)}`
}

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

export async function publishSite(userId?: string | null): Promise<{ success: boolean; message: string; commitHash?: string; warning?: string }> {
  return fetchWithAuth(appendUserId('/api/publish', userId), { method: 'POST' })
}

export async function getPublishStatus(userId?: string | null): Promise<{ lastPublish?: { commitHash: string; timestamp: number; message: string } }> {
  return fetchWithAuth(appendUserId('/api/publish/status', userId))
}

export interface PublishHistoryItem {
  commitHash: string
  timestamp: number
  message: string
}

export async function getPublishHistory(userId?: string | null): Promise<{ history: PublishHistoryItem[] }> {
  return fetchWithAuth(appendUserId('/api/publish/history', userId))
}

export async function rollbackToCommit(
  commitHash: string,
  userId?: string | null
): Promise<{ success: boolean; message: string; commitHash?: string; rolledBackTo?: string }> {
  return fetchWithAuth(appendUserId('/api/publish/rollback', userId), {
    method: 'POST',
    body: JSON.stringify({ commitHash }),
  })
}
