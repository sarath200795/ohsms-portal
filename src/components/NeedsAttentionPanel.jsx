import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SEVERITY, formatDueLabel } from '../utils/reminders';

const SEV_META = {
    [SEVERITY.OVERDUE]: {
        dot: 'bg-red-500 sev-dot-overdue',
        text: 'text-red-600',
        chip: 'border-red-200 bg-red-50',
        strip: 'bg-red-500',
        border: 'hover:border-red-300',
    },
    [SEVERITY.DUE_SOON]: {
        dot: 'bg-amber-500 sev-dot-due-soon',
        text: 'text-amber-700',
        chip: 'border-amber-200 bg-amber-50',
        strip: 'bg-amber-500',
        border: 'hover:border-amber-300',
    },
    [SEVERITY.UPCOMING]: {
        dot: 'bg-sky-500',
        text: 'text-sky-700',
        chip: 'border-sky-200 bg-sky-50',
        strip: 'bg-sky-500',
        border: 'hover:border-sky-300',
    },
};

export default function NeedsAttentionPanel({ items = [], summary, loading = false, limit = 6 }) {
    const navigate = useNavigate();
    const top = items.slice(0, limit);

    return (
        <section
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            aria-label="What needs me today"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--myth-ink)]">
                    <i className="fas fa-bolt mr-2 text-amber-500" aria-hidden="true"></i>
                    What needs me today
                </h2>
                <div className="flex gap-2 text-[10px] font-bold uppercase tracking-widest">
                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-600">
                        {summary?.overdue ?? 0} overdue
                    </span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                        {summary?.dueSoon ?? 0} due soon
                    </span>
                </div>
            </div>

            {loading ? (
                <div className="mt-4 flex items-center gap-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500" />
                    <p className="text-xs text-slate-500">Loading attention items&hellip;</p>
                </div>
            ) : top.length === 0 ? (
                <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                        <i className="fas fa-shield-check text-xs text-emerald-400" aria-hidden="true"></i>
                    </div>
                    <p className="text-xs text-slate-400">
                        You&apos;re all clear &mdash; nothing overdue or due in the next 30 days.
                    </p>
                </div>
            ) : (
                <ul className="mt-4 space-y-2">
                    {top.map((item, index) => {
                        const meta = SEV_META[item.severity] || SEV_META[SEVERITY.UPCOMING];
                        return (
                            <li
                                key={item.id}
                                className="attention-item"
                                style={{ animationDelay: `${index * 60}ms` }}
                            >
                                <button
                                    type="button"
                                    onClick={() => navigate(item.link)}
                                    className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-all duration-200 hover:bg-white hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)] ${meta.border}`}
                                >
                                    {/* Severity color strip on the left edge */}
                                    <span
                                        aria-hidden="true"
                                        className={`attention-strip ${meta.strip} opacity-70`}
                                    />

                                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`} aria-hidden="true"></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-slate-800">{item.title}</span>
                                        <span className="block text-[11px] text-slate-500">{item.category} &middot; {item.siteId}</span>
                                    </span>
                                    <span className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${meta.chip} ${meta.text}`}>
                                        {formatDueLabel(item)}
                                    </span>
                                    <i className="fas fa-chevron-right ml-1 flex-shrink-0 text-[10px] text-slate-600 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true"></i>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {items.length > limit && (
                <p className="mt-3 text-[11px] text-slate-500">
                    Showing {limit} of {items.length}. Open the relevant module to see the rest.
                </p>
            )}
        </section>
    );
}
