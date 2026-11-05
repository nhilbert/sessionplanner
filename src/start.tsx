import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { type Extensions } from './App'
import { cleanBasePath, setBasePath } from './domain/addresses'
import { setWorkshopSharing } from './features'
import { initialLocale, setupI18n } from './i18n'

/** Starts the app in the page. Called with nothing here (main.tsx); a build that adds to the app passes its extensions. */
export function startApp(extensions: Extensions = {}): void {
  const basePath = cleanBasePath(extensions.basePath)
  setBasePath(basePath)
  setWorkshopSharing(extensions.workshopSharing !== false)
  setupI18n(initialLocale())
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App extensions={{ ...extensions, basePath }} />
    </StrictMode>,
  )
}
