import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { type Extensions } from './App'
import { cleanBasePath, setBasePath } from './domain/addresses'
import { setProduct, setSettingsSection, setWorkshopSharing, setWorkshopTool } from './features'
import { initialLocale, setupI18n } from './i18n'

/** Starts the app in the page. Called with nothing here (main.tsx); a build that adds to the app passes its extensions. */
export function startApp(extensions: Extensions = {}): void {
  const basePath = cleanBasePath(extensions.basePath)
  setBasePath(basePath)
  setProduct(extensions.product)
  setWorkshopSharing(extensions.workshopSharing !== false)
  setWorkshopTool(extensions.workshopTool)
  setSettingsSection(extensions.settingsSection)
  setupI18n(initialLocale())
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App extensions={{ ...extensions, basePath }} />
    </StrictMode>,
  )
}
