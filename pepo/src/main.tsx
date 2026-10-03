import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PEPOApp } from './app/PEPOApp'
// Applies the saved or system theme before the first paint.
import './core/theme'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PEPOApp demo />
  </StrictMode>,
)
