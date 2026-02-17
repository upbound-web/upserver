const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export interface CustomerProfile {
  id: string
  name: string
  siteFolder: string
  stagingUrl: string | null
  stagingPort: number | null
}

export interface ReviewRequest {
  id: string
  customerId: string
  sessionId: string
  requestContent: string
  decision: 'auto' | 'flag'
  scope: 'minor' | 'major' | 'uncertain'
  confidencePct: number
  reason: string
  triggers: string | null
  quotedPriceCents: number | null
  quoteNote: string | null
  quotedAt: string | null
  approvedAt: string | null
  status: 'open' | 'quoted' | 'approved' | 'rejected' | 'completed'
  createdAt: string
  updatedAt: string
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export async function getCustomerProfile(): Promise<{ customer: CustomerProfile }> {
  return fetchWithAuth('/api/customer/me')
}

export async function getCustomerReviewRequests(): Promise<{ reviewRequests: ReviewRequest[] }> {
  return fetchWithAuth('/api/customer/review-requests')
}

export async function approveReviewRequest(
  id: string
): Promise<{ reviewRequest: ReviewRequest }> {
  return fetchWithAuth(`/api/customer/review-requests/${id}/approve`, {
    method: 'POST',
  })
}




