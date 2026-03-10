import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, push, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

const STATUSES = ['Approved', 'Pending Review', 'Suspended', 'Expired'];
const DOC_TYPES = ['Liability Insurance', 'Trade License', 'General Risk Assessment (HIRA)', 'Safety Policy', 'Other'];

export default function Contractors() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('dashboard'); // 'dashboard' | 'list' | 'form'

    const [contractors, setContractors] = useState([]);
    const [sites, setSites] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [saving, setSaving] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        id: '', siteId: '', companyName: '', contactPerson: '', email: '', phone: '',
        serviceType: '', status: 'Pending Review', notes: '',
        documents: [], // { id, type, name, expiryDate, status }
        workers: [] // { id, name, role, inductionDate, status }
    });

    const [newDoc, setNewDoc] = useState({ type: 'Liability Insurance', name: '', expiryDate: '' });
    const [newWorker, setNewWorker] = useState({ name: '', role: 'Worker', inductionDate: new Date().toISOString().split('T')[0] });

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);

        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        if (!isGlobalAdmin && ctxSite === 'All') ctxSite = sess.assignedSite;

        setSiteFilter(ctxSite);

        const fetchData = async () => {
            try {
                const snap = await get(ref(rtdb, `organizations/${sess.orgId}`));
                if (snap.exists()) {
                    const data = snap.val();
                    if (data.contractors) setContractors(Object.entries(data.contractors).map(([k, v]) => ({ firebaseKey: k, ...v })));
                    if (data.sites) setSites(Object.keys(data.sites).map(key => ({ code: data.sites[key].code || key, name: data.sites[key].name || key })));
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [navigate, location, view]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager'].includes(session?.role);

    const allowedSiteCodes = useMemo(() => {
        if (!session) return new Set();
        const codes = new Set([session.assignedSite, ...(session.accessibleSites || [])].filter(Boolean));
        if (!isGlobalUser) {
            codes.delete('GLOBAL');
            codes.delete('All');
        }
        return codes;
    }, [session, isGlobalUser]);

    const visibleSites = useMemo(() => {
        if (isGlobalUser) return sites;
        return sites.filter(s => allowedSiteCodes.has(s.code));
    }, [sites, isGlobalUser, allowedSiteCodes]);

    const visibleContractors = useMemo(() => {
        return contractors.filter(c => {
            if (!isGlobalUser && session?.assignedSite !== 'GLOBAL' && c.siteId !== session?.assignedSite && !(session?.accessibleSites || []).includes(c.siteId)) return false;
            if (siteFilter !== 'All' && c.siteId !== siteFilter) return false;
            return true;
        });
    }, [contractors, siteFilter, isGlobalUser, session]);

    const stats = useMemo(() => {
        let total = visibleContractors.length;
        let approved = 0;
        let pending = 0;
        let expiringDocs = 0;
        const today = new Date();
        const thirtyDays = new Date(today);
        thirtyDays.setDate(thirtyDays.getDate() + 30);

        visibleContractors.forEach(c => {
            if (c.status === 'Approved') approved++;
            if (c.status === 'Pending Review') pending++;

            if (c.documents) {
                c.documents.forEach(d => {
                    if (d.expiryDate) {
                        const exp = new Date(d.expiryDate);
                        if (exp <= thirtyDays) expiringDocs++;
                    }
                });
            }
        });
        return { total, approved, pending, expiringDocs };
    }, [visibleContractors]);

    const documentAlerts = useMemo(() => {
        const alerts = [];
        const today = new Date();
        const thirtyDays = new Date(today);
        thirtyDays.setDate(thirtyDays.getDate() + 30);

        visibleContractors.forEach(c => {
            if (c.documents) {
                c.documents.forEach(d => {
                    if (d.expiryDate) {
                        const exp = new Date(d.expiryDate);
                        if (exp < today) {
                            alerts.push({ company: c.companyName, doc: d.name, type: d.type, expiry: d.expiryDate, status: 'Expired', cId: c.firebaseKey });
                        } else if (exp <= thirtyDays) {
                            alerts.push({ company: c.companyName, doc: d.name, type: d.type, expiry: d.expiryDate, status: 'Expiring Soon', cId: c.firebaseKey });
                        }
                    }
                });
            }
        });
        return alerts.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    }, [visibleContractors]);

    const handleSave = async () => {
        if (!formData.companyName || !formData.siteId) return alert("Company Name and Site are required.");

        setSaving(true);
        try {
            const payload = {
                ...formData,
                updatedBy: session.name || session.email,
                lastUpdated: new Date().toISOString()
            };
            if (!payload.createdAt) payload.createdAt = new Date().toISOString();

            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/contractors/${formData.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/contractors`), payload);
            }

            const snap = await get(ref(rtdb, `organizations/${session.orgId}/contractors`));
            if (snap.exists()) setContractors(Object.entries(snap.val()).map(([k, v]) => ({ firebaseKey: k, ...v })));

            setView('list');
        } catch (e) { alert("Save failed: " + e.message); }
        setSaving(false);
    };

    const handleDelete = async (key) => {
        if (!canEdit) return alert("Permission denied.");
        if (window.confirm("Permanently remove this contractor and all their records?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/contractors/${key}`));
            setContractors(prev => prev.filter(c => c.firebaseKey !== key));
        }
    };

    const addDocument = () => {
        if (!newDoc.name || !newDoc.expiryDate) return alert("Document name and expiry date required.");
        setFormData(prev => ({
            ...prev,
            documents: [...(prev.documents || []), { ...newDoc, id: Date.now().toString() }]
        }));
        setNewDoc({ type: 'Liability Insurance', name: '', expiryDate: '' });
    };

    const removeDocument = (id) => {
        setFormData(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== id) }));
    };

    const addWorker = () => {
        if (!newWorker.name) return alert("Worker name required.");
        setFormData(prev => ({
            ...prev,
            workers: [...(prev.workers || []), { ...newWorker, id: Date.now().toString(), status: 'Active' }]
        }));
        setNewWorker({ name: '', role: 'Worker', inductionDate: new Date().toISOString().split('T')[0] });
    };

    const removeWorker = (id) => {
        setFormData(prev => ({ ...prev, workers: prev.workers.filter(w => w.id !== id) }));
    };

    const exportExcel = () => {
        const exportData = visibleContractors.map(c => ({
            "Company Name": c.companyName,
            "Site": c.siteId,
            "Service Type": c.serviceType,
            "Contact Person": c.contactPerson,
            "Email": c.email,
            "Phone": c.phone,
            "Status": c.status,
            "Workers Registered": c.workers?.length || 0,
            "Documents Tracked": c.documents?.length || 0
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contractors");
        XLSX.writeFile(wb, `Contractor_Registry_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-indigo-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase"><div className="w-8 h-8 border-2 border-slate-800 border-t-indigo-500 rounded-full animate-spin mr-3"></div> Loading Contractors...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/dashboard`)} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-hard-hat"></i></div>
                    <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Contractor Management</h1>
                </div>
                <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner gap-1">
                    <button onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-chart-pie mr-1"></i> Metrics</button>
                    <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'list' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-list mr-1"></i> Registry</button>
                    {canEdit && <button onClick={() => { setFormData({ id: '', siteId: siteFilter === 'All' ? '' : siteFilter, companyName: '', contactPerson: '', email: '', phone: '', serviceType: '', status: 'Pending Review', notes: '', documents: [], workers: [] }); setView('form'); }} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'form' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-plus mr-1"></i> New</button>}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">

                    {/* --- DASHBOARD VIEW --- */}
                    {view === 'dashboard' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-end mb-6">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2">Contractor Metrics</h2>
                                    <p className="text-sm text-slate-400">Overview of third-party compliance and active deployments.</p>
                                </div>
                                <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-900 border border-slate-700 text-white text-xs font-bold px-4 py-3 rounded-xl outline-none shadow-inner">
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-blue-500 shadow-xl">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Total Vendors</div>
                                    <div className="text-4xl font-black text-blue-400">{stats.total}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-emerald-500 shadow-xl">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Approved & Active</div>
                                    <div className="text-4xl font-black text-emerald-400">{stats.approved}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Pending Review</div>
                                    <div className="text-4xl font-black text-yellow-400">{stats.pending}</div>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-500 shadow-xl">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Expiring Documents</div>
                                    <div className="text-4xl font-black text-red-500">{stats.expiringDocs}</div>
                                </div>
                            </div>

                            <div className="glass-panel rounded-3xl overflow-hidden shadow-xl border border-slate-700 flex flex-col">
                                <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                                    <h3 className="font-bold text-lg text-white flex items-center gap-2"><i className="fas fa-file-contract text-orange-400"></i> Document Expiry Alerts</h3>
                                </div>
                                <div className="overflow-y-auto custom-scroll max-h-[400px]">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-950/80 backdrop-blur-md sticky top-0 text-[10px] uppercase font-bold text-slate-500 z-10 border-b border-slate-800">
                                            <tr><th className="p-4 pl-6">Company</th><th className="p-4">Document Type</th><th className="p-4">Document Name</th><th className="p-4">Expiry Date</th><th className="p-4 pr-6 text-right">Status</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50 bg-slate-950/40">
                                            {documentAlerts.map((alt, i) => (
                                                <tr key={i} className="hover:bg-slate-800/60 transition-colors">
                                                    <td className="p-4 pl-6 font-bold text-white">{alt.company}</td>
                                                    <td className="p-4 text-xs font-bold text-indigo-300">{alt.type}</td>
                                                    <td className="p-4">{alt.doc}</td>
                                                    <td className="p-4 font-mono text-xs">{alt.expiry}</td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border shadow-sm ${alt.status === 'Expired' ? 'bg-red-900/30 text-red-400 border-red-500/30 animate-pulse' : 'bg-orange-900/30 text-orange-400 border-orange-500/30'}`}>{alt.status}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {documentAlerts.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-emerald-400 italic font-bold">All contractor documents are up to date!</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- REGISTRY LIST VIEW --- */}
                    {view === 'list' && (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-1">Contractor Registry</h2>
                                    <p className="text-sm text-slate-400">Master list of approved and pending third-party vendors.</p>
                                </div>
                                <div className="flex gap-3">
                                    <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-900 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl outline-none shadow-inner">
                                        {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                    <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-file-excel"></i> Export</button>
                                </div>
                            </div>

                            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-x-auto shadow-xl">
                                <table className="w-full text-left text-sm min-w-[1000px]">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                        <tr><th className="p-4 pl-6">Company Info</th><th className="p-4">Contact Person</th><th className="p-4">Compliance Status</th><th className="p-4 text-center">Workers</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                        {visibleContractors.map(c => {
                                            const docCount = c.documents?.length || 0;
                                            const workerCount = c.workers?.length || 0;

                                            let hasExpired = false;
                                            const today = new Date().toISOString().split('T')[0];
                                            if (c.documents) {
                                                c.documents.forEach(d => { if (d.expiryDate && d.expiryDate < today) hasExpired = true; });
                                            }

                                            return (
                                                <tr key={c.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                    <td className="p-4 pl-6">
                                                        <div className="font-bold text-white text-base">{c.companyName}</div>
                                                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Site: <span className="text-indigo-400 font-bold">{c.siteId}</span> | Svc: {c.serviceType || 'General'}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-300"><i className="fas fa-user text-slate-500 mr-2"></i>{c.contactPerson || 'N/A'}</div>
                                                        <div className="text-xs text-slate-400 mt-1"><i className="fas fa-phone text-slate-500 mr-1.5"></i>{c.phone || '-'}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm block w-fit mb-1.5 ${c.status === 'Approved' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' :
                                                                c.status === 'Pending Review' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' :
                                                                    'bg-red-900/30 text-red-400 border-red-500/30'
                                                            }`}>{c.status}</span>
                                                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                                            <span><i className="fas fa-file-alt text-slate-500"></i> {docCount} Docs</span>
                                                            {hasExpired && <span className="text-red-400 font-bold animate-pulse">(Has Expired)</span>}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className="bg-slate-800 border border-slate-600 text-white font-mono font-bold px-3 py-1 rounded-lg">{workerCount}</span>
                                                    </td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            {canEdit ? (
                                                                <button onClick={() => { setFormData(c); setView('form'); }} className="bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-400 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-edit mr-1"></i> Manage</button>
                                                            ) : (
                                                                <button onClick={() => { setFormData(c); setView('form'); }} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors">View</button>
                                                            )}
                                                            {canEdit && <button onClick={() => handleDelete(c.firebaseKey)} className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {visibleContractors.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-500 italic">No contractors found matching criteria.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- REGISTRATION / EDIT FORM --- */}
                    {view === 'form' && (
                        <div className="max-w-5xl mx-auto bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
                            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                                <h3 className="text-2xl font-bold text-white flex items-center gap-3"><i className="fas fa-hard-hat text-indigo-500"></i> {formData.firebaseKey ? 'Manage Contractor Profile' : 'Register New Contractor'}</h3>
                                <button onClick={() => setView('list')} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                {/* Left Col: Company Details */}
                                <div className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-building mr-2"></i> Company Profile</h4>

                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Company Name *</label>
                                        <input value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold" placeholder="e.g. Acme Maintenance Ltd." />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Site Allocation *</label>
                                            <select value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500">
                                                <option value="">Select Site...</option>
                                                <option value="GLOBAL">Global / All Sites</option>
                                                {sites.filter(s => isGlobalUser || s.code === session?.assignedSite || (session?.accessibleSites || []).includes(s.code)).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Service Provided</label>
                                            <input value={formData.serviceType} onChange={e => setFormData({ ...formData, serviceType: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500" placeholder="e.g. HVAC, Scaffolding" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Approval Status</label>
                                        <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} disabled={!canEdit} className={`w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none font-bold ${formData.status === 'Approved' ? 'text-emerald-400 focus:border-emerald-500' : formData.status === 'Pending Review' ? 'text-yellow-400 focus:border-yellow-500' : 'text-red-400 focus:border-red-500'}`}>
                                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>

                                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 pt-4"><i className="fas fa-address-book mr-2"></i> Primary Contact</h4>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Contact Person</label>
                                        <input value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500" placeholder="Manager/Supervisor Name" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Email Address</label>
                                            <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500" placeholder="email@company.com" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Phone Number</label>
                                            <input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500" placeholder="+1..." />
                                        </div>
                                    </div>
                                </div>

                                {/* Right Col: Documents & Workers */}
                                <div className="space-y-6">
                                    {/* Documents Panel */}
                                    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col max-h-[350px]">
                                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-file-contract mr-2"></i> Compliance Documents</h4>

                                        {canEdit && (
                                            <div className="flex gap-2 mb-4">
                                                <select value={newDoc.type} onChange={e => setNewDoc({ ...newDoc, type: e.target.value })} className="w-1/3 bg-slate-900 border border-slate-700 rounded-lg text-[10px] p-2 text-white outline-none focus:border-indigo-500">
                                                    {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                                                </select>
                                                <input value={newDoc.name} onChange={e => setNewDoc({ ...newDoc, name: e.target.value })} placeholder="Doc Name/Ref..." className="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs p-2 text-white outline-none focus:border-indigo-500" />
                                                <input type="date" value={newDoc.expiryDate} onChange={e => setNewDoc({ ...newDoc, expiryDate: e.target.value })} className="w-28 bg-slate-900 border border-slate-700 rounded-lg text-[10px] p-2 text-white outline-none focus:border-indigo-500 font-mono" title="Expiry Date" />
                                                <button onClick={addDocument} className="bg-indigo-600 hover:bg-indigo-500 text-white w-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-plus"></i></button>
                                            </div>
                                        )}

                                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-2">
                                            {formData.documents?.map(doc => {
                                                const isExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                                                return (
                                                    <div key={doc.id} className={`flex items-center justify-between p-3 rounded-xl border shadow-sm ${isExpired ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-900 border-slate-700'}`}>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">{doc.name}</div>
                                                            <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-1">{doc.type}</div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-right">
                                                                <div className="text-[9px] uppercase text-slate-500">Expiry</div>
                                                                <div className={`font-mono text-xs font-bold ${isExpired ? 'text-red-400' : 'text-emerald-400'}`}>{doc.expiryDate || 'None'}</div>
                                                            </div>
                                                            {canEdit && <button onClick={() => removeDocument(doc.id)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 w-6 h-6 rounded flex items-center justify-center transition-colors text-xs"><i className="fas fa-times"></i></button>}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            {(!formData.documents || formData.documents.length === 0) && <div className="text-center p-4 text-slate-500 italic text-xs">No documents attached.</div>}
                                        </div>
                                    </div>

                                    {/* Workers Roster Panel */}
                                    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col max-h-[350px]">
                                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-users-cog mr-2"></i> Worker Roster</h4>

                                        {canEdit && (
                                            <div className="flex gap-2 mb-4">
                                                <input value={newWorker.name} onChange={e => setNewWorker({ ...newWorker, name: e.target.value })} placeholder="Worker Name..." className="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs p-2 text-white outline-none focus:border-indigo-500" />
                                                <input value={newWorker.role} onChange={e => setNewWorker({ ...newWorker, role: e.target.value })} placeholder="Role/Trade..." className="w-24 bg-slate-900 border border-slate-700 rounded-lg text-xs p-2 text-white outline-none focus:border-indigo-500" />
                                                <input type="date" value={newWorker.inductionDate} onChange={e => setNewWorker({ ...newWorker, inductionDate: e.target.value })} className="w-28 bg-slate-900 border border-slate-700 rounded-lg text-[10px] p-2 text-white outline-none focus:border-indigo-500 font-mono" title="Induction Date" />
                                                <button onClick={addWorker} className="bg-indigo-600 hover:bg-indigo-500 text-white w-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-user-plus"></i></button>
                                            </div>
                                        )}

                                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-2">
                                            {formData.workers?.map(w => (
                                                <div key={w.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
                                                    <div>
                                                        <div className="text-xs font-bold text-white">{w.name}</div>
                                                        <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-1">{w.role}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <div className="text-[9px] uppercase text-slate-500">Site Induction</div>
                                                            <div className="font-mono text-xs text-blue-300">{w.inductionDate || 'Pending'}</div>
                                                        </div>
                                                        {canEdit && <button onClick={() => removeWorker(w.id)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 w-6 h-6 rounded flex items-center justify-center transition-colors text-xs"><i className="fas fa-times"></i></button>}
                                                    </div>
                                                </div>
                                            ))}
                                            {(!formData.workers || formData.workers.length === 0) && <div className="text-center p-4 text-slate-500 italic text-xs">No workers registered.</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-4 pt-6 border-t border-slate-800">
                                <button onClick={() => setView('list')} className="px-6 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition">Cancel</button>
                                {canEdit && <button onClick={handleSave} disabled={saving} className="px-8 py-3 rounded-xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition flex items-center gap-2 disabled:opacity-50">{saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save Contractor</button>}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}