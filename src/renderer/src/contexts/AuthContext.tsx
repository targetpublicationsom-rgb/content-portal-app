import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../lib/axios'

interface User {
  id: string
  email: string
  name: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load token from main process on mount
  useEffect(() => {
    const loadAuth = async (): Promise<void> => {
      try {
        const storedToken = await window.api.getAuthToken()
        if (storedToken) {
          setToken(storedToken)
          // Validate token by fetching user info
          await validateToken(storedToken)
        } else {
          // No token found, ensure we're on login page
          if (window.location.hash !== '#/login') {
            window.location.hash = '/login'
          }
        }
      } catch (error) {
        console.error('Failed to load auth:', error)
        await window.api.clearAuthToken()
        // Redirect to login on error
        if (window.location.hash !== '#/login') {
          window.location.hash = '/login'
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadAuth()
  }, [])

  // Validate token and fetch user data
  const validateToken = async (authToken: string): Promise<void> => {
    try {
      const response = await api.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      })
      setUser(response.data)
    } catch (error) {
      // Token invalid, clear it
      setToken(null)
      setUser(null)
      await window.api.clearAuthToken()
      throw error
    }
  }

  const login = async (email: string, password: string): Promise<void> => {
    try {
      const response = await api.post('/auth/login', { email, password })
      const { token: newToken, user: userData } = response.data

      setToken(newToken)
      setUser(userData)

      // Store token securely in main process
      await window.api.storeAuthToken(newToken)

      // Navigate to dashboard
      window.location.hash = '/'
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed'
      throw new Error(message)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      // Call logout endpoint if token exists
      if (token) {
        await api.post(
          '/auth/logout',
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )
      }
    } catch (error) {
      console.error('Logout API call failed:', error)
    } finally {
      // Clear local state regardless of API call result
      setToken(null)
      setUser(null)
      await window.api.clearAuthToken()
      
      // Navigate to login
      window.location.hash = '/login'
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
