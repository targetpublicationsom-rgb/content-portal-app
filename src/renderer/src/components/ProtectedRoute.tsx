import { Navigate } from 'react-router-dom'

const TOKEN_EXPIRY_DAYS = 7

// Helper to check if token is valid (not expired)
function getValidToken(): string | null {
  const tokenDataStr = localStorage.getItem('auth_token_data')

  if (!tokenDataStr) {
    // Check for legacy token format
    const legacyToken = localStorage.getItem('auth_token')
    if (legacyToken) {
      // Migrate legacy token - clear it and require re-login
      localStorage.removeItem('auth_token')
      return null
    }
    return null
  }

  try {
    const tokenData = JSON.parse(tokenDataStr)
    const expiryMs = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    const tokenAge = Date.now() - tokenData.storedAt

    if (tokenAge > expiryMs) {
      // Token has expired, clear it
      localStorage.removeItem('auth_token_data')
      localStorage.removeItem('user')
      window.api.clearAuthToken()
      return null
    }

    return tokenData.token
  } catch {
    // Invalid token data format
    localStorage.removeItem('auth_token_data')
    return null
  }
}

export default function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const token = getValidToken()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
