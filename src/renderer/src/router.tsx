import { createBrowserRouter } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import JobDetails from './components/JobDetails'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Dashboard />
  },
  {
    path: '/jobs/:jobId',
    element: <JobDetails />
  }
])