import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbGet, dbUpdate, dbPush, dbRemove } from '../services/db/index.js';
import { isGlobalOwnerRole } from '../utils/permissions';
import { readStoredSession } from '../utils/session';
import { normalizeSites, SITE_REGION_OPTIONS } from '../utils/siteRegions';
import {
    downloadCentersTemplate,
    isDuplicateCenterCode,
    normalizeSiteCenters,
    parseCentersWorkbook,
    planCentersImport
} from '../utils/centers';

export default function Sites() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sites, setSites] = useState([]);

    // Site create/edit modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ firebaseKey: '', code: '', name: '', region: '', address: '', manager: '' });

    // Centers modal (manage centers for one specific site)
    const [centersModalSite, setCentersModalSite] = useState(null);
    const [newCenterCode, setNewCenterCode] = useState('');
    const [newCenterName, setNewCenterName] = useState('');
    const [centersWorking, setCentersWorking] = useState(false);

    // Bulk import modal
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkRows, setBulkRows] = useState([]);
    const [bulkErrors, setBulkErrors] = useState([]);
    const [bulkPlan, setBulkPlan] = useState(null); // Map<siteCode, [{code,name}]>
    const [bulkBusy, setBulkBusy] = useState(false);
    const bulkFileRef = useRef(null);

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) { navigate('/'); return; }

        const isGlobalAdmin = isGlobalOwnerRole(sess.role);
        if (!isGlobalAdmin) {
            alert('Security Error: Only the Global Owner can access the Site Management module.');
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const fetchSites = async () => {
            try {
                const snap = await dbGet(`organizations/${sess.orgId}/sites`);
                if (snap !== null) setSites(normalizeSites(snap));
            } catch (e) {
                console.error('Failed to fetch sites:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchSites();
    }, [navigate]);

    // ── Site CRUD (unchanged behaviour, just preserves centers) ──────────────

    const openForm = (site = null) => {
        if (site) setFormData({ region: '', address: '', manager: '', ...site });
        else setFormData({ firebaseKey: '', code: '', name: '', region: '', address: '', manager: '' });
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.code || !formData.name || !formData.region) return alert('Site Code, Name, and Region are required.');
        const cleanCode = formData.code.toUpperCase().trim();
        if (!formData.firebaseKey && sites.find((s) => s.code === cleanCode)) {
            return alert('A site with this code already exists.');
        }
        try {
            const existing = sites.find((s) => s.firebaseKey === formData.firebaseKey);
            const payload = {
                code: cleanCode,
                name: formData.name,
                region: formData.region,
                address: formData.address,
                manager: formData.manager,
                // Preserve any centers already attached to the site
                centers: existing?.centers || [],
                updatedAt: new Date().toISOString(),
                updatedBy: session.email
            };
            if (formData.firebaseKey) {
                await dbUpdate(`organizations/${session.orgId}/sites/${formData.firebaseKey}`, payload);
                setSites(sites.map((s) => s.firebaseKey === formData.firebaseKey ? { ...s, ...payload } : s));
            } else {
                const newId = await dbPush(`organizations/${session.orgId}/sites`, payload);
                setSites([...sites, { firebaseKey: newId, ...payload }].sort((a, b) => a.code.localeCompare(b.code)));
            }
            setIsModalOpen(false);
            alert('Site configuration saved.');
        } catch (error) {
            alert('Failed to save site: ' + error.message);
        }
    };

    const handleDelete = async (firebaseKey, code) => {
        if (!window.confirm(`WARNING: Are you sure you want to delete Site [${code}]? This may break records assigned to this site.`)) return;
        try {
            await dbRemove(`organizations/${session.orgId}/sites/${firebaseKey}`);
            setSites(sites.filter((s) => s.firebaseKey !== firebaseKey));
        } catch {
            alert('Failed to delete site.');
        }
    };

    // ── Centers (single-site management) ─────────────────────────────────────

    const openCenters = (site) => {
        setCentersModalSite(site);
        setNewCenterCode('');
        setNewCenterName('');
    };
    const closeCenters = () => setCentersModalSite(null);

    const persistCenters = async (siteKey, nextCenters) => {
        setCentersWorking(true);
        try {
            await dbUpdate(`organizations/${session.orgId}/sites/${siteKey}`, {
                centers: nextCenters,
                updatedAt: new Date().toISOString(),
                updatedBy: session.email
            });
            setSites((prev) => prev.map((s) => s.firebaseKey === siteKey ? { ...s, centers: nextCenters } : s));
            setCentersModalSite((prev) => prev ? { ...prev, centers: nextCenters } : prev);
        } catch (err) {
            alert('Failed to save centers: ' + err.message);
        } finally {
            setCentersWorking(false);
        }
    };

    const addCenter = async () => {
        if (!centersModalSite) return;
        const code = newCenterCode.trim().toUpperCase();
        const name = newCenterName.trim();
        if (!code || !name) {
            alert('Both Center Code and Center Name are required.');
            return;
        }
        const existing = normalizeSiteCenters(centersModalSite);
        if (isDuplicateCenterCode(existing, code)) {
            alert(`A center with code "${code}" already exists at this site.`);
            return;
        }
        await persistCenters(centersModalSite.firebaseKey, [...existing, { code, name }]);
        setNewCenterCode('');
        setNewCenterName('');
    };

    const removeCenter = async (centerCode) => {
        if (!centersModalSite) return;
        if (!window.confirm(`Remove center "${centerCode}"? Records that reference it will keep the code in their history but won't be re-selectable.`)) return;
        const existing = normalizeSiteCenters(centersModalSite);
        await persistCenters(centersModalSite.firebaseKey, existing.filter((c) => c.code !== centerCode));
    };

    // ── Bulk import ──────────────────────────────────────────────────────────

    const openBulk = () => {
        setBulkRows([]);
        setBulkErrors([]);
        setBulkPlan(null);
        setBulkOpen(true);
    };

    const onBulkFileChosen = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const rows = await parseCentersWorkbook(file);
            const { plan, errors } = planCentersImport(rows, sites);
            setBulkRows(rows);
            setBulkPlan(plan);
            setBulkErrors(errors);
        } catch (err) {
            alert('Could not read the file: ' + err.message);
        } finally {
            if (bulkFileRef.current) bulkFileRef.current.value = '';
        }
    };

    const applyBulkImport = async () => {
        if (!bulkPlan || bulkPlan.size === 0) {
            alert('Nothing to import — every row was rejected. Fix the errors and re-upload.');
            return;
        }
        setBulkBusy(true);
        try {
            const updates = [];
            const updatedSites = [...sites];
            for (const [siteCode, additions] of bulkPlan.entries()) {
                const idx = updatedSites.findIndex((s) => s.code === siteCode);
                if (idx === -1) continue;
                const merged = [...normalizeSiteCenters(updatedSites[idx]), ...additions];
                updatedSites[idx] = { ...updatedSites[idx], centers: merged };
                updates.push(dbUpdate(`organizations/${session.orgId}/sites/${updatedSites[idx].firebaseKey}`, {
                    centers: merged,
                    updatedAt: new Date().toISOString(),
                    updatedBy: session.email
                }));
            }
            await Promise.all(updates);
            setSites(updatedSites);
            const added = Array.from(bulkPlan.values()).reduce((acc, arr) => acc + arr.length, 0);
            alert(`Imported ${added} center${added === 1 ? '' : 's'} across ${bulkPlan.size} site${bulkPlan.size === 1 ? '' : 's'}.`);
            setBulkOpen(false);
        } catch (err) {
            alert('Bulk import failed: ' + err.message);
        } finally {
            setBulkBusy(false);
        }
    };

    const totalCenters = useMemo(
        () => sites.reduce((acc, s) => acc + normalizeSiteCenters(s).length, 0),
        [sites]
    );

    if (loading) return <div className="h-screen flex items-center justify-center bg-[var(--myth-bg)] text-[var(--myth-muted)] animate-pulse">Loading Sites...</div>;

    return (
        <div className="flex flex-col h-screen bg-[var(--myth-bg)] text-[var(--myth-ink)]">
            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-[var(--myth-muted)] hover:text-[var(--myth-ink)] transition"><i className="fas fa-arrow-left mr-2"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-200 mx-2"></div>
                    <h1 className="text-lg font-bold text-[var(--myth-ink)]"><i className="fas fa-building-shield text-emerald-500 mr-2"></i> Facility Management</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={downloadCentersTemplate} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2">
                        <i className="fas fa-download"></i> Template
                    </button>
                    <button onClick={openBulk} className="bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-2">
                        <i className="fas fa-file-import"></i> Bulk Import Centers
                    </button>
                    <button onClick={() => openForm()} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition flex items-center gap-2">
                        <i className="fas fa-plus"></i> Add Facility
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll">
                <div className="max-w-5xl mx-auto">
                    <div className="mb-4 text-xs text-[var(--myth-muted)]">
                        {sites.length} site{sites.length === 1 ? '' : 's'} configured · {totalCenters} center{totalCenters === 1 ? '' : 's'} across all sites
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="p-4 pl-6">Site Code</th>
                                    <th className="p-4">Facility Name</th>
                                    <th className="p-4">Region</th>
                                    <th className="p-4">Centers</th>
                                    <th className="p-4 pr-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sites.map((site) => {
                                    const centers = normalizeSiteCenters(site);
                                    return (
                                        <tr key={site.firebaseKey} className="hover:bg-slate-50 transition">
                                            <td className="p-4 pl-6 font-mono text-emerald-600 font-bold">{site.code}</td>
                                            <td className="p-4 font-bold text-[var(--myth-ink)]">{site.name}</td>
                                            <td className="p-4 text-xs font-bold text-sky-600">{site.region || 'Unassigned'}</td>
                                            <td className="p-4">
                                                <button onClick={() => openCenters(site)} className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-2">
                                                    <i className="fas fa-map-marker-alt text-slate-400"></i>
                                                    {centers.length} center{centers.length === 1 ? '' : 's'}
                                                    <i className="fas fa-chevron-right text-[8px] text-slate-400"></i>
                                                </button>
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => openForm(site)} className="bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition border border-blue-200">Edit</button>
                                                    <button onClick={() => handleDelete(site.firebaseKey, site.code)} className="bg-red-50 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition border border-red-200">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {sites.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">No facilities configured.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* CREATE/EDIT SITE MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
                            <h2 className="text-xl font-bold text-[var(--myth-ink)]">{formData.firebaseKey ? 'Edit Facility' : 'Register New Facility'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-[var(--myth-ink)]"><i className="fas fa-times text-xl"></i></button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Unique Site Code</label>
                                <input required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="e.g. NYC-01" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] font-mono outline-none focus:border-emerald-500 uppercase" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Facility Name</label>
                                <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. New York Assembly Plant" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Region</label>
                                <select required value={formData.region} onChange={(e) => setFormData({ ...formData, region: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] outline-none focus:border-emerald-500">
                                    <option value="">Select Region...</option>
                                    {SITE_REGION_OPTIONS.map((region) => <option key={region} value={region}>{region}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Address / Location</label>
                                <textarea rows="2" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Optional address..." className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] outline-none focus:border-emerald-500 custom-scroll"></textarea>
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-[var(--myth-ink)] font-bold py-3 rounded-xl transition tracking-widest uppercase text-xs border border-slate-200">Cancel</button>
                                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-sm transition tracking-widest uppercase text-xs">Save Facility</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CENTERS MODAL */}
            {centersModalSite && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-2xl w-full shadow-2xl">
                        <div className="flex justify-between items-center mb-2 border-b border-slate-200 pb-4">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Centers / Points</p>
                                <h2 className="text-xl font-bold text-[var(--myth-ink)]">{centersModalSite.name}  <span className="font-mono text-emerald-600 ml-1">({centersModalSite.code})</span></h2>
                            </div>
                            <button onClick={closeCenters} className="text-slate-400 hover:text-[var(--myth-ink)]"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <p className="text-xs text-slate-500 mb-4">A site can have many centers (work areas, lines, sections). Records in every module can reference one of these centers in addition to the site.</p>

                        <div className="grid gap-3 md:grid-cols-[120px,1fr,auto] mb-4">
                            <input
                                value={newCenterCode}
                                onChange={(e) => setNewCenterCode(e.target.value.toUpperCase())}
                                placeholder="Code"
                                className="bg-white border border-slate-200 rounded-xl p-3 text-sm font-mono text-[var(--myth-ink)] uppercase outline-none focus:border-emerald-500"
                            />
                            <input
                                value={newCenterName}
                                onChange={(e) => setNewCenterName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCenter(); } }}
                                placeholder="Center / Point Name"
                                className="bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] outline-none focus:border-emerald-500"
                            />
                            <button
                                onClick={addCenter}
                                disabled={centersWorking || !newCenterCode.trim() || !newCenterName.trim()}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i className="fas fa-plus mr-1"></i> Add
                            </button>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden max-h-80 overflow-y-auto custom-scroll">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="p-3 pl-4">Code</th>
                                        <th className="p-3">Name</th>
                                        <th className="p-3 pr-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {normalizeSiteCenters(centersModalSite).map((c) => (
                                        <tr key={c.code} className="bg-white">
                                            <td className="p-3 pl-4 font-mono text-emerald-600 font-bold">{c.code}</td>
                                            <td className="p-3 text-[var(--myth-ink)]">{c.name}</td>
                                            <td className="p-3 pr-4 text-right">
                                                <button
                                                    onClick={() => removeCenter(c.code)}
                                                    disabled={centersWorking}
                                                    className="bg-red-50 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition border border-red-200 disabled:opacity-50"
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {normalizeSiteCenters(centersModalSite).length === 0 && (
                                        <tr><td colSpan={3} className="p-8 text-center text-slate-400 italic">No centers added to this site yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button onClick={closeCenters} className="bg-slate-100 hover:bg-slate-200 text-[var(--myth-ink)] font-bold px-5 py-2.5 rounded-xl transition tracking-widest uppercase text-xs border border-slate-200">Done</button>
                        </div>
                    </div>
                </div>
            )}

            {/* BULK IMPORT MODAL */}
            {bulkOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-3xl w-full shadow-2xl">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-4">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Centers</p>
                                <h2 className="text-xl font-bold text-[var(--myth-ink)]">Bulk Import</h2>
                            </div>
                            <button onClick={() => setBulkOpen(false)} className="text-slate-400 hover:text-[var(--myth-ink)]"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="bg-sky-50 border border-sky-200 text-sky-900 text-xs rounded-xl p-4 mb-4 leading-relaxed">
                            <p className="font-bold mb-1">Expected columns: <span className="font-mono">Site Code</span>, <span className="font-mono">Center Code</span>, <span className="font-mono">Center Name</span>.</p>
                            <p>Each row creates one center under the matching site. Sites must already exist. Duplicate codes within a site are skipped. <button onClick={downloadCentersTemplate} className="font-bold underline">Download a template</button> if you need a starting point.</p>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <input
                                ref={bulkFileRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={onBulkFileChosen}
                                className="text-xs file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-sky-600 file:text-white hover:file:bg-sky-500 cursor-pointer"
                            />
                            {bulkRows.length > 0 && (
                                <span className="text-xs text-slate-500">
                                    {bulkRows.length} row{bulkRows.length === 1 ? '' : 's'} read · {bulkPlan ? Array.from(bulkPlan.values()).reduce((a, b) => a + b.length, 0) : 0} ready · {bulkErrors.length} error{bulkErrors.length === 1 ? '' : 's'}
                                </span>
                            )}
                        </div>

                        {bulkErrors.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 max-h-40 overflow-y-auto custom-scroll">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-2">Rows that will be skipped</p>
                                <ul className="text-xs text-red-700 space-y-1">
                                    {bulkErrors.map((e, i) => (
                                        <li key={i}><span className="font-mono font-bold">Row {e.row}:</span> {e.message}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {bulkPlan && bulkPlan.size > 0 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 max-h-60 overflow-y-auto custom-scroll">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-2">Centers to be added</p>
                                <ul className="text-xs text-emerald-800 space-y-1">
                                    {Array.from(bulkPlan.entries()).map(([siteCode, list]) => (
                                        <li key={siteCode}>
                                            <span className="font-mono font-bold">{siteCode}:</span> {list.map((c) => `${c.code} ${c.name}`).join(' · ')}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="pt-2 flex justify-end gap-3">
                            <button onClick={() => setBulkOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-[var(--myth-ink)] font-bold px-5 py-2.5 rounded-xl transition tracking-widest uppercase text-xs border border-slate-200">Cancel</button>
                            <button
                                onClick={applyBulkImport}
                                disabled={bulkBusy || !bulkPlan || bulkPlan.size === 0}
                                className="bg-sky-600 hover:bg-sky-500 text-white font-bold px-5 py-2.5 rounded-xl transition tracking-widest uppercase text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {bulkBusy ? 'Importing…' : 'Apply Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
