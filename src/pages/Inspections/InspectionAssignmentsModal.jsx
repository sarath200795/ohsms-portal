import React, { useMemo, useRef, useState } from 'react';
import CenterSelect from '../../components/CenterSelect';
import { findCentersForSite } from '../../utils/centers';
import {
    ASSIGNMENT_FREQUENCIES,
    downloadAssignmentsTemplate,
    parseAssignmentsWorkbook,
    planAssignmentsImport
} from '../../utils/inspectionAssignmentsImport';

/**
 * Modal for managing one-off inspection assignments tied to a template.
 *
 * A template that's site-bound restricts every assignment to that site.
 * A GLOBAL template allows assignments to any (site, center, date) triple.
 * Existing assignments can be rescheduled (date change keeps an audit
 * entry in assignment.history) or cancelled.
 *
 * Props:
 *   template         — the template being assigned (must have .assignments)
 *   sites            — full sites array (each carrying its centers list)
 *   allowedSites     — sites visible to the signed-in user (RBAC scoped)
 *   isGlobalUser     — true if the user is a Global Owner
 *   currentUserEmail — for stamping history entries
 *   onClose          — close the modal
 *   onSave           — async (nextAssignments) => Promise<void>  persist the
 *                      modified assignments array back onto the template
 */
export default function InspectionAssignmentsModal({
    template,
    sites,
    allowedSites,
    isGlobalUser,
    currentUserEmail,
    onClose,
    onSave,
    // Optional bulk-import callback — receives the per-template plan from
    // planAssignmentsImport and applies it atomically. When provided, the
    // modal exposes a "Bulk Upload" button.
    onBulkImport,
    templates
}) {
    const isGlobalTemplate = template.siteId === 'GLOBAL';
    const todayIso = new Date().toISOString().slice(0, 10);

    // Sites the NEW assignment dropdown should show:
    //   • GLOBAL template → any site the user can see
    //   • site-bound → just that one site
    const sitesForPicker = useMemo(() => {
        if (!isGlobalTemplate) {
            const match = sites.find((s) => s.code === template.siteId);
            return match ? [match] : [];
        }
        // Global Owners see every site; everyone else sees only allowed ones
        return isGlobalUser ? sites : allowedSites;
    }, [isGlobalTemplate, isGlobalUser, sites, allowedSites, template.siteId]);

    // Default the new-assignment site to the template's site when site-bound
    const defaultSite = isGlobalTemplate
        ? (sitesForPicker.length === 1 ? sitesForPicker[0].code : '')
        : template.siteId;

    const [newSiteId, setNewSiteId] = useState(defaultSite);
    const [newCenterCode, setNewCenterCode] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newEndDate, setNewEndDate] = useState('');
    const [newFrequency, setNewFrequency] = useState('One-off');
    const [newNotes, setNewNotes] = useState('');
    const [busy, setBusy] = useState(false);

    // Inline-reschedule scratchpad (only one assignment can be in the
    // reschedule UI at a time so we don't need a per-row state).
    const [rescheduleId, setRescheduleId] = useState(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleReason, setRescheduleReason] = useState('');

    // Bulk-upload preview state
    const bulkFileRef = useRef(null);
    const [bulkPlan, setBulkPlan] = useState(null);     // Map<templateKey, [assignment]>
    const [bulkErrors, setBulkErrors] = useState([]);
    const [bulkRowCount, setBulkRowCount] = useState(0);
    const [bulkBusy, setBulkBusy] = useState(false);

    const existing = useMemo(
        () => (Array.isArray(template.assignments) ? template.assignments : []),
        [template.assignments]
    );

    // ── Mutations ─────────────────────────────────────────────────────────

    const persist = async (nextAssignments) => {
        setBusy(true);
        try {
            await onSave(nextAssignments);
        } finally {
            setBusy(false);
        }
    };

    const handleAdd = async () => {
        if (!newSiteId) return alert('Please pick a site.');
        if (!newDate) return alert('Please pick a start date.');
        if (newEndDate && newEndDate < newDate) return alert('End date is before start date.');

        const assignment = {
            id: `asn-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            siteId: newSiteId,
            centerCode: newCenterCode || '',
            scheduledDate: newDate,
            // Recurring metadata. Empty frequency = one-off (existing behaviour).
            frequency: newFrequency === 'One-off' ? '' : newFrequency,
            endDate: newEndDate || '',
            status: 'Pending',
            notes: newNotes.trim(),
            createdAt: new Date().toISOString(),
            createdBy: currentUserEmail || '',
            history: []
        };

        await persist([...existing, assignment]);
        // Reset add-form
        setNewCenterCode('');
        setNewDate('');
        setNewEndDate('');
        setNewFrequency('One-off');
        setNewNotes('');
        // Keep site selected if it's a site-bound template (only one option anyway)
        if (isGlobalTemplate) setNewSiteId(defaultSite);
    };

    // ── Bulk import ──────────────────────────────────────────────────────

    const handleBulkFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const rows = await parseAssignmentsWorkbook(file);
            const { perTemplate, errors } = planAssignmentsImport(rows, { templates: templates || [], sites });
            setBulkRowCount(rows.length);
            setBulkPlan(perTemplate);
            setBulkErrors(errors);
        } catch (err) {
            alert('Could not read the file: ' + err.message);
        } finally {
            if (bulkFileRef.current) bulkFileRef.current.value = '';
        }
    };

    const handleApplyBulk = async () => {
        if (!bulkPlan || bulkPlan.size === 0) {
            alert('Nothing to import — every row was rejected. Fix the errors and re-upload.');
            return;
        }
        if (!onBulkImport) {
            alert('Bulk import not wired up in this context.');
            return;
        }
        setBulkBusy(true);
        try {
            await onBulkImport(bulkPlan);
            const added = Array.from(bulkPlan.values()).reduce((a, b) => a + b.length, 0);
            alert(`Imported ${added} assignment${added === 1 ? '' : 's'} across ${bulkPlan.size} template${bulkPlan.size === 1 ? '' : 's'}.`);
            setBulkPlan(null);
            setBulkErrors([]);
            setBulkRowCount(0);
        } catch (err) {
            alert('Bulk import failed: ' + err.message);
        } finally {
            setBulkBusy(false);
        }
    };

    const handleReschedule = async (assignment) => {
        if (!rescheduleDate) return alert('Please pick a new date.');
        const next = existing.map((a) => {
            if (a.id !== assignment.id) return a;
            return {
                ...a,
                scheduledDate: rescheduleDate,
                status: 'Pending',
                history: [
                    ...(Array.isArray(a.history) ? a.history : []),
                    {
                        prevDate: a.scheduledDate,
                        newDate: rescheduleDate,
                        at: new Date().toISOString(),
                        by: currentUserEmail || '',
                        reason: rescheduleReason.trim()
                    }
                ]
            };
        });
        await persist(next);
        setRescheduleId(null);
        setRescheduleDate('');
        setRescheduleReason('');
    };

    const handleCancel = async (assignment) => {
        if (!window.confirm(`Cancel this assignment for ${assignment.scheduledDate}?`)) return;
        const next = existing.map((a) =>
            a.id === assignment.id ? { ...a, status: 'Cancelled' } : a
        );
        await persist(next);
    };

    const handleReopen = async (assignment) => {
        const next = existing.map((a) =>
            a.id === assignment.id ? { ...a, status: 'Pending' } : a
        );
        await persist(next);
    };

    const handleDelete = async (assignment) => {
        if (!window.confirm('Remove this assignment entirely?')) return;
        await persist(existing.filter((a) => a.id !== assignment.id));
    };

    // ── Render ────────────────────────────────────────────────────────────

    const renderStatusPill = (status) => {
        const map = {
            Pending: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
            Completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
            Cancelled: 'bg-slate-500/15 text-slate-300 border-slate-500/40'
        };
        return (
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${map[status] || map.Pending}`}>
                {status || 'Pending'}
            </span>
        );
    };

    const lookupSiteName = (code) => sites.find((s) => s.code === code)?.name || code;
    const lookupCenterName = (siteCode, centerCode) => {
        if (!centerCode) return '—';
        const found = findCentersForSite(sites, siteCode).find((c) => c.code === centerCode);
        return found ? `${found.name} (${found.code})` : centerCode;
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
            <div className="bg-slate-950 border border-slate-700 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-start justify-between">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Assignments</p>
                        <h2 className="text-xl font-bold text-white mt-1">{template.title}</h2>
                        <p className="text-xs text-slate-400 mt-1">
                            {isGlobalTemplate
                                ? 'Global template — assignments can target any site you have access to.'
                                : <>Site-bound template — assignments must be at <span className="font-mono text-lime-400">{template.siteId}</span>.</>}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white text-xl"><i className="fas fa-times"></i></button>
                </div>

                {/* Bulk upload (CSV / XLSX) */}
                {onBulkImport && (
                    <div className="p-6 border-b border-slate-800 bg-sky-950/20">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-sky-400 tracking-widest">Bulk Upload</p>
                                <p className="text-xs text-slate-400 mt-1">Schedule center-level assignments in batches. Each row can target any template + site + center + frequency.</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={downloadAssignmentsTemplate}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition"
                                >
                                    <i className="fas fa-download mr-1"></i> Template
                                </button>
                                <label className="bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition cursor-pointer">
                                    <i className="fas fa-file-import mr-1"></i> Choose File
                                    <input
                                        ref={bulkFileRef}
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        onChange={handleBulkFile}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        </div>

                        {bulkRowCount > 0 && (
                            <div className="text-xs text-slate-400 mb-2">
                                {bulkRowCount} row{bulkRowCount === 1 ? '' : 's'} read ·{' '}
                                {bulkPlan ? Array.from(bulkPlan.values()).reduce((a, b) => a + b.length, 0) : 0} ready ·{' '}
                                <span className={bulkErrors.length ? 'text-red-400' : ''}>{bulkErrors.length} error{bulkErrors.length === 1 ? '' : 's'}</span>
                            </div>
                        )}

                        {bulkErrors.length > 0 && (
                            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-2 max-h-32 overflow-y-auto custom-scroll">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-red-300 mb-1.5">Skipped rows</p>
                                <ul className="text-[11px] text-red-300 space-y-1">
                                    {bulkErrors.map((e, i) => (
                                        <li key={i}><span className="font-mono">Row {e.row}:</span> {e.message}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {bulkPlan && bulkPlan.size > 0 && (
                            <div className="flex items-center justify-between gap-3 bg-emerald-900/15 border border-emerald-500/30 rounded-lg p-3">
                                <div className="text-xs text-emerald-200">
                                    Ready to import <strong>{Array.from(bulkPlan.values()).reduce((a, b) => a + b.length, 0)}</strong> assignment{Array.from(bulkPlan.values()).reduce((a, b) => a + b.length, 0) === 1 ? '' : 's'} across <strong>{bulkPlan.size}</strong> template{bulkPlan.size === 1 ? '' : 's'}.
                                </div>
                                <button
                                    onClick={handleApplyBulk}
                                    disabled={bulkBusy}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition"
                                >
                                    {bulkBusy ? 'Importing…' : 'Apply Import'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Add new assignment */}
                <div className="p-6 border-b border-slate-800 bg-slate-900/40">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-3">Schedule A New Inspection</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Site</label>
                            <select
                                value={newSiteId}
                                onChange={(e) => { setNewSiteId(e.target.value); setNewCenterCode(''); }}
                                disabled={!isGlobalTemplate || sitesForPicker.length === 1}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-lime-500 disabled:opacity-60"
                            >
                                <option value="">Select site…</option>
                                {sitesForPicker.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                            </select>
                        </div>
                        <div>
                            <CenterSelect
                                sites={sites}
                                siteCode={newSiteId}
                                value={newCenterCode}
                                onChange={setNewCenterCode}
                                label="Center / Point"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-lime-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Frequency</label>
                            <select
                                value={newFrequency}
                                onChange={(e) => setNewFrequency(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-lime-500"
                            >
                                {ASSIGNMENT_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                                {newFrequency === 'One-off' ? 'Scheduled Date *' : 'Start Date *'}
                            </label>
                            <input
                                type="date"
                                value={newDate}
                                min={todayIso}
                                onChange={(e) => setNewDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-lime-500 font-mono"
                            />
                        </div>
                        {newFrequency !== 'One-off' && (
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">End Date (optional)</label>
                                <input
                                    type="date"
                                    value={newEndDate}
                                    min={newDate || todayIso}
                                    onChange={(e) => setNewEndDate(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-lime-500 font-mono"
                                />
                            </div>
                        )}
                        <div className={`flex items-end ${newFrequency !== 'One-off' ? '' : 'md:col-start-4'}`}>
                            <button
                                onClick={handleAdd}
                                disabled={busy || !newSiteId || !newDate}
                                className="w-full bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold px-4 py-2.5 rounded-lg text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                <i className="fas fa-plus mr-1"></i> Add
                            </button>
                        </div>
                        <div className="md:col-span-4">
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Notes (optional)</label>
                            <input
                                type="text"
                                value={newNotes}
                                onChange={(e) => setNewNotes(e.target.value)}
                                placeholder="e.g. End-of-quarter compliance check, assigned to night shift"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-lime-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Existing assignments */}
                <div className="flex-1 overflow-y-auto p-6 custom-scroll">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-3">Existing Assignments ({existing.length})</p>
                    {existing.length === 0 ? (
                        <div className="text-center p-8 text-slate-500 italic border-2 border-dashed border-slate-800 rounded-xl">
                            No assignments yet. Schedule one above.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {existing.map((a) => {
                                const isOverdue = a.status === 'Pending' && a.scheduledDate < todayIso;
                                const isBeingRescheduled = rescheduleId === a.id;
                                return (
                                    <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                                    {renderStatusPill(a.status)}
                                                    {isOverdue && (
                                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border bg-red-500/15 text-red-300 border-red-500/40">
                                                            Overdue
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm text-white">
                                                    <strong className="font-mono text-lime-400">{a.scheduledDate}</strong>
                                                    {a.frequency && (
                                                        <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded">
                                                            <i className="fas fa-repeat mr-1"></i> {a.frequency}
                                                            {a.endDate && <span className="ml-1 text-slate-400 font-normal">until {a.endDate}</span>}
                                                        </span>
                                                    )}
                                                    <span className="text-slate-500 mx-2">·</span>
                                                    <span>{lookupSiteName(a.siteId)} <span className="text-slate-500 font-mono text-xs">({a.siteId})</span></span>
                                                    {a.centerCode && (
                                                        <>
                                                            <span className="text-slate-500 mx-2">·</span>
                                                            <span className="text-slate-300">{lookupCenterName(a.siteId, a.centerCode)}</span>
                                                        </>
                                                    )}
                                                </div>
                                                {a.notes && <p className="text-xs text-slate-400 mt-1.5 italic">"{a.notes}"</p>}
                                                {Array.isArray(a.history) && a.history.length > 0 && (
                                                    <details className="mt-2 text-[10px] text-slate-500">
                                                        <summary className="cursor-pointer hover:text-slate-300">Reschedule history ({a.history.length})</summary>
                                                        <ul className="mt-2 space-y-1 ml-4 list-disc">
                                                            {a.history.map((h, i) => (
                                                                <li key={i}>
                                                                    <span className="font-mono">{h.prevDate}</span> → <span className="font-mono text-lime-400">{h.newDate}</span>
                                                                    {h.reason && <span className="ml-2">({h.reason})</span>}
                                                                    <span className="ml-2 text-slate-600">{new Date(h.at).toLocaleString()} · {h.by}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </details>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                {a.status === 'Pending' && !isBeingRescheduled && (
                                                    <button
                                                        onClick={() => { setRescheduleId(a.id); setRescheduleDate(a.scheduledDate); setRescheduleReason(''); }}
                                                        className="text-[10px] bg-blue-900/20 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest transition"
                                                    >
                                                        <i className="fas fa-clock mr-1"></i> Reschedule
                                                    </button>
                                                )}
                                                {a.status === 'Pending' && (
                                                    <button
                                                        onClick={() => handleCancel(a)}
                                                        disabled={busy}
                                                        className="text-[10px] bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-600 px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                                {a.status === 'Cancelled' && (
                                                    <button
                                                        onClick={() => handleReopen(a)}
                                                        disabled={busy}
                                                        className="text-[10px] bg-amber-900/20 text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-500/30 px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest transition"
                                                    >
                                                        Reopen
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(a)}
                                                    disabled={busy}
                                                    className="text-[10px] bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/30 px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest transition"
                                                >
                                                    <i className="fas fa-trash-alt mr-1"></i> Remove
                                                </button>
                                            </div>
                                        </div>

                                        {isBeingRescheduled && (
                                            <div className="mt-4 bg-slate-950/70 border border-blue-500/30 rounded-lg p-3 grid grid-cols-1 md:grid-cols-[160px,1fr,auto] gap-2">
                                                <input
                                                    type="date"
                                                    value={rescheduleDate}
                                                    onChange={(e) => setRescheduleDate(e.target.value)}
                                                    className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500 font-mono"
                                                />
                                                <input
                                                    type="text"
                                                    value={rescheduleReason}
                                                    onChange={(e) => setRescheduleReason(e.target.value)}
                                                    placeholder="Reason (optional)"
                                                    className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleReschedule(a)}
                                                        disabled={busy || !rescheduleDate}
                                                        className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold uppercase tracking-widest px-3 py-2 rounded-lg disabled:opacity-50 transition"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => { setRescheduleId(null); setRescheduleDate(''); setRescheduleReason(''); }}
                                                        className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-widest px-3 py-2 rounded-lg transition"
                                                    >
                                                        Discard
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-6 py-2.5 rounded-lg text-xs uppercase tracking-widest transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
