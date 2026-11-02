import type { ReactNode } from 'react'
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
import ThemesPage from './pages/ThemesPage'
import TemplatesPage from './pages/TemplatesPage'
import { useSettings } from './store/useSettings'

/** The owner's pages (library, slides area): a guest who types their address lands on the workshops shared with them. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const owner = useSettings((s) => s.me.owner)
  return owner ? children : <Navigate to="/" replace />
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <WorkshopsPage /> },
      { path: 'w/:id', element: <PlannerPage /> },
      { path: 'library', element: <OwnerOnly><LibraryPage /></OwnerOnly> },
      // The slides area: what slides are made from – the pool, the templates, the themes (docs/slides.md, section 7).
      { path: 'slides', element: <Navigate to="/slides/pool" replace /> },
      { path: 'slides/pool', element: <OwnerOnly><DecksPage /></OwnerOnly> },
      { path: 'slides/templates', element: <OwnerOnly><TemplatesPage /></OwnerOnly> },
      { path: 'slides/themes', element: <OwnerOnly><ThemesPage /></OwnerOnly> },
      { path: 'decks', element: <Navigate to="/slides/pool" replace /> },
      { path: 'library/decks', element: <Navigate to="/slides/pool" replace /> },
      { path: 'templates', element: <Navigate to="/slides/templates" replace /> },
      { path: 'themes', element: <Navigate to="/slides/themes" replace /> },
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
