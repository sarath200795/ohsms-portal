/**
 * WorkspaceManagement.jsx  (route: /workspaces)
 *
 * Admin portal for managing every Firebase / REST workspace this codebase
 * knows about. Surfaces three sources side-by-side:
 *   1. Local registry      — localStorage('ohsms_org_registry')
 *   2. Public directory    — ohsms-3894f publicOrgDirectory (shared)
 *   3. Tombstones          — ohsms-3894f publicOrgDirectoryTombstones
 *
 * Status badge per workspace combines the three sources:
 *   - Working            → in local AND directory, no tombstone
 *   - Published-only     → in directory, NOT in local (this device hasn't
 *                          connected yet — picking it from /login would
 *                          import it)
 *   - Local-only         → in local, NOT in directory (other devices can't
 *                          discover it until publish)
 *   - Deleted            → tombstone present
 *   - Mismatched         → present in both but differ on key fields
 *
 * Per-row actions (right-most column, gated where appropriate):
 *   - Publish            → push local entry to directory
 *   - Unpublish          → remove directory entry (no tombstone, can re-publish)
 *   - Mark Deleted       → directory remove + tombstone write (admin only)
 *   - Restore            → remove tombstone so the entry can be re-published
 *   - Unlink (Local)     → remove only from localStorage on this device
 *   - Onboard            → for published-only rows, write the entry into
 *                          local so this device's picker shows it without
 *                          needing /login mount
 *   - Edit               → navigate to /setup with prefilled config
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getOrgRegistry,
    saveOrgToRegistry,
    removeOrgFromRegistry,
    publishOrgToDirectory,
    unpublishOrgFromDirectory,
    deleteOrgEverywhere,
    fetchPublicOrgDirectory,
    fetchOrgTombstones,
    getDbTypeLabel
} from '../utils/orgRegistry.js';
import { readStoredSession } from '../utils/session.js';

const requireAdminPassphrase = () => {
    const required = import.meta.env.VITE_ORG_DELETE_KEY || '';
    if (!required) return true; // no env var = no gate
    const entered = window.prompt('Enter the admin passphrase to continue:');
    if (entered == null) return false; // user cancelled
    if (entered !== required) {
        alert('Incorrect passphrase.');
        return false;
    }
    return true;
};

const TOMBSTONES_URL_BASE = 'https://ohsms-3894f-default-rtdb.firebaseio.com/publicOrgDirectoryTombstones';

const removeTombstoneRest = async (orgId) => {
    try {
        const res = await fetch(`${TOMBSTONES_URL_BASE}/${encodeURIComponent(orgId)}.json`, { method: 'DELETE' });
        return res.ok;
    } catch {
        return false;
    }
};

export default function WorkspaceManagement() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [local, setLocal] = useState([]);
    const [remote, setRemote] = useState([]);
    const [tombstones, setTombstones] = useState(new Set());
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [r, t] = await Promise.all([
                fetchPublicOrgDirectory(),
                fetchOrgTombstones()
            ]);
            setLocal(getOrgRegistry());
            setRemote(r);
            setTombstones(t);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    // Build the unified row set: union of local + remote keyed by orgId.
    const rows = useMemo(() => {
        const map = new Map();
        local.forEach((e) => {
            if (!e?.orgId) return;
            map.set(e.orgId, { local: e, remote: null });
        });
        remote.forEach((e) => {
            if (!e?.orgId) return;
            const existing = map.get(e.orgId);
            if (existing) existing.remote = e;
            else map.set(e.orgId, { local: null, remote: e });
        });

        const list = Array.from(map.entries()).map(([orgId, sources]) => {
            const display = sources.local || sources.remote;
            const isTombstoned = tombstones.has(orgId);

            let status;
            if (isTombstoned) status = 'Deleted';
            else if (sources.local && sources.remote) {
                // mismatch detection — name / config diff means one side is stale
                const localFb = sources.local.firebaseConfig || '';
                const remoteFb = sources.remote.firebaseConfig || '';
                const nameMismatch = (sources.local.orgName || '') !== (sources.remote.orgName || '');
                const fbMismatch = localFb && remoteFb && localFb !== remoteFb;
                status = (nameMismatch || fbMismatch) ? 'Mismatched' : 'Working';
            }
            else if (sources.local) status = 'Local-only';
            else status = 'Published-only';

            return {
                orgId,
                orgName: display.orgName || orgId,
                logoBase64: display.logoBase64 || sources.remote?.logoBase64 || sources.local?.logoBase64 || null,
                dbAdapter: display.dbAdapter || 'firebase',
                firebaseConfig: display.firebaseConfig || null,
                restUrl: display.restUrl || null,
                publishedAt: sources.remote?.publishedAt || null,
                hidden: Boolean(sources.local?.hidden),
                sources,
                status
            };
        });

        list.sort((a, b) => {
            // Show alerts first: Deleted + Mismatched on top, then everything alphabetical
            const priority = { 'Mismatched': 0, 'Deleted': 1, 'Local-only': 2, 'Published-only': 3, 'Working': 4 };
            const pa = priority[a.status] ?? 9;
            const pb = priority[b.status] ?? 9;
            if (pa !== pb) return pa - pb;
            return (a.orgName || '').localeCompare(b.orgName || '');
        });

        return list;
    }, [local, remote, tombstones]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (statusFilter !== 'All' && r.status !== statusFilter) return false;
            if (!q) return true;
            return (r.orgName.toLowerCase().includes(q) || r.orgId.toLowerCase().includes(q));
        });
    }, [rows, search, statusFilter]);

    const counts = useMemo(() => {
        const c = { total: rows.length, Working: 0, 'Local-only': 0, 'Published-only': 0, Mismatched: 0, Deleted: 0 };
        rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
        return c;
    }, [rows]);

    // ── per-row actions ─────────────────────────────────────────────────────
    const wrap = (id, fn) => async () => {
        if (busyId) return;
        setBusyId(id);
        try {
            await fn();
            await reload();
        } finally {
            setBusyId(null);
        }
    };

    const onPublish = (r) => wrap(r.orgId, async () => {
        const entry = r.sources.local || r.sources.remote || r;
        const ok = await publishOrgToDirectory(entry);
        alert(ok ? `${r.orgName} published.` : `Publish failed for ${r.orgName}.`);
    });

    const onUnpublish = (r) => wrap(r.orgId, async () => {
        if (!window.confirm(`Unpublish ${r.orgName} from the shared directory? Other devices won't see it until you republish. The local entry on this device is kept.`)) return;
        const ok = await unpublishOrgFromDirectory(r.orgId);
        alert(ok ? `${r.orgName} unpublished.` : `Unpublish failed for ${r.orgName}.`);
    });

    const onMarkDeleted = (r) => wrap(r.orgId, async () => {
        if (!requireAdminPassphrase()) return;
        if (!window.confirm(`Mark ${r.orgName} as deleted? It will disappear from every device's picker on their next /login mount.`)) return;
        const result = await deleteOrgEverywhere(r.orgId);
        const ok = result.directoryOk && result.tombstoneOk;
        alert(ok
            ? `${r.orgName} marked as deleted. Other devices will see it disappear within seconds.`
            : 'Delete partially completed. See console for details.');
    });

    const onRestore = (r) => wrap(r.orgId, async () => {
        if (!requireAdminPassphrase()) return;
        if (!window.confirm(`Restore ${r.orgName} from the tombstone list? It can be re-published from this page after restoring.`)) return;
        const ok = await removeTombstoneRest(r.orgId);
        alert(ok ? `Tombstone removed for ${r.orgName}. Click 'Publish' to re-add to the directory.` : 'Restore failed.');
    });

    const onUnlink = (r) => wrap(r.orgId, async () => {
        if (!window.confirm(`Unlink ${r.orgName} from THIS device's local registry? The directory entry and other devices stay unaffected. You can re-link by clicking Onboard.`)) return;
        removeOrgFromRegistry(r.orgId);
    });

    const onOnboard = (r) => wrap(r.orgId, async () => {
        // Pull the remote entry into local registry so this device sees it
        // in the /login picker immediately (without the auto-publish loop).
        const remoteEntry = r.sources.remote;
        if (!remoteEntry) {
            alert('No published entry to onboard from.');
            return;
        }
        saveOrgToRegistry({
            orgId: remoteEntry.orgId,
            orgName: remoteEntry.orgName,
            logoBase64: remoteEntry.logoBase64 || null,
            dbAdapter: remoteEntry.dbAdapter || 'firebase',
            firebaseConfig: remoteEntry.firebaseConfig || null,
            restUrl: remoteEntry.restUrl || null
        });
    });

    const onEdit = (r) => {
        // /setup pre-population isn't formal yet — for now we just open /setup
        // and let the admin re-enter / verify the config. Future: deep-link
        // with the orgId pre-loaded.
        navigate('/setup');
    };

    // ── status badge ────────────────────────────────────────────────────────
    const statusBadge = (status) => {
        const map = {
            Working: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Local-only': 'bg-amber-50 text-amber-700 border-amber-200',
            'Published-only': 'bg-sky-50 text-sky-700 border-sky-200',
            Mismatched: 'bg-orange-50 text-orange-700 border-orange-200',
            Deleted: 'bg-red-50 text-red-700 border-red-200'
        };
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-widest ${map[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                {status === 'Working' && '✓'}
                {status === 'Deleted' && '✕'}
                {status === 'Mismatched' && '⚠'}
                {status}
            </span>
        );
    };

    const session = readStoredSession();
    const adminGated = Boolean(import.meta.env.VITE_ORG_DELETE_KEY);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-['Inter']">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => navigate(session ? '/dashboard' : '/login')}
                            className="text-slate-500 hover:text-slate-900 text-xs font-bold uppercase tracking-widest flex items-center gap-1"
                        >
                            <i className="fas fa-arrow-left"></i> Back
                        </button>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <h1 className="text-lg font-black text-slate-900">Workspace Management</h1>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 px-2 py-0.5 rounded border border-slate-200 bg-slate-50">Admin</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={reload}
                            disabled={loading}
                            className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1"
                            title="Re-fetch the directory and tombstones"
                        >
                            <i className={`fas fa-arrows-rotate ${loading ? 'fa-spin' : ''}`}></i> Refresh
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/setup')}
                            className="text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1"
                        >
                            <i className="fas fa-plus"></i> Onboard New
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
                {/* counters */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {['total', 'Working', 'Local-only', 'Published-only', 'Mismatched'].map((k) => {
                        const label = k === 'total' ? 'Total' : k;
                        const value = counts[k] || 0;
                        const accent = {
                            'total': 'border-slate-300 bg-white',
                            'Working': 'border-emerald-200 bg-emerald-50',
                            'Local-only': 'border-amber-200 bg-amber-50',
                            'Published-only': 'border-sky-200 bg-sky-50',
                            'Mismatched': 'border-orange-200 bg-orange-50'
                        }[k];
                        return (
                            <button
                                key={k}
                                type="button"
                                onClick={() => setStatusFilter(k === 'total' ? 'All' : k)}
                                className={`p-3 rounded-xl border text-left transition-shadow hover:shadow-sm ${accent}`}
                            >
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                                <p className="text-2xl font-black mt-0.5 text-slate-900">{value}</p>
                            </button>
                        );
                    })}
                </div>

                {/* filter bar */}
                <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="search"
                            placeholder="Search by name or orgId…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-orange-400"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-xs font-bold uppercase tracking-widest px-3 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                        <option value="All">All Statuses</option>
                        <option value="Working">Working</option>
                        <option value="Local-only">Local-only</option>
                        <option value="Published-only">Published-only</option>
                        <option value="Mismatched">Mismatched</option>
                        <option value="Deleted">Deleted</option>
                    </select>
                    {(search || statusFilter !== 'All') && (
                        <button
                            type="button"
                            onClick={() => { setSearch(''); setStatusFilter('All'); }}
                            className="text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-slate-900"
                        >
                            <i className="fas fa-xmark mr-1"></i> Clear
                        </button>
                    )}
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 px-2">{filtered.length} of {rows.length}</span>
                </div>

                {/* table */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-500 font-black">
                                <tr>
                                    <th className="px-4 py-3 pl-6">Workspace</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">DB Type</th>
                                    <th className="px-4 py-3">Local</th>
                                    <th className="px-4 py-3">Directory</th>
                                    <th className="px-4 py-3">Published At</th>
                                    <th className="px-4 py-3 pr-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && (
                                    <tr><td colSpan="7" className="px-6 py-10 text-center text-slate-400 italic">Loading…</td></tr>
                                )}
                                {!loading && filtered.length === 0 && (
                                    <tr><td colSpan="7" className="px-6 py-10 text-center text-slate-400 italic">No workspaces match the current filter.</td></tr>
                                )}
                                {!loading && filtered.map((r) => {
                                    const isBusy = busyId === r.orgId;
                                    return (
                                        <tr key={r.orgId} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                                                        {r.logoBase64 ? (
                                                            <img src={r.logoBase64} alt={r.orgName} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-sm font-black text-sky-600 bg-gradient-to-br from-sky-50 to-slate-100">
                                                                {(r.orgName || '?').charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-slate-900 truncate">{r.orgName}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono truncate">{r.orgId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">{statusBadge(r.status)}</td>
                                            <td className="px-4 py-3 text-xs text-slate-700">
                                                {r.dbAdapter === 'firebase' ? '🔥 Firebase' : `🖥️ ${getDbTypeLabel(r)}`}
                                            </td>
                                            <td className="px-4 py-3">
                                                {r.sources.local
                                                    ? <span className="text-emerald-600 text-xs font-bold"><i className="fas fa-check-circle"></i> Yes</span>
                                                    : <span className="text-slate-300 text-xs">—</span>}
                                                {r.hidden && <span className="ml-1 text-[9px] text-slate-400 uppercase">(hidden)</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                {r.sources.remote
                                                    ? <span className="text-emerald-600 text-xs font-bold"><i className="fas fa-check-circle"></i> Yes</span>
                                                    : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                                                {r.publishedAt ? new Date(r.publishedAt).toLocaleString() : '—'}
                                            </td>
                                            <td className="px-4 py-3 pr-6">
                                                <div className="flex justify-end items-center gap-1 flex-wrap">
                                                    {/* Publish — visible when no remote OR when mismatched */}
                                                    {(!r.sources.remote || r.status === 'Mismatched') && r.status !== 'Deleted' && r.sources.local && (
                                                        <button
                                                            type="button"
                                                            onClick={onPublish(r)}
                                                            disabled={isBusy}
                                                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                                            title="Push this local entry to the shared directory so other devices see it"
                                                        >
                                                            {isBusy ? '…' : 'Publish'}
                                                        </button>
                                                    )}

                                                    {/* Onboard — for published-only entries */}
                                                    {r.status === 'Published-only' && (
                                                        <button
                                                            type="button"
                                                            onClick={onOnboard(r)}
                                                            disabled={isBusy}
                                                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
                                                            title="Import this published entry into THIS device's local registry"
                                                        >
                                                            {isBusy ? '…' : 'Onboard'}
                                                        </button>
                                                    )}

                                                    {/* Restore — for tombstoned entries */}
                                                    {r.status === 'Deleted' && (
                                                        <button
                                                            type="button"
                                                            onClick={onRestore(r)}
                                                            disabled={isBusy}
                                                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
                                                            title="Remove the tombstone so this entry can be re-published"
                                                        >
                                                            {isBusy ? '…' : 'Restore'}
                                                        </button>
                                                    )}

                                                    {/* Unpublish — when in directory but not deleted */}
                                                    {r.sources.remote && r.status !== 'Deleted' && (
                                                        <button
                                                            type="button"
                                                            onClick={onUnpublish(r)}
                                                            disabled={isBusy}
                                                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                            title="Remove from shared directory but keep local entry. No tombstone — can re-publish later."
                                                        >
                                                            Unpublish
                                                        </button>
                                                    )}

                                                    {/* Unlink — when local */}
                                                    {r.sources.local && (
                                                        <button
                                                            type="button"
                                                            onClick={onUnlink(r)}
                                                            disabled={isBusy}
                                                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                            title="Remove ONLY from this device. Other devices and the directory entry stay."
                                                        >
                                                            Unlink
                                                        </button>
                                                    )}

                                                    {/* Edit */}
                                                    {r.sources.local && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onEdit(r)}
                                                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                                                            title="Re-configure via /setup"
                                                        >
                                                            Edit
                                                        </button>
                                                    )}

                                                    {/* Mark Deleted — admin gated, hidden when already tombstoned */}
                                                    {r.status !== 'Deleted' && (
                                                        <button
                                                            type="button"
                                                            onClick={onMarkDeleted(r)}
                                                            disabled={isBusy}
                                                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                                                            title={adminGated
                                                                ? 'Mark as deleted — requires admin passphrase'
                                                                : 'Mark as deleted across every device (no admin gate set)'}
                                                        >
                                                            {isBusy ? '…' : 'Delete'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* legend */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-[11px] leading-relaxed text-slate-600">
                    <p className="font-black uppercase tracking-widest text-[10px] text-slate-500 mb-2">Status legend</p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <li><span className="font-bold text-emerald-700">Working</span> — present in local AND directory, configs match. Other devices already see it.</li>
                        <li><span className="font-bold text-amber-700">Local-only</span> — on this device, not in the directory. Click <strong>Publish</strong> to share.</li>
                        <li><span className="font-bold text-sky-700">Published-only</span> — in the directory but not on this device. Click <strong>Onboard</strong> to add locally.</li>
                        <li><span className="font-bold text-orange-700">Mismatched</span> — present in both, but the name or Firebase config differs. Republish or unpublish to resolve.</li>
                        <li><span className="font-bold text-red-700">Deleted</span> — tombstoned. Won't appear in any device's picker. Click <strong>Restore</strong> to undo.</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}
