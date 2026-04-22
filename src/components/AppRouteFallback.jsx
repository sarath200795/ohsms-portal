import React from 'react';

export default function AppRouteFallback({
    title = 'Loading Workspace',
    subtitle = 'Preparing the next module experience.'
}) {
    return (
        <div className="myth-shell flex min-h-screen items-center justify-center bg-[#080705] text-white" role="status" aria-live="polite">
            <div className="command-panel w-full max-w-xl rounded-[2rem] px-8 py-7">
                <div className="flex items-center gap-4">
                    <i className="fas fa-circle-notch fa-spin text-3xl text-[var(--myth-cyan)]"></i>
                    <div>
                        <p className="legendary-title text-[11px] font-bold uppercase tracking-[0.35em] text-[var(--myth-cyan)]">Module Stream</p>
                        <h2 className="mt-1 text-2xl font-black uppercase tracking-[0.18em] text-white">{title}</h2>
                        <p className="mt-2 text-sm text-[var(--myth-muted)]">{subtitle}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
