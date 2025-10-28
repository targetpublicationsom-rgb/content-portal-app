import { createHashRouter } from 'react-router-dom'
import Layout from './layouts/Layout'
import Dashboard from './components/Dashboard'
import Jobs from './components/Jobs'
import JobDetails from './components/JobDetails'

// Use HashRouter for better Electron compatibility
export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        path: '/',
        element: <Dashboard />
      },
      {
        path: '/jobs',
        element: <Jobs />
      }
    ]
  },
  {
    path: '/jobs/:jobId',
    element: <JobDetails />
  }
])
