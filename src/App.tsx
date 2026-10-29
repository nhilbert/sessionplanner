import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import AppShell from './components/AppShell'
import WorkshopsPage from './pages/WorkshopsPage'
import PlannerPage from './pages/PlannerPage'
import PrintPage from './pages/PrintPage'
import SettingsPage from './pages/SettingsPage'
import LibraryPage from './pages/LibraryPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <WorkshopsPage /> },
      { path: 'w/:id', element: <PlannerPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '/w/:id/print/:variant', element: <PrintPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
