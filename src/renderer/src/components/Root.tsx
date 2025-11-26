import { Outlet } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'

export default function Root(): React.JSX.Element {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}
