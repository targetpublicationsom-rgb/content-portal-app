import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Temporary bypass: allow access even without auth token
  // Remove this when login API is fixed and enforced again
  const token = localStorage.getItem('auth_token')

  if (!token) {
    return <>{children}</>
  }

  return <>{children}</>
}
