import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ToastHost from './components/ToastHost.jsx'
import { installAlertBridge } from './utils/toast.js'

// Route all native alert() calls to non-blocking toasts (reversible).
installAlertBridge()

// Register the PWA service worker (installability + offline app-shell fallback).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ToastHost />
  </StrictMode>,
)
