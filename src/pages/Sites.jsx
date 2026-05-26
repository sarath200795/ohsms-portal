import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbGet, dbUpdate, dbPush, dbRemove } from '../services/db/index.js';
import { isGlobalOwnerRole } from '../utils/permissions';
import { readStoredSession } from '../utils/session';
import { normalizeSites, SITE_REGION_OPTIONS } from '../utils/siteRegions';

export default function Sites() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sites, setSites] = useState([]);

    // Modal & Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ firebaseKey: '', code: '', name: '', region: '', address: '', manager: '' });

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess) { navigate('/'); return; }

        const isGlobalAdmin = isGlobalOwnerRole(sess.role);
        if (!isGlobalAdmin) {
            alert("Security Error: Only the Global Owner can access the Site Management module.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const fetchSites = async () => {
            try {
                const snap = await dbGet(`organizations/${sess.orgId}/sites`);
                if (snap !== null) {
                    setSites(normalizeSites(snap));
                }
            } catch (e) {
                console.error("Failed to fetch sites:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchSites();
    }, [navigate]);

    const openForm = (site = null) => {
        if (site) {
            setFormData({ region: '', address: '', manager: '', ...site });
        } else {
            setFormData({ firebaseKey: '', code: '', name: '', region: '', address: '', manager: '' });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.code || !formData.name || !formData.region) return alert("Site Code, Name, and Region are required.");

        const cleanCode = formData.code.toUpperCase().trim();

        // Check for duplicate code
        if (!formData.firebaseKey && sites.find(s => s.code === cleanCode)) {
            return alert("A site with this code already exists.");
        }

        try {
            const payload = {
                code: cleanCode,
                name: formData.name,
                region: formData.region,
                address: formData.address,
                manager: formData.manager,
                updatedAt: new Date().toISOString(),
                updatedBy: session.email
            };

            if (formData.firebaseKey) {
                // Update
                await dbUpdate(`organizations/${session.orgId}/sites/${formData.firebaseKey}`, payload);
                setSites(sites.map(s => s.firebaseKey === formData.firebaseKey ? { ...s, ...payload } : s));
            } else {
                // Create
                const newId = await dbPush(`organizations/${session.orgId}/sites`, payload);
                setSites([...sites, { firebaseKey: newId, ...payload }].sort((a, b) => a.code.localeCompare(b.code)));
            }

            setIsModalOpen(false);
            alert("Site configuration saved.");
        } catch (error) {
            alert("Failed to save site: " + error.message);
        }
    };

    const handleDelete = async (firebaseKey, code) => {
        if (!window.confirm(`WARNING: Are you sure you want to delete Site [${code}]? This may break records assigned to this site.`)) return;
        try {
            await dbRemove(`organizations/${session.orgId}/sites/${firebaseKey}`);
            setSites(sites.filter(s => s.firebaseKey !== firebaseKey));
            alert("Site deleted successfully.");
        } catch {
            alert("Failed to delete site.");
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-[var(--myth-bg)] text-[var(--myth-muted)] animate-pulse">Loading Sites...</div>;

    return (
        <div className="flex flex-col h-screen bg-[var(--myth-bg)] text-[var(--myth-ink)]">
            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-[var(--myth-muted)] hover:text-[var(--myth-ink)] transition"><i className="fas fa-arrow-left mr-2"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-200 mx-2"></div>
                    <h1 className="text-lg font-bold text-[var(--myth-ink)]"><i className="fas fa-building-shield text-emerald-500 mr-2"></i> Facility Management</h1>
                </div>
                <button onClick={() => openForm()} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition flex items-center gap-2">
                    <i className="fas fa-plus"></i> Add Facility
                </button>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll">
                <div className="max-w-5xl mx-auto">
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="p-4 pl-6">Site Code</th>
                                    <th className="p-4">Facility Name</th>
                                    <th className="p-4">Region</th>
                                    <th className="p-4">Location / Address</th>
                                    <th className="p-4 pr-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sites.map(site => (
                                    <tr key={site.firebaseKey} className="hover:bg-slate-50 transition">
                                        <td className="p-4 pl-6 font-mono text-emerald-600 font-bold">{site.code}</td>
                                        <td className="p-4 font-bold text-[var(--myth-ink)]">{site.name}</td>
                                        <td className="p-4 text-xs font-bold text-sky-600">{site.region || 'Unassigned'}</td>
                                        <td className="p-4 text-[var(--myth-muted)] text-xs">{site.address || 'N/A'}</td>
                                        <td className="p-4 pr-6 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => openForm(site)} className="bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition border border-blue-200">Edit</button>
                                                <button onClick={() => handleDelete(site.firebaseKey, site.code)} className="bg-red-50 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition border border-red-200">Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {sites.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">No facilities configured.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* CREATE/EDIT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
                            <h2 className="text-xl font-bold text-[var(--myth-ink)]">{formData.firebaseKey ? 'Edit Facility' : 'Register New Facility'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-[var(--myth-ink)]"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Unique Site Code</label>
                                <input required value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="e.g. NYC-01" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] font-mono outline-none focus:border-emerald-500 uppercase" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Facility Name</label>
                                <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. New York Assembly Plant" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Region</label>
                                <select required value={formData.region} onChange={e => setFormData({ ...formData, region: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] outline-none focus:border-emerald-500">
                                    <option value="">Select Region...</option>
                                    {SITE_REGION_OPTIONS.map((region) => <option key={region} value={region}>{region}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-[var(--myth-muted)] block mb-2">Address / Location</label>
                                <textarea rows="2" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Optional address..." className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-[var(--myth-ink)] outline-none focus:border-emerald-500 custom-scroll"></textarea>
                            </div>

                            <div className="pt-4 flex gap-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-[var(--myth-ink)] font-bold py-3 rounded-xl transition tracking-widest uppercase text-xs border border-slate-200">Cancel</button>
                                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-sm transition tracking-widest uppercase text-xs">Save Facility</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
