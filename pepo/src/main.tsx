import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PEPOApp } from './app/PEPOApp'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PEPOApp demo />
  </StrictMode>,
)
