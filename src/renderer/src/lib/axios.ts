import axios from 'axios'

const apiBase = import.meta.env.VITE_API_BASE || 'https://staging.targetcontent.in/api/v1'

export const api = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': import.meta.env.VITE_API_KEY || ''

  },
  // Add default timeout
  timeout: 10000
})

export default api
