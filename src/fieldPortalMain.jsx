import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import FieldPortalApp from './FieldPortalApp';
import ToastHost from './components/ToastHost';
import { installAlertBridge } from './utils/toast';

// Route all native alert() calls to non-blocking toasts (reversible).
installAlertBridge();

// Service worker registration is intentionally DISABLED — see main.jsx for
// the full explanation.  /sw.js is still served as a self-destructing
// kill-switch so any browser that registered the OLD shell-caching SW
// wipes itself clean on the next visit.

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <FieldPortalApp />
        <ToastHost />
    </React.StrictMode>
);
