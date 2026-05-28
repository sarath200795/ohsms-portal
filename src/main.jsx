import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ToastHost from './components/ToastHost.jsx'
import { installAlertBridge } from './utils/toast.js'

// Route all native alert() calls to non-blocking toasts (reversible).
installAlertBridge()

// Service worker registration is intentionally DISABLED.
//
// A previous SW cached /index.html as the app shell, which served stale
// asset hash references after deploys — causing blank pages with
// "Failed to load module script: Expected a JavaScript-or-Wasm module
// script but the server responded with a MIME type of text/html".
//
// /sw.js is still served (as a self-destructing kill-switch script) so
// browsers that registered the OLD SW will run it once on next fetch,
// wipe all caches, and unregister themselves. Once that has rolled out
// to everyone, we can also delete public/sw.js.
//
// Do NOT re-enable a service worker here without a deploy-safe caching
// strategy (e.g., Workbox's precache manifest generated per build, NOT
// a hand-rolled "cache the app shell" strategy like the previous SW).

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ToastHost />
  </StrictMode>,
)
