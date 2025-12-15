const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export interface CustomerProfile {
  id: string
  name: string
  siteFolder: string
  stagingUrl: string | null
  stagingPort: number | null
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



