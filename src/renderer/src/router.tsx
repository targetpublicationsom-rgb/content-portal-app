import { createHashRouter } from 'react-router-dom'
import Layout from './layouts/Layout'
import Dashboard from './components/Dashboard'
import Jobs from './components/Jobs'
import JobDetails from './components/JobDetails'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import QCDashboard from './components/qc/QCDashboard'
import QCFileList from './components/qc/QCFileList'
import QCSettings from './components/qc/QCSettings'
import NumberingChecker from './components/NumberingChecker'


// Use HashRouter for better Electron compatibility
export const router = createHashRouter([
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
      },
      {
        path: '/qc',
        element: <QCDashboard />
      },
      {
        path: '/qc/files',
        element: <QCFileList />
      },
      {
        path: '/qc/settings',
        element: <QCSettings />
      },
      {
        path: '/numbering-checker',
        element: <NumberingChecker />
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
])
