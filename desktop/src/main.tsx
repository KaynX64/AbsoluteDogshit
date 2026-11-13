import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { bootstrapTheme } from './theme/ThemeProvider.tsx'

// Apply the persisted theme (validated) before the first React render so
// dark mode / non-default presets never flash the light-brand default.
bootstrapTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
