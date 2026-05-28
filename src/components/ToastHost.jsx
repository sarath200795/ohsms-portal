import React, { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast } from '../utils/toast';

// Light-theme styling.  All toasts use a white card with a coloured left
// rail + matching accent icon so they are immediately readable on the
// app's light background.  Text colour is forced inline (style) to bypass
// the global dark→light overrides in index.css that would otherwise turn
// text-slate-* into invisible-on-white.
const TYPE_STYLES = {
    success: {
        icon: 'fa-circle-check',
        rail: '#10b981',         // emerald-500
        accent: '#047857',       // emerald-700
        bg: '#ecfdf5',           // emerald-50
        border: '#a7f3d0',       // emerald-200
        animClass: 'toast-success-enter',
    },
    error: {
        icon: 'fa-circle-exclamation',
        rail: '#ef4444',         // red-500
        accent: '#b91c1c',       // red-700
        bg: '#fef2f2',           // red-50
        border: '#fecaca',       // red-200
        animClass: 'toast-enter',
    },
    warning: {
        icon: 'fa-triangle-exclamation',
        rail: '#f59e0b',         // amber-500
        accent: '#b45309',       // amber-700
        bg: '#fffbeb',           // amber-50
        border: '#fde68a',       // amber-200
        animClass: 'toast-enter',
    },
    info: {
        icon: 'fa-circle-info',
        rail: '#0ea5e9',         // sky-500
        accent: '#0369a1',       // sky-700
        bg: '#f0f9ff',           // sky-50
        border: '#bae6fd',       // sky-200
        animClass: 'toast-enter',
    },
};

export default function ToastHost() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => subscribeToasts(setToasts), []);

    if (!toasts.length) return null;

    return (
        <div
            className="pointer-events-none fixed right-4 top-4 z-[2000] flex w-[min(92vw,380px)] flex-col gap-2"
            role="region"
            aria-label="Notifications"
        >
            {toasts.map((toast) => {
                const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;
                return (
                    <div
                        key={toast.id}
                        role="status"
                        aria-live="polite"
                        className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border px-4 py-3 shadow-2xl ${style.animClass}`}
                        style={{
                            backgroundColor: style.bg,
                            borderColor: style.border,
                            color: '#0f172a',          // slate-900 — readable on the light bg
                        }}
                    >
                        {/* Left colour rail */}
                        <span
                            aria-hidden="true"
                            className="absolute bottom-0 left-0 top-0 w-[3px]"
                            style={{ backgroundColor: style.rail }}
                        />

                        <i
                            className={`fas ${style.icon} mt-0.5 text-base`}
                            style={{ color: style.accent }}
                            aria-hidden="true"
                        ></i>
                        <p
                            className="flex-1 text-sm font-medium leading-snug"
                            style={{ color: '#0f172a' }}
                        >
                            {toast.text}
                        </p>
                        <button
                            type="button"
                            onClick={() => dismissToast(toast.id)}
                            aria-label="Dismiss notification"
                            className="ml-1 flex-shrink-0 transition-colors hover:opacity-100"
                            style={{ color: '#64748b' }}
                        >
                            <i className="fas fa-times text-xs" aria-hidden="true"></i>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
