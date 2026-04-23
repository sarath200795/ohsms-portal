import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, onValue, update, push, remove } from 'firebase/database';
import * as firebaseSetup from '../config/firebase';
import * as XLSX from 'xlsx';
import { hasAccessibleModule } from '../utils/permissions';
import { canAuthenticateStatus, readStoredSession } from '../utils/session';

// Auto-detect Firebase export name to prevent import crashes
const rtdb = firebaseSetup.rtdb || firebaseSetup.db;

// ==========================================
// GLOBALS, CONFIG & BULLETPROOF FAILSAFES
// ==========================================

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const safeArrayParse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data !== 'object') return [];
    return Object.keys(data).reduce((acc, key) => {
        if (typeof data[key] === 'object' && data[key] !== null) {
            acc.push({ firebaseKey: key, ...data[key] });
        }
        return acc;
    }, []);
};

const DOC_CATEGORIES = ["Policy", "Manual", "Standard Operating Procedure (SOP)", "Form / Template", "Guideline", "Legal Register", "Record / Evidence"];

const ISO_MANDATORY_DOCS = [
    { clause: "4.3", title: "Scope of the OH&S management system", type: "Maintain (Document)" },
    { clause: "5.2", title: "OH&S policy", type: "Maintain (Document)" },
    { clause: "5.3", title: "Organizational roles, responsibilities and authorities", type: "Maintain (Document)" },
    { clause: "6.1.1", title: "OH&S risks and opportunities & actions to address them", type: "Maintain (Document)" },
    { clause: "6.1.2.2", title: "Methodologies and criteria for assessment of OH&S risks", type: "Maintain/Retain" },
    { clause: "6.1.3", title: "Legal requirements and other requirements", type: "Maintain/Retain" },
    { clause: "6.2.2", title: "OH&S objectives and plans to achieve them", type: "Maintain/Retain" },
    { clause: "7.2", title: "Evidence of competence", type: "Retain (Record)" },
    { clause: "7.4.1", title: "Evidence of communications", type: "Retain (Record)" },
    { clause: "8.1.1", title: "Operational planning and control processes", type: "Maintain/Retain" },
    { clause: "8.2", title: "Emergency preparedness and response plans", type: "Maintain/Retain" },
    { clause: "9.1.1", title: "Results of monitoring, measurement, analysis and performance evaluation", type: "Retain (Record)" },
    { clause: "9.1.1", title: "Maintenance, calibration or verification of measuring equipment", type: "Retain (Record)" },
    { clause: "9.1.2", title: "Compliance evaluation results", type: "Retain (Record)" },
    { clause: "9.2.2", title: "Audit programme and audit results", type: "Retain (Record)" },
    { clause: "9.3", title: "Results of management reviews", type: "Retain (Record)" },
    { clause: "10.2", title: "Nature of incidents or nonconformities and any subsequent actions taken", type: "Retain (Record)" },
    { clause: "10.2", title: "Results of any action and corrective action, including their effectiveness", type: "Retain (Record)" },
    { clause: "10.3", title: "Evidence of continual improvement", type: "Retain (Record)" }
];

export default function Standards() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('library');
    const [fatalError, setFatalError] = useState(null);

    const [documents, setDocuments] = useState([]);
    const [sites, setSites] = useState([]);

    // RBAC & Filter State
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });
    const [siteFilter, setSiteFilter] = useState('All');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState(null);

    // --- AUTH & LOAD DATA ---
    useEffect(() => {
        try {
            if (!rtdb) {
                throw new Error("Firebase Realtime Database (rtdb) is completely missing from config/firebase.js");
            }

            const sess = readStoredSession();
            if (!sess || !canAuthenticateStatus(sess.status)) { navigate('/'); return; }

            // Clean the role string just in case there are trailing spaces in the DB
            const cleanRole = String(sess.role || '').trim();

            // 1. BULLETPROOF MODULE GUARD
            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(cleanRole);
            const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(cleanRole);

            // Fuzzy match to catch "Standards", "Standard", "Document Control", etc.
            const hasModuleAccess = isGlobalAdmin || isSiteAdmin || hasAccessibleModule(sess.accessibleModules, 'Standards');

            if (!hasModuleAccess) {
                alert("Security Alert: You do not have permission to access the Standards & Documents module.");
                navigate('/dashboard');
                return;
            }

            setSession(sess);

            // 2. STRICT RBAC MATRIX
            const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(cleanRole);
            const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(cleanRole);

            setPermissions({
                viewOnly: !canEditCr,
                canDelete: canDel,
                canEditCreate: canEditCr
            });

            // 3. SYNCHRONIZED SITE PERSISTENCE
            const params = new URLSearchParams(location.search);
            let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';

            if (!isGlobalAdmin && ctxSite === 'All') {
                ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
            }

            setSiteFilter(ctxSite);
            sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);


            const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
            const unsubscribe = onValue(dbRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.val();
                    if (data.sites) {
                        setSites(Object.keys(data.sites).map(key => ({
                            code: data.sites[key].code || key,
                            name: data.sites[key].name || key
                        })));
                    }
                    if (data.documents) {
                        setDocuments(safeArrayParse(data.documents).sort((a, b) => new Date(b.uploadDate || 0) - new Date(a.uploadDate || 0)));
                    } else {
                        setDocuments([]);
                    }
                }
                setLoading(false);
            }, (error) => {
                setFatalError(error.message);
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (error) {
            setFatalError(error.message);
            setLoading(false);
        }
    }, [navigate, location]);

    // ==========================================
    // 4. STRICT ROW-LEVEL SECURITY (RLS)
    // ==========================================
    const role = session?.role?.trim() || 'User';
    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(role);

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

    const handleSiteFilterChange = (e) => {
        const newSite = e.target.value;
        setSiteFilter(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite === 'All' ? 'GLOBAL' : newSite);
    };

    const canViewRecord = useCallback((siteId) => (
        isGlobalUser || siteId === 'GLOBAL' || allowedSiteCodes.has(siteId)
    ), [allowedSiteCodes, isGlobalUser]);

    const canEditRecord = (siteId) => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        return allowedSiteCodes.has(siteId);
    };

    const canDeleteRecord = (siteId) => {
        if (!permissions.canDelete) return false;
        if (isGlobalUser) return true;
        return allowedSiteCodes.has(siteId);
    };

    const canEditForm = useMemo(() => {
        if (!permissions.canEditCreate) return false;
        if (isGlobalUser) return true;
        if (!formData?.siteId) return true;
        return allowedSiteCodes.has(formData.siteId) || formData.siteId === 'GLOBAL'; // Allowed to create global policy if they have access
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, formData?.siteId]);


    // --- FILTERS & STATS ---
    const filteredDocs = useMemo(() => {
        return (documents || []).filter(doc => {
            if (!canViewRecord(doc.siteId)) return false; // Hard Block

            const matchSite = siteFilter === 'All' || doc.siteId === siteFilter || doc.siteId === 'GLOBAL';
            const matchCat = categoryFilter === 'All' || doc.category === categoryFilter;
            const matchSearch = String(doc.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || String(doc.docId || '').toLowerCase().includes(searchQuery.toLowerCase());

            return matchSite && matchCat && matchSearch;
        });
    }, [documents, siteFilter, categoryFilter, searchQuery, canViewRecord]);

    const stats = useMemo(() => {
        const total = filteredDocs.length;
        const sops = filteredDocs.filter(d => String(d.category || '').includes('SOP')).length;
        const active = filteredDocs.filter(d => d.status === 'Active').length;

        const today = new Date();
        const expiringSoon = filteredDocs.filter(d => {
            if (d.status !== 'Active' || !d.expiryDate) return false;
            const expDate = new Date(d.expiryDate);
            const diffTime = expDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
            return diffDays <= 30 && diffDays > 0;
        }).length;

        const coveredClauses = new Set((filteredDocs || []).filter(d => d.isoClause && d.status === 'Active').map(d => d.isoClause));
        const complianceScore = Math.round((coveredClauses.size / ISO_MANDATORY_DOCS.length) * 100) || 0;

        return { total, sops, active, expiringSoon, complianceScore };
    }, [filteredDocs]);

    // --- HANDLERS ---
    const openForm = (record = null) => {
        if (!record && !permissions.canEditCreate) return alert("Security Error: You do not have permission to upload documents.");

        if (record) {
            setFormData({ ...record });
        } else {
            setFormData({
                docId: `DOC-${Math.floor(10000 + Math.random() * 90000)}`,
                firebaseKey: '',
                title: '',
                category: 'Standard Operating Procedure (SOP)',
                siteId: (!isGlobalUser && visibleSites.length === 1) ? visibleSites[0].code : (siteFilter !== 'All' ? siteFilter : 'GLOBAL'),
                isoClause: '',
                version: '1.0',
                status: 'Draft',
                author: session?.name || session?.email || 'System User',
                uploadDate: new Date().toISOString().split('T')[0],
                expiryDate: '',
                description: '',
                fileData: null,
                fileName: ''
            });
        }
        setView('form');
    };

    const handleFileUpload = async (e) => {
        if (!canEditForm) return;
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                return alert("File is too large for database storage. Please keep it under 2MB.");
            }
            try {
                const b64 = await fileToBase64(file);
                setFormData({ ...formData, fileData: b64, fileName: file.name });
            } catch {
                alert("Error reading file.");
            }
        }
    };

    const saveDocument = async () => {
        if (!canEditForm) return alert("Security Error: You do not have permission to edit documents for this site.");
        if (!formData.title || !formData.siteId) return alert("Title and Site are required.");

        // Hard Block Backend Write if they attempt to inject a site they don't own
        if (!isGlobalUser && formData.siteId !== 'GLOBAL' && !allowedSiteCodes.has(formData.siteId)) {
            return alert("Security Error: You are not authorized to save documents for this site.");
        }

        try {
            const payload = { ...formData, lastUpdated: new Date().toISOString(), updatedBy: session.name || session.email };
            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/documents/${formData.firebaseKey}`), payload);
            } else {
                const newRef = await push(ref(rtdb, `organizations/${session.orgId}/documents`), payload);
                payload.firebaseKey = newRef.key;
            }
            alert(`Document ${payload.status} successfully.`);
            setView('library');
        } catch (e) {
            alert("Error saving document: " + e.message);
        }
    };

    const deleteDocument = async (key) => {
        if (!window.confirm("Permanently delete this document? This cannot be undone.")) return;
        try {
            await remove(ref(rtdb, `organizations/${session.orgId}/documents/${key}`));
        } catch {
            alert("Error deleting document.");
        }
    };

    const exportExcel = () => {
        try {
            const dataToExport = filteredDocs.map(d => ({
                "Document ID": d.docId,
                "Title": d.title,
                "Category": d.category,
                "ISO 45001 Clause": d.isoClause || 'Not Mapped',
                "Site": d.siteId,
                "Version": d.version,
                "Status": d.status,
                "Author": d.author,
                "Upload Date": d.uploadDate,
                "Expiry Date": d.expiryDate || 'N/A'
            }));
            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Document_Register");
            XLSX.writeFile(wb, `Document_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch {
            alert("Export failed. Ensure 'xlsx' package is installed.");
        }
    };

    // VISUAL ERROR BOUNDARY
    if (fatalError) return (
        <div className="flex h-screen items-center justify-center bg-slate-950 p-10 font-sans">
            <div className="bg-red-900/30 border-2 border-red-500 p-8 rounded-3xl text-white max-w-2xl w-full text-center">
                <i className="fas fa-exclamation-triangle text-6xl text-red-500 mb-6 block"></i>
                <h1 className="text-3xl font-bold mb-4">React Render Error</h1>
                <p className="text-lg text-red-200 mb-6">{fatalError}</p>
                <div className="bg-slate-950 p-4 rounded-xl text-left font-mono text-sm text-slate-400 overflow-auto">
                    Please take a screenshot of this box and share it.
                </div>
            </div>
        </div>
    );

    if (loading || !session) return (
        <div className="flex h-screen items-center justify-center bg-slate-950 text-white font-sans">
            <div className="border-4 border-indigo-500 rounded-full w-12 h-12 border-t-transparent animate-spin mr-4"></div>
            Loading Document Control...
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-sans overflow-hidden relative">
            <style dangerouslySetInnerHTML={{
                __html: `
                .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1); }
                .custom-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
                .custom-scroll::-webkit-scrollbar-track { background: #020617; border-radius: 4px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; border: 2px solid #020617; }
            `}} />

            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none"></div>

            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-10 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/dashboard`)} className="text-slate-400 hover:text-white transition flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-900/50"><i className="fas fa-folder-open"></i></div>
                    <h1 className="text-lg font-bold text-white tracking-wide hidden md:block">Standards & Document Control</h1>

                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
            </header>

            <div className="flex gap-3 px-8 pt-6 bg-slate-950 flex-wrap border-b border-slate-800 pb-4 z-10 relative">
                <button onClick={() => setView('library')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border whitespace-nowrap ${view === 'library' ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-book mr-2"></i> Document Library</button>
                <button onClick={() => setView('iso-tracker')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border whitespace-nowrap ${view === 'iso-tracker' ? 'bg-blue-600 text-white border-blue-500 shadow-blue-900/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'}`}><i className="fas fa-shield-check mr-2"></i> ISO 45001 Compliance</button>
                {permissions.canEditCreate && (
                    <button onClick={() => openForm()} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm border whitespace-nowrap ${view === 'form' ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/50' : 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700 hover:text-emerald-300'}`}><i className="fas fa-cloud-upload-alt mr-2"></i> Upload / Create</button>
                )}
            </div>

            <main className="flex-1 overflow-y-auto custom-scroll p-8 relative z-10">
                {view === 'library' && (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="glass-panel p-6 rounded-3xl border-l-4 border-l-indigo-500 shadow-xl bg-slate-900/50">
                                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Total Documents</h3>
                                <div className="text-5xl font-black text-white">{stats.total}</div>
                            </div>
                            <div className="glass-panel p-6 rounded-3xl border-l-4 border-l-emerald-500 shadow-xl bg-slate-900/50">
                                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Active & Published</h3>
                                <div className="text-5xl font-black text-white">{stats.active}</div>
                            </div>
                            <div className="glass-panel p-6 rounded-3xl border-l-4 border-l-blue-500 shadow-xl bg-slate-900/50">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">ISO 45001 Readiness</h3>
                                <div className="text-5xl font-black text-white">{stats.complianceScore}%</div>
                            </div>
                            <div className="glass-panel p-6 rounded-3xl border-l-4 border-l-orange-500 shadow-xl bg-slate-900/50">
                                <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">Expiring within 30 Days</h3>
                                <div className="text-5xl font-black text-white animate-pulse">{stats.expiringSoon}</div>
                            </div>
                        </div>

                        <div className="flex justify-between items-end mb-4 mt-8">
                            <h2 className="text-2xl font-bold text-white">Master Document Register</h2>
                            <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg shadow-lg transition flex items-center gap-2 text-xs"><i className="fas fa-file-excel"></i> Export Index</button>
                        </div>

                        <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-900/80">
                            <div className="p-4 border-b border-slate-700 bg-slate-950/50 flex flex-wrap gap-4 items-center">
                                <div className="relative flex-1 min-w-[200px]">
                                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                    <input type="text" placeholder="Search by title or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-700 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:border-indigo-500 text-white outline-none" />
                                </div>
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="bg-slate-900 border border-slate-700 text-white px-4 py-2.5 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold">
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                    <option value="GLOBAL">Global Corporate</option>
                                    {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-slate-900 border border-slate-700 text-white px-4 py-2.5 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold">
                                    <option value="All">All Categories</option>
                                    {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-700">
                                    <tr>
                                        <th className="p-5">Doc ID & Version</th>
                                        <th className="p-5 w-1/3">Title & Category</th>
                                        <th className="p-5">ISO Clause</th>
                                        <th className="p-5">Site</th>
                                        <th className="p-5">Status</th>
                                        <th className="p-5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                                    {filteredDocs.map((doc) => (
                                        <tr key={doc.firebaseKey} className="hover:bg-slate-800/80 transition-colors">
                                            <td className="p-5">
                                                <div className="font-mono text-xs font-bold text-indigo-400">{doc.docId}</div>
                                                <div className="text-[10px] text-slate-500 uppercase mt-1">v{doc.version}</div>
                                            </td>
                                            <td className="p-5">
                                                <div className="font-bold text-slate-200 text-base mb-1">{doc.title}</div>
                                                <div className="text-[10px] font-bold text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded inline-block border border-blue-500/30">{doc.category}</div>
                                            </td>
                                            <td className="p-5">
                                                {doc.isoClause ? <span className="font-mono text-xs text-white bg-slate-900 px-2 py-1 rounded border border-slate-700">{doc.isoClause}</span> : <span className="text-xs text-slate-500 italic">-</span>}
                                            </td>
                                            <td className="p-5">
                                                <div className="font-bold">{doc.siteId}</div>
                                                <div className="text-[10px] text-slate-500">Updated: {doc.uploadDate}</div>
                                            </td>
                                            <td className="p-5">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border ${doc.status === 'Active' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20' : doc.status === 'Draft' ? 'text-slate-400 border-slate-600 bg-slate-800' : 'text-orange-400 border-orange-500/30 bg-orange-900/20'}`}>
                                                    {doc.status}
                                                </span>
                                            </td>
                                            <td className="p-5 text-right flex justify-end gap-2">
                                                {doc.fileData && (
                                                    <a href={doc.fileData} download={doc.fileName} className="bg-indigo-900/30 hover:bg-indigo-600 text-indigo-400 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition border border-indigo-500/30 shadow flex items-center gap-2">
                                                        <i className="fas fa-download"></i> DL
                                                    </a>
                                                )}

                                                {canEditRecord(doc.siteId) ? (
                                                    <button onClick={() => openForm(doc)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs transition border border-slate-600 shadow" title="Edit"><i className="fas fa-edit"></i></button>
                                                ) : (
                                                    <button onClick={() => openForm(doc)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs transition border border-slate-600 shadow" title="View"><i className="fas fa-eye"></i></button>
                                                )}

                                                {canDeleteRecord(doc.siteId) && (
                                                    <button onClick={() => deleteDocument(doc.firebaseKey)} className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white px-3 py-2 rounded-lg text-xs transition border border-red-500/20 shadow" title="Delete"><i className="fas fa-trash"></i></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredDocs.length === 0 && <tr><td colSpan="6" className="p-16 text-center text-slate-500 italic text-base">No documents found matching filters.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {view === 'iso-tracker' && (
                    <div className="max-w-7xl mx-auto animate-fade-in space-y-6">
                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">ISO 45001 Mandatory Documentation</h2>
                                <p className="text-sm text-slate-400">Track compliance against specific clauses requiring documented information.</p>
                            </div>
                            <div className="bg-slate-900 px-6 py-3 rounded-2xl border border-slate-700 shadow-inner text-center">
                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Compliance Score</div>
                                <div className={`text-3xl font-black ${stats.complianceScore === 100 ? 'text-emerald-400' : stats.complianceScore > 50 ? 'text-blue-400' : 'text-orange-400'}`}>{stats.complianceScore}%</div>
                            </div>
                        </div>

                        <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-900/80">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-700">
                                    <tr>
                                        <th className="p-5 w-24">Clause</th>
                                        <th className="p-5">ISO 45001 Requirement</th>
                                        <th className="p-5 w-48">Requirement Type</th>
                                        <th className="p-5 w-48 text-center">Compliance Status</th>
                                        <th className="p-5 w-1/3">Mapped Documents (Active)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                                    {ISO_MANDATORY_DOCS.map((req, idx) => {
                                        const mappedDocs = (filteredDocs || []).filter(d => d.isoClause === req.clause && d.status === 'Active');
                                        const isCompliant = mappedDocs.length > 0;

                                        return (
                                            <tr key={idx} className="hover:bg-slate-800/80 transition-colors">
                                                <td className="p-5 font-mono text-sm font-bold text-white">{req.clause}</td>
                                                <td className="p-5 font-medium text-slate-200">{req.title}</td>
                                                <td className="p-5"><span className="text-[10px] uppercase bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">{req.type}</span></td>
                                                <td className="p-5 text-center">
                                                    {isCompliant ? (
                                                        <span className="text-xs font-bold text-emerald-400 bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-500/30 inline-flex items-center gap-2"><i className="fas fa-check-circle"></i> Compliant</span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-rose-400 bg-rose-900/20 px-3 py-1.5 rounded-lg border border-rose-500/30 inline-flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> Missing Document</span>
                                                    )}
                                                </td>
                                                <td className="p-5">
                                                    {isCompliant ? (
                                                        <ul className="space-y-1">
                                                            {mappedDocs.map(d => (
                                                                <li key={d.firebaseKey} className="text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 flex justify-between items-center">
                                                                    <span className="truncate max-w-[200px]" title={d.title}>{d.title}</span>
                                                                    <span className="text-[9px] font-mono text-slate-500">{d.docId}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-xs italic text-slate-500">No documents mapped to this clause.</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {view === 'form' && formData && (
                    <div className="max-w-5xl mx-auto animate-fade-in pb-20">
                        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                            <h2 className="text-3xl font-bold text-white">{formData.firebaseKey ? (canEditForm ? 'Edit Document' : 'View Document') : 'Upload Document'}</h2>
                            <div className="flex gap-3">
                                <button onClick={() => setView('library')} className="text-slate-400 hover:text-white px-4 py-2 font-bold text-sm transition">Cancel</button>
                                {canEditForm && (
                                    <button onClick={saveDocument} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-900/50 transition flex items-center gap-2 transform active:scale-95"><i className="fas fa-save"></i> Save & Publish</button>
                                )}
                            </div>
                        </div>

                        <div className="glass-panel p-8 rounded-3xl shadow-2xl border-t-4 border-indigo-500 bg-slate-900/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <div className="md:col-span-2">
                                    <label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Document Title</label>
                                    <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} disabled={!canEditForm} placeholder="e.g. Hazardous Waste Handling Procedure" className="bg-slate-950 border border-slate-700 text-white font-bold text-xl rounded-xl p-3 outline-none w-full focus:border-indigo-500 shadow-inner" />
                                </div>

                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Document Category</label>
                                    <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} disabled={!canEditForm} className="bg-slate-950 border border-slate-700 text-white font-bold rounded-xl p-3 outline-none w-full focus:border-indigo-500 shadow-inner">
                                        {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-blue-400 block mb-2 tracking-widest"><i className="fas fa-link"></i> Map to ISO 45001 Clause (Optional)</label>
                                    <select value={formData.isoClause || ''} onChange={e => setFormData({ ...formData, isoClause: e.target.value })} disabled={!canEditForm} className="bg-blue-950/20 border border-blue-900 text-white font-bold rounded-xl p-3 outline-none w-full focus:border-blue-500 shadow-inner">
                                        <option value="">-- No Specific Clause Mapping --</option>
                                        {ISO_MANDATORY_DOCS.map((req, idx) => (
                                            <option key={idx} value={req.clause}>Clause {req.clause} - {req.title.substring(0, 40)}...</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Site Applicability</label>
                                    <select value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value })} disabled={formData.firebaseKey || !canEditForm} className="bg-slate-950 border border-slate-700 text-white font-bold rounded-xl p-3 outline-none w-full focus:border-indigo-500 shadow-inner">
                                        {(isGlobalUser || visibleSites.length > 1) && <option value="GLOBAL">Global (All Sites)</option>}
                                        {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Version</label><input value={formData.version} onChange={e => setFormData({ ...formData, version: e.target.value })} disabled={!canEditForm} placeholder="1.0" className="bg-slate-950 border border-slate-700 text-indigo-400 font-mono font-bold rounded-xl p-3 outline-none w-full shadow-inner" /></div>
                                    <div>
                                        <label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Status</label>
                                        <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} disabled={!canEditForm} className={`bg-slate-950 border border-slate-700 font-bold rounded-xl p-3 outline-none w-full shadow-inner ${formData.status === 'Active' ? 'text-emerald-400' : 'text-slate-400'}`}>
                                            <option>Draft</option><option>Active</option><option>Archived</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Effective Date</label><input type="date" value={formData.uploadDate} onChange={e => setFormData({ ...formData, uploadDate: e.target.value })} disabled={!canEditForm} className="bg-slate-950 border border-slate-700 text-white rounded-xl p-3 outline-none w-full shadow-inner" /></div>
                                    <div><label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Expiry / Review Date</label><input type="date" value={formData.expiryDate || ''} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} disabled={!canEditForm} className="bg-slate-950 border border-slate-700 text-orange-300 rounded-xl p-3 outline-none w-full shadow-inner" /></div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="text-xs uppercase font-bold text-slate-400 block mb-2 tracking-widest">Document Abstract / Description</label>
                                    <textarea rows="3" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} disabled={!canEditForm} placeholder="Briefly describe the purpose of this document..." className="bg-slate-950 border border-slate-700 text-white rounded-xl p-3 outline-none w-full resize-none focus:border-indigo-500 shadow-inner"></textarea>
                                </div>

                                <div className="md:col-span-2 border-t border-slate-800 pt-6">
                                    <label className="text-xs uppercase font-bold text-indigo-400 block mb-3 tracking-widest"><i className="fas fa-cloud-upload-alt mr-2"></i> File Attachment (PDF, DOCX, XLSX)</label>
                                    <div className="flex items-center gap-6 bg-slate-950 p-6 rounded-2xl border border-slate-700 border-dashed shadow-inner">
                                        {canEditForm && (
                                            <input type="file" onChange={handleFileUpload} className="text-sm file:bg-indigo-600 file:text-white file:border-none file:rounded-lg file:px-6 file:py-3 file:mr-4 file:font-bold file:cursor-pointer cursor-pointer text-slate-400 w-auto" />
                                        )}
                                        {formData.fileName && (
                                            <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg font-bold text-sm shadow-sm">
                                                <i className="fas fa-check-circle"></i> {formData.fileName} attached.
                                                {!canEditForm && formData.fileData && (
                                                    <a href={formData.fileData} download={formData.fileName} className="ml-4 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded transition">Download File</a>
                                                )}
                                            </div>
                                        )}
                                        {!formData.fileName && !canEditForm && <div className="text-slate-500 italic">No file attached.</div>}
                                    </div>
                                    {canEditForm && <p className="text-[10px] text-slate-500 mt-2 font-mono">Max size: 2MB (Base64 encoding constraint)</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
