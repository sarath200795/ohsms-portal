import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import FieldPortalApp from './FieldPortalApp';
import ToastHost from './components/ToastHost';
import { installAlertBridge } from './utils/toast';

// Route all native alert() calls to non-blocking toasts (reversible).
installAlertBridge();

// Register the PWA service worker (installability + offline app-shell fallback).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <FieldPortalApp />
        <ToastHost />
    </React.StrictMode>
);
