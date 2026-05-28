import React, { useMemo } from 'react';
import { findCentersForSite } from '../utils/centers';

/**
 * A dropdown that lists the centers (a.k.a. points/areas) configured for
 * the selected site.  Always renders so the field is visible to reporters,
 * but disabled and explanatory when the site has no centers yet or no site
 * is selected.
 *
 * Props:
 *   sites      — the full sites array (each item may carry a `centers` array)
 *   siteCode   — the currently selected site code (controlled)
 *   value      — the currently selected center code (controlled)
 *   onChange   — (newCenterCode: string) => void
 *   className  — optional, override the <select> classes
 *   disabled   — optional, force the field disabled
 *   label      — optional, override the field label
 *   required   — optional, append an asterisk to the label
 */
export default function CenterSelect({
    sites,
    siteCode,
    value,
    onChange,
    className,
    disabled = false,
    label = 'Center / Point',
    required = false
}) {
    const centers = useMemo(() => findCentersForSite(sites, siteCode), [sites, siteCode]);
    const noSite = !siteCode || siteCode === 'All' || siteCode === 'GLOBAL';
    const noCenters = !noSite && centers.length === 0;

    const placeholder = noSite
        ? 'Select a site first…'
        : noCenters
            ? 'No centers configured for this site'
            : 'Select center…';

    const baseClass =
        className ||
        'w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-emerald-500';

    return (
        <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">
                {label}
                {required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled || noSite || noCenters}
                className={`${baseClass} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <option value="">{placeholder}</option>
                {centers.map((c) => (
                    <option key={c.code} value={c.code}>
                        {c.name} {c.code ? `(${c.code})` : ''}
                    </option>
                ))}
            </select>
        </div>
    );
}
