import { type ReactNode, useState } from 'react'
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router'
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
import PicturesPage from './pages/PicturesPage'
import { useSettings } from './store/useSettings'

/** What a build can add to the app without changing it. */
export interface Extensions {
  /** The name the app shows, for a build with a name of its own. */
  product?: string
  /** Where the app lies under its host, without a slash at the end: the pages, and the API below it. */
  basePath?: string
  /** More pages inside the app's frame. */
  routes?: RouteObject[]
  /** One place in the navigation for something of its own; `folded`: only icons fit. */
  menu?: (options: { folded: boolean }) => ReactNode
  /** Leaves out a workshop's sharing by e-mail, for a build with its own way of inviting people. */
  workshopSharing?: false
  /** One place in a workshop's header for something of its own. */
  workshopTool?: (workshopId: string) => ReactNode
  /** One place at the end of the owner's settings for something of its own. */
  settingsSection?: () => ReactNode
  /** Decides whether the settings show the export of all data and media; it gets the section and answers what to show. */
  fullExport?: (section: ReactNode) => ReactNode
}

/** The owner's pages (library, slides area): a guest who types their address lands on the workshops shared with them. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const owner = useSettings((s) => s.me.owner)
  return owner ? children : <Navigate to="/" replace />
}

const routes = ({ routes: extra = [], menu }: Extensions): RouteObject[] => [
  {
    path: '/',
    element: <AppShell menu={menu} />,
    children: [
      ...extra,
      { index: true, element: <WorkshopsPage /> },
      { path: 'w/:id', element: <PlannerPage /> },
      { path: 'library', element: <OwnerOnly><LibraryPage /></OwnerOnly> },
      // The slides area: what slides are made from – the pool, the templates, the themes (docs/slides.md, section 7).
      { path: 'slides', element: <Navigate to="/slides/pool" replace /> },
      { path: 'slides/pool', element: <OwnerOnly><DecksPage /></OwnerOnly> },
      { path: 'slides/templates', element: <OwnerOnly><TemplatesPage /></OwnerOnly> },
      { path: 'slides/themes', element: <OwnerOnly><ThemesPage /></OwnerOnly> },
      // The picture pool of the themes, as an entry of its own in the navigation.
      { path: 'pictures', element: <OwnerOnly><PicturesPage /></OwnerOnly> },
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
]

export default function App({ extensions }: { extensions: Extensions }) {
  const [router] = useState(() => createBrowserRouter(routes(extensions), { basename: extensions.basePath || undefined }))
  return <RouterProvider router={router} />
}
