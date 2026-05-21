import React, { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast } from '../utils/toast';

const TYPE_STYLES = {
    success: {
        icon: 'fa-circle-check',
        ring: 'border-emerald-400/40',
        dot: 'bg-emerald-400',
        accent: 'text-emerald-300',
        bar: 'bg-emerald-400',
        animClass: 'toast-success-enter',
    },
    error: {
        icon: 'fa-circle-exclamation',
        ring: 'border-red-400/40',
        dot: 'bg-red-400',
        accent: 'text-red-300',
        bar: 'bg-red-400',
        animClass: 'toast-enter',
    },
    warning: {
        icon: 'fa-triangle-exclamation',
        ring: 'border-amber-400/40',
        dot: 'bg-amber-400',
        accent: 'text-amber-300',
        bar: 'bg-amber-400',
        animClass: 'toast-enter',
    },
    info: {
        icon: 'fa-circle-info',
        ring: 'border-cyan-400/40',
        dot: 'bg-cyan-400',
        accent: 'text-cyan-300',
        bar: 'bg-cyan-400',
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
                        className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border ${style.ring} bg-slate-900/95 px-4 py-3 text-slate-100 shadow-2xl ${style.animClass}`}
                    >
                        {/* Bottom color accent bar */}
                        <span
                            aria-hidden="true"
                            className={`absolute bottom-0 left-0 right-0 h-[2px] ${style.bar} opacity-60`}
                        />

                        <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${style.dot}`} aria-hidden="true"></span>
                        <i className={`fas ${style.icon} mt-0.5 ${style.accent}`} aria-hidden="true"></i>
                        <p className="flex-1 text-sm leading-snug">{toast.text}</p>
                        <button
                            type="button"
                            onClick={() => dismissToast(toast.id)}
                            aria-label="Dismiss notification"
                            className="ml-1 flex-shrink-0 text-slate-400 transition-colors hover:text-white"
                        >
                            <i className="fas fa-times text-xs" aria-hidden="true"></i>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
