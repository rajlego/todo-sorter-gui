import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // This contains the Tailwind imports
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
