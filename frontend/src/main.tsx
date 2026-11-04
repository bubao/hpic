import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { FavoritesProvider } from './context/FavoritesContext.tsx'
import { ToastProvider } from './context/ToastContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <FavoritesProvider>
        <App />
      </FavoritesProvider>
    </ToastProvider>
  </StrictMode>,
)
