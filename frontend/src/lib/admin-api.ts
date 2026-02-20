const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

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
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

// ========== Sites (Customers) ==========

export interface Site {
  id: string
  userId: string
  name: string
  siteFolder: string
  stagingUrl: string | null
  githubRepo: string | null
  stagingPort: number | null
  createdAt: number
  updatedAt: number
  user: {
    id: string
    name: string
    email: string
  }
}

export async function getSites(): Promise<{ sites: Site[] }> {
  return fetchWithAuth('/api/admin/sites')
}

export async function getSite(id: string): Promise<{ site: Site }> {
  return fetchWithAuth(`/api/admin/sites/${id}`)
}

export interface CreateSiteData {
  userId: string
  name: string
  siteFolder: string
  stagingUrl?: string
  githubRepo?: string
  stagingPort?: number
}

export async function createSite(data: CreateSiteData): Promise<{ site: Site }> {
  return fetchWithAuth('/api/admin/sites', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export interface UpdateSiteData {
  name?: string
  siteFolder?: string
  stagingUrl?: string
  githubRepo?: string
  stagingPort?: number
  userId?: string
}

export async function updateSite(id: string, data: UpdateSiteData): Promise<{ site: Site }> {
  return fetchWithAuth(`/api/admin/sites/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteSite(id: string): Promise<{ message: string }> {
  return fetchWithAuth(`/api/admin/sites/${id}`, {
    method: 'DELETE',
  })
}

export async function addUserToSite(siteId: string, userId: string): Promise<{ site: Site }> {
  return fetchWithAuth(`/api/admin/sites/${siteId}/users`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

// ========== Users ==========

export interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: 'user' | 'admin'
  image: string | null
  createdAt: number
  updatedAt: number
}

export interface UserWithSites extends User {
  sites: Array<{
    id: string
    name: string
    siteFolder: string
    stagingUrl: string | null
    githubRepo: string | null
    stagingPort: number | null
  }>
}

export async function getUsers(): Promise<{ users: User[] }> {
  return fetchWithAuth('/api/admin/users')
}

export async function getUser(id: string): Promise<{ user: UserWithSites }> {
  return fetchWithAuth(`/api/admin/users/${id}`)
}

export interface CreateUserData {
  name: string
  email: string
  role?: 'user' | 'admin'
}

export async function createUser(data: CreateUserData): Promise<{ user: User }> {
  return fetchWithAuth('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export interface UpdateUserData {
  name?: string
  email?: string
  role?: 'user' | 'admin'
  emailVerified?: boolean
}

export async function updateUser(id: string, data: UpdateUserData): Promise<{ user: User }> {
  return fetchWithAuth(`/api/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ========== Review Requests / Quotes ==========

export interface AdminReview {
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
  policyVersion: string
  createdAt: string
  updatedAt: string
  customer: {
    id: string
    name: string
    userId: string
  } | null
  user: {
    id: string
    name: string
    email: string
  } | null
}

export async function getAdminReviews(): Promise<{ reviews: AdminReview[] }> {
  return fetchWithAuth('/api/admin/reviews')
}

export async function quoteAdminReview(
  id: string,
  payload: { priceAud: number; note?: string }
): Promise<{ review: AdminReview }> {
  return fetchWithAuth(`/api/admin/reviews/${id}/quote`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function updateAdminReviewStatus(
  id: string,
  status: AdminReview['status']
): Promise<{ review: AdminReview }> {
  return fetchWithAuth(`/api/admin/reviews/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

// ========== AI Configuration ==========

export interface AiConfig {
  model: string
  fileCheckpointing: boolean
  plugins: Array<{
    name: string
    version: string
    skills: string[]
  }>
}

export async function getAiConfig(): Promise<AiConfig> {
  return fetchWithAuth('/api/admin/ai-config')
}


