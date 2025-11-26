import axios from 'axios'

const apiBase = import.meta.env.VITE_API_BASE || 'https://staging.targetcontent.in/api/v1'

export const api = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': import.meta.env.VITE_API_KEY || ''
  },
  timeout: 10000
})

// Request interceptor - add JWT token
api.interceptors.request.use(
  async (config) => {
    // Skip token for auth endpoints
    if (config.url?.includes('/auth/login') || config.url?.includes('/auth/logout')) {
      return config
    }

    // Get token from main process
    try {
      const token = await window.api.getAuthToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (error) {
      console.error('Failed to get auth token:', error)
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true
      // Clear both localStorage and encrypted token
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user')
      await window.api.clearAuthToken()
      window.location.hash = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
