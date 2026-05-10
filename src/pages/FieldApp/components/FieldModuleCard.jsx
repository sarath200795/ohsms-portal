import React from 'react';

export default function FieldModuleCard({ module, onOpen, siteLabel }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className={`command-panel myth-hover group relative overflow-hidden rounded-[1.9rem] p-6 text-left ${module.border}`}
        >
            <div className="myth-card-glow"></div>
            <div className={`absolute inset-0 bg-gradient-to-br ${module.surface} opacity-75 transition-opacity duration-300 group-hover:opacity-100`}></div>
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(242,201,120,0.35)] to-transparent"></div>

            <div className="relative z-10 flex h-full flex-col">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div className={`myth-icon-frame flex h-14 w-14 items-center justify-center rounded-[1.2rem] text-2xl ${module.accent}`}>
                        <i className={`fas ${module.icon}`}></i>
                    </div>
                    <span className="war-chip !text-[var(--myth-muted)]">
                        {siteLabel}
                    </span>
                </div>

                <div className="mb-6">
                    <p className="myth-kicker mb-2">Field Module</p>
                    {module.entryBadge && (
                        <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] ${module.entryBadgeClass || 'border-[rgba(242,201,120,0.14)] text-[var(--myth-gold)] bg-[rgba(8,7,5,0.55)]'}`}>
                            {module.entryIcon && <i className={`fas ${module.entryIcon}`}></i>}
                            <span>{module.entryBadge}</span>
                        </div>
                    )}
                    <h3 className="mb-2 text-4xl tracking-tight text-white transition-colors group-hover:text-white">
                        {module.label}
                    </h3>
                    <p className="text-sm leading-relaxed text-[var(--myth-muted)]">
                        {module.desc}
                    </p>
                    {module.fieldHint && (
                        <div className="mt-4 rounded-2xl border border-[rgba(242,201,120,0.12)] bg-[rgba(8,7,5,0.55)] px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--myth-gold)]">Best Entry</p>
                            <p className="mt-2 text-xs leading-relaxed text-[var(--myth-ink)]">
                                {module.fieldHint}
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-[rgba(242,201,120,0.12)] pt-4">
                    <span className={`text-xs font-bold uppercase tracking-[0.25em] ${module.accent}`}>
                        {module.actionLabel}
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(242,201,120,0.14)] bg-[rgba(10,8,6,0.72)] text-[var(--myth-gold)] transition-all duration-300 group-hover:translate-x-1">
                        <i className="fas fa-arrow-right"></i>
                    </span>
                </div>
            </div>
        </button>
    );
}
