import { createHashRouter } from 'react-router-dom'
import Layout from './layouts/Layout'
import Dashboard from './components/Dashboard'
import Jobs from './components/Jobs'
import JobDetails from './components/JobDetails'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import Root from './components/Root'

// Use HashRouter for better Electron compatibility
export const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      {
        path: '/login',
        element: <Login />
      },
      {
        path: '/',
        element: (
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        ),
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
        element: (
          <ProtectedRoute>
            <JobDetails />
          </ProtectedRoute>
        )
      }
    ]
  }
])
