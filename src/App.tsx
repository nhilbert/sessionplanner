import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import WorkshopsPage from './pages/WorkshopsPage'
import PlannerPage from './pages/PlannerPage'
import PrintPage from './pages/PrintPage'

const router = createBrowserRouter([
  { path: '/', element: <WorkshopsPage /> },
  { path: '/w/:id', element: <PlannerPage /> },
  { path: '/w/:id/print/:variant', element: <PrintPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
