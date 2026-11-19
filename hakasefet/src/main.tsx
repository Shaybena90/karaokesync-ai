import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/heebo/hebrew-400.css'
import '@fontsource/heebo/hebrew-500.css'
import '@fontsource/heebo/hebrew-700.css'
import '@fontsource/heebo/hebrew-800.css'
import '@fontsource/heebo/latin-400.css'
import '@fontsource/heebo/latin-700.css'
import '@fontsource/heebo/latin-800.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
