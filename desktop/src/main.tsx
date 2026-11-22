import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { bootstrapTheme } from './theme/ThemeProvider.tsx'

// Apply the persisted theme (validated) before the first React render so
// dark mode / non-default presets never flash the light-brand default.
bootstrapTheme()

// Tell CSS up front whether the window draws its own Mica title strip, so the
// chrome height is reserved on the very first paint (and not at all when the
// native caption is in use).
if (window.electronAPI?.windowChrome?.customTitleBar) {
  document.documentElement.dataset.titlebar = 'overlay'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
