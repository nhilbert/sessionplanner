import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { type Extensions } from './App'
import { setBasePath } from './domain/addresses'
import { initialLocale, setupI18n } from './i18n'

/** Starts the app in the page. Called with nothing here (main.tsx); a build that adds to the app passes its extensions. */
export function startApp(extensions: Extensions = {}): void {
  setBasePath(extensions.basePath ?? '')
  setupI18n(initialLocale())
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App extensions={extensions} />
    </StrictMode>,
  )
}
