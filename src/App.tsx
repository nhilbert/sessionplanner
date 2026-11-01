import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import AppShell from './components/AppShell'
import WorkshopsPage from './pages/WorkshopsPage'
import PlannerPage from './pages/PlannerPage'
import PrintPage from './pages/PrintPage'
import SettingsPage from './pages/SettingsPage'
import LibraryPage from './pages/LibraryPage'
import DecksPage from './pages/DecksPage'
import PresentPage from './pages/PresentPage'
import PresenterPage from './pages/PresenterPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <WorkshopsPage /> },
      { path: 'w/:id', element: <PlannerPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'library/decks', element: <DecksPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '/w/:id/print/:variant', element: <PrintPage /> },
  { path: '/w/:id/present', element: <PresentPage /> },
  { path: '/w/:id/presenter', element: <PresenterPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
