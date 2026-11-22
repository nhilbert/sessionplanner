import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { type Extensions } from './App'
import { cleanBasePath, setBasePath } from './domain/addresses'
import { setOfflineSignOut, setOwnerOnly, setProduct, setSettingsSection, setWorkshopSharing, setWorkshopTool } from './features'
import { initialLocale, setupI18n } from './i18n'
import { applyAppearance, initialAppearance } from './appearance'
import { startOffline } from './offline/client'

/** Starts the app in the page. Called with nothing here (main.tsx); a build that adds to the app passes its extensions. */
export function startApp(extensions: Extensions = {}): void {
  const basePath = cleanBasePath(extensions.basePath)
  setBasePath(basePath)
  setProduct(extensions.product)
  setWorkshopSharing(extensions.workshopSharing !== false)
  setWorkshopTool(extensions.workshopTool)
  setSettingsSection(extensions.settingsSection)
  setOwnerOnly(extensions.ownerOnly)
  setOfflineSignOut(extensions.offlineSignOut === true)
  setupI18n(initialLocale())
  applyAppearance(initialAppearance())
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App extensions={{ ...extensions, basePath }} />
    </StrictMode>,
  )
  // The offline copy, when switched on on this device (docs/offline.md).
  void startOffline().catch(() => undefined)
}
