import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEVERITY, formatDueLabel } from '../utils/reminders';

const SEV_DOT = {
    [SEVERITY.OVERDUE]: 'bg-red-500',
    [SEVERITY.DUE_SOON]: 'bg-amber-500',
    [SEVERITY.UPCOMING]: 'bg-cyan-500'
};

export default function NotificationBell({ items = [], summary }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    const badgeCount = summary?.overdue || items.length;

    useEffect(() => {
        if (!open) return undefined;
        const handleClick = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        const handleKey = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    const go = (link) => {
        setOpen(false);
        navigate(link);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-label={`Notifications${badgeCount ? `, ${badgeCount} need attention` : ''}`}
                aria-expanded={open}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:text-white"
            >
                <i className="fas fa-bell" aria-hidden="true"></i>
                {badgeCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 z-[1500] mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-white">Notifications</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {summary?.overdue ?? 0} overdue &middot; {summary?.dueSoon ?? 0} due soon
                        </span>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto">
                        {items.length === 0 ? (
                            <p className="px-4 py-6 text-center text-xs text-slate-400">
                                Nothing needs attention right now.
                            </p>
                        ) : (
                            <ul>
                                {items.slice(0, 12).map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => go(item.link)}
                                            className="flex w-full items-start gap-3 border-b border-slate-800/60 px-4 py-3 text-left transition-colors hover:bg-slate-800"
                                        >
                                            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${SEV_DOT[item.severity] || 'bg-slate-500'}`} aria-hidden="true"></span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm text-slate-100">{item.title}</span>
                                                <span className="block text-[11px] text-slate-500">{item.category} &middot; {formatDueLabel(item)}</span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
