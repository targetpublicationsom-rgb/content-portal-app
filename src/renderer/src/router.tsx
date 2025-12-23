import { createHashRouter, Navigate } from 'react-router-dom'
import Layout from './layouts/Layout'

import JobDetails from './components/JobDetails'
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import QCDashboard from './components/qc/QCDashboard'
import QCFileList from './components/qc/QCFileList'
import QCBatchList from './components/qc/QCBatchList'
import QCSettings from './components/qc/QCSettings'
import NumberingChecker from './components/NumberingChecker'
import UploaderDashboard from './components/uploader/UploaderDashboard'
import UploaderJobs from './components/uploader/UploaderJobs'
import DocsFormatter from './components/DocsFormatter'

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
        element: <Navigate to="/uploader" replace />
      },
      // Question Uploader module routes
      {
        path: '/uploader',
        element: <UploaderDashboard />
      },
      {
        path: '/uploader/jobs',
        element: <UploaderJobs />
      },

      // QC module routes
      {
        path: '/qc',
        element: <QCDashboard />
      },
      {
        path: '/qc/files',
        element: <QCFileList />
      },
      {
        path: '/qc/batches',
        element: <QCBatchList />
      },
      {
        path: '/qc/settings',
        element: <QCSettings />
      },
      {
        path: '/numbering-checker',
        element: <NumberingChecker />
      },
      {
        path: '/docs-formatter',
        element: <DocsFormatter />
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

