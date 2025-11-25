import { createHashRouter } from 'react-router-dom'
import Layout from './layouts/Layout'
import Dashboard from './components/Dashboard'
import Jobs from './components/Jobs'
import JobDetails from './components/JobDetails'
import FileWatcher from './components/FileWatcher'
import QCDashboard from './components/qc/QCDashboard'
import QCFileList from './components/qc/QCFileList'

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
      },
      {
        path: '/file-watcher',
        element: <FileWatcher />
      },
      {
        path: '/qc',
        element: <QCDashboard />
      },
      {
        path: '/qc/files',
        element: <QCFileList />
      }
    ]
  },
  {
    path: '/jobs/:jobId',
    element: <JobDetails />
  }
])
