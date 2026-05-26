import React from 'react';
import { useNavigate } from 'react-router-dom';
import { readStoredSession } from '../utils/session';

export default function NotFound() {
    const navigate = useNavigate();
    const hasSession = Boolean(readStoredSession());

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--myth-bg)] px-6 text-center text-[var(--myth-ink)]">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100 text-amber-500">
                <i className="fas fa-compass text-4xl" aria-hidden="true"></i>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-500">Error 404</p>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl text-[var(--myth-ink)]">This page wandered off-site</h1>
            <p className="mt-3 max-w-md text-sm text-[var(--myth-muted)]">
                The link may be mistyped, or the workflow may have moved. Let&apos;s get you back to a safe area.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate(hasSession ? '/dashboard' : '/')}
                    className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-amber-400"
                >
                    {hasSession ? 'Go to Dashboard' : 'Go to Sign In'}
                </button>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="rounded-2xl border border-slate-200 bg-slate-100 px-6 py-3 text-sm font-bold uppercase tracking-widest text-[var(--myth-ink)] transition-colors hover:bg-slate-200"
                >
                    Go Back
                </button>
            </div>
        </div>
    );
}
