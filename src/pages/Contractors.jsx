import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, push, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

// --- INDIAN LEGAL COMPLIANCE MAPPING ---
const SERVICE_TYPES = ['General / Housekeeping', 'Construction / Civil', 'Electrical', 'Mechanical', 'Chemical / Hazardous'];

const getMandatoryDocs = (serviceType) => {
    const baseDocs = [
        { type: 'PF Registration', isMandatory: true, status: 'Pending' },
        { type: 'ESI / Workmen Compensation Policy', isMandatory: true, status: 'Pending' },
        { type: 'Labour License (Form VI)', isMandatory: true, status: 'Pending' },
        { type: 'Medical Fitness Certificates (Form 33)', isMandatory: true, status: 'Pending' }
    ];

    if (serviceType === 'Construction / Civil') {
        baseDocs.push({ type: 'BOCW Registration', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Electrical') {
        baseDocs.push({ type: 'Valid Electrical Contractor License (CEA)', isMandatory: true, status: 'Pending' });
    } else if (serviceType === 'Chemical / Hazardous') {
        baseDocs.push({ type: 'Hazardous Waste Handling Permit', isMandatory: true, status: 'Pending' });
    }

    return baseDocs.map(d => ({ ...d, id: Math.random().toString(36).substr(2, 9), name: d.type }));
};

// --- FILE UPLOAD HELPER ---
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

export default function Contractors() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('register'); // 'register' | 'compliance' | 'training' | 'incidents'

    const [contractors, setContractors] = useState([]);
    const [sites, setSites] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');
    const [saving, setSaving] = useState(false);

    // Form State (Section 1)
    const [formData, setFormData] = useState({
        id: '', siteId: '', companyName: '', contactPerson: '', email: '', phone: '',
        serviceType: 'General / Housekeeping', notes: '',
        documents: getMandatoryDocs('General / Housekeeping'),
        workers: [], trainings: [], incidents: [], nonCompliances: []
    });

    const [newWorker, setNewWorker] = useState({ name: '', role: 'Worker', competence: '', proof: null });

    // Modal States (Sections 2, 3, 4)
    const [activeVendor, setActiveVendor] = useState(null);
    const [modalType, setModalType] = useState(null); // 'docs' | 'training' | 'incident'

    // Sub-form states for Modals
    const [newDocReq, setNewDocReq] = useState('');
    const [newTraining, setNewTraining] = useState({ topic: '', date: new Date().toISOString().split('T')[0], attendees: '' });
    const [newRecord, setNewRecord] = useState({ type: 'Injury', date: new Date().toISOString().split('T')[0], desc: '', status: 'Open' });

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || (sess.accessibleModules || []).includes('Contractor Management');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission to access Contractor Management.");
            navigate('/dashboard');
            return;
        }
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
    }, [navigate, location]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager'].includes(session?.role);

    const visibleContractors = useMemo(() => {
        return contractors.filter(c => {
            if (!isGlobalUser && session?.assignedSite !== 'GLOBAL' && c.siteId !== session?.assignedSite && !(session?.accessibleSites || []).includes(c.siteId)) return false;
            if (siteFilter !== 'All' && c.siteId !== siteFilter) return false;
            return true;
        });
    }, [contractors, siteFilter, isGlobalUser, session]);

    // --- COMPLIANCE CALCULATOR ---
    const getComplianceStatus = (docs) => {
        if (!docs || docs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30' };

        const requiredDocs = docs.filter(d => d.isMandatory || d.status === 'Requested');
        const uploadedDocs = requiredDocs.filter(d => d.status === 'Uploaded' || d.status === 'Verified' || d.file);

        if (requiredDocs.length === 0) return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30' };
        if (uploadedDocs.length === 0) return { label: 'Not Complied', color: 'text-red-400 bg-red-900/20 border-red-500/30' };
        if (uploadedDocs.length < requiredDocs.length) return { label: 'Partially Complied', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30' };

        // Check expirations
        const hasExpired = uploadedDocs.some(d => d.expiryDate && new Date(d.expiryDate) < new Date());
        if (hasExpired) return { label: 'Partially Complied (Expired Docs)', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30' };

        return { label: 'Complied', color: 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30' };
    };

    // --- SECTION 1: REGISTRATION HANDLERS ---
    const handleServiceTypeChange = (e) => {
        const type = e.target.value;
        setFormData(prev => ({
            ...prev,
            serviceType: type,
            documents: getMandatoryDocs(type)
        }));
    };

    const handleWorkerProofUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2097152) return alert("File exceeds 2MB limit.");
        try {
            const b64 = await fileToBase64(file);
            setNewWorker(prev => ({ ...prev, proof: b64, proofName: file.name }));
        } catch (err) { alert("Failed to read file."); }
    };

    const addWorker = () => {
        if (!newWorker.name || !newWorker.competence) return alert("Name and Competence required.");
        setFormData(prev => ({ ...prev, workers: [...(prev.workers || []), { ...newWorker, id: Date.now().toString() }] }));
        setNewWorker({ name: '', role: 'Worker', competence: '', proof: null });
    };

    const removeWorker = (id) => {
        setFormData(prev => ({ ...prev, workers: prev.workers.filter(w => w.id !== id) }));
    };

    const saveVendorRegistration = async () => {
        if (!formData.companyName || !formData.siteId) return alert("Company Name and Site are required.");
        setSaving(true);
        try {
            const payload = { ...formData, updatedBy: session.name, lastUpdated: new Date().toISOString() };
            if (!payload.createdAt) payload.createdAt = new Date().toISOString();

            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/contractors/${formData.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/contractors`), payload);
            }
            alert("Vendor Registered/Updated Successfully!");

            // Refresh
            const snap = await get(ref(rtdb, `organizations/${session.orgId}`));
            if (snap.exists()) setContractors(Object.entries(snap.val().contractors || {}).map(([k, v]) => ({ firebaseKey: k, ...v })));

            setView('compliance');
        } catch (e) { alert("Save failed: " + e.message); }
        setSaving(false);
    };


    // --- SECTIONS 2-4: MODAL HANDLERS ---
    const updateVendorDB = async (vendorKey, payload) => {
        try {
            await update(ref(rtdb, `organizations/${session.orgId}/contractors/${vendorKey}`), payload);
            // Refresh local state
            setContractors(prev => prev.map(c => c.firebaseKey === vendorKey ? { ...c, ...payload } : c));
            setActiveVendor(prev => ({ ...prev, ...payload }));
        } catch (e) { alert("Failed to update database."); }
    };

    // Docs
    const handleDocUpload = async (docId, file) => {
        if (file.size > 2097152) return alert("File exceeds 2MB limit.");
        const b64 = await fileToBase64(file);
        const updatedDocs = activeVendor.documents.map(d => d.id === docId ? { ...d, file: b64, fileName: file.name, status: 'Uploaded' } : d);
        updateVendorDB(activeVendor.firebaseKey, { documents: updatedDocs });
    };

    const requestAdditionalDoc = () => {
        if (!newDocReq) return;
        const newDoc = { id: Date.now().toString(), type: 'Requested', name: newDocReq, isMandatory: false, status: 'Requested' };
        updateVendorDB(activeVendor.firebaseKey, { documents: [...(activeVendor.documents || []), newDoc] });
        setNewDocReq('');
    };

    // Training
    const addTrainingRecord = () => {
        if (!newTraining.topic || !newTraining.attendees) return alert("Topic and Attendees required.");
        const trn = { ...newTraining, id: Date.now().toString() };
        updateVendorDB(activeVendor.firebaseKey, { trainings: [...(activeVendor.trainings || []), trn] });
        setNewTraining({ topic: '', date: new Date().toISOString().split('T')[0], attendees: '' });
    };

    // Incidents & NC
    const addIncidentRecord = () => {
        if (!newRecord.desc) return alert("Description required.");
        const rec = { ...newRecord, id: Date.now().toString() };
        if (newRecord.type === 'Injury') {
            updateVendorDB(activeVendor.firebaseKey, { incidents: [...(activeVendor.incidents || []), rec] });
        } else {
            updateVendorDB(activeVendor.firebaseKey, { nonCompliances: [...(activeVendor.nonCompliances || []), rec] });
        }
        setNewRecord({ type: 'Injury', date: new Date().toISOString().split('T')[0], desc: '', status: 'Open' });
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
                    <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Contractor Safety</h1>
                </div>
                <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner gap-1">
                    <button onClick={() => { setFormData({ id: '', siteId: siteFilter === 'All' ? '' : siteFilter, companyName: '', contactPerson: '', email: '', phone: '', serviceType: 'General / Housekeeping', documents: getMandatoryDocs('General / Housekeeping'), workers: [], trainings: [], incidents: [], nonCompliances: [] }); setView('register'); }} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'register' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-user-plus mr-1"></i> 1. Register</button>
                    <button onClick={() => setView('compliance')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'compliance' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-file-contract mr-1"></i> 2. Compliance</button>
                    <button onClick={() => setView('training')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'training' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-graduation-cap mr-1"></i> 3. Training</button>
                    <button onClick={() => setView('incidents')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'incidents' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-exclamation-triangle mr-1"></i> 4. Incidents & NC</button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-20">

                    {/* --- GLOBAL FILTERS --- */}
                    {view !== 'register' && (
                        <div className="flex justify-between items-center mb-6 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                            <div>
                                <h2 className="text-2xl font-bold text-white">{view === 'compliance' ? 'Vendor Compliance Status' : view === 'training' ? 'Contractor Training Records' : 'Incidents & Non-Compliance'}</h2>
                                <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Select a vendor below to manage records.</p>
                            </div>
                            <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl outline-none shadow-inner">
                                {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </select>
                        </div>
                    )}

                    {/* ===================================================================== */}
                    {/* SECTION 1: REGISTER VENDOR */}
                    {/* ===================================================================== */}
                    {view === 'register' && (
                        <div className="bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
                            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                                <h3 className="text-2xl font-bold text-white flex items-center gap-3"><i className="fas fa-building text-indigo-500"></i> {formData.firebaseKey ? 'Edit Vendor Profile' : 'Section 1: Vendor Registration'}</h3>
                                {formData.firebaseKey && <button onClick={() => setView('compliance')} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                {/* Profile */}
                                <div className="space-y-6">
                                    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Company Details</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Company Name *</label>
                                                <input value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold" />
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
                                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Service Type (India Legal) *</label>
                                                    <select value={formData.serviceType} onChange={handleServiceTypeChange} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-indigo-300 font-bold outline-none focus:border-indigo-500">
                                                        {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Contact Person</label>
                                                    <input value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Phone</label>
                                                    <input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-indigo-500" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Auto-Generated Mandatory Docs Warning */}
                                    <div className="bg-indigo-950/20 p-5 rounded-2xl border border-indigo-500/30 text-sm">
                                        <div className="text-indigo-400 font-bold uppercase tracking-widest text-[10px] mb-2"><i className="fas fa-info-circle mr-1"></i> India Statutory Requirements</div>
                                        <p className="text-slate-300 leading-relaxed mb-3">Based on <strong className="text-white">{formData.serviceType}</strong>, the following documents will be automatically required in Section 2:</p>
                                        <ul className="list-disc pl-5 text-slate-400 text-xs space-y-1">
                                            {formData.documents.map((d, i) => <li key={i}>{d.name}</li>)}
                                        </ul>
                                    </div>
                                </div>

                                {/* Employees & Competence */}
                                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col max-h-[550px]">
                                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-users-cog mr-2"></i> Employee Roster & Competence</h4>

                                    {canEdit && (
                                        <div className="space-y-3 mb-6 bg-slate-900 p-4 rounded-xl border border-slate-700">
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={newWorker.name} onChange={e => setNewWorker({ ...newWorker, name: e.target.value })} placeholder="Worker Name" className="bg-slate-950 border border-slate-700 rounded-lg text-xs p-2.5 text-white outline-none focus:border-indigo-500" />
                                                <input value={newWorker.role} onChange={e => setNewWorker({ ...newWorker, role: e.target.value })} placeholder="Role (e.g. Welder)" className="bg-slate-950 border border-slate-700 rounded-lg text-xs p-2.5 text-white outline-none focus:border-indigo-500" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={newWorker.competence} onChange={e => setNewWorker({ ...newWorker, competence: e.target.value })} placeholder="Competence (e.g. ITI, 5 Yrs Exp)" className="bg-slate-950 border border-slate-700 rounded-lg text-xs p-2.5 text-white outline-none focus:border-indigo-500" />
                                                <div className="relative overflow-hidden">
                                                    <input type="file" onChange={handleWorkerProofUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                    <div className={`w-full bg-slate-950 border border-slate-700 rounded-lg text-xs p-2.5 outline-none flex justify-between items-center ${newWorker.proof ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                        <span className="truncate">{newWorker.proofName || 'Upload Proof...'}</span>
                                                        <i className="fas fa-upload"></i>
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={addWorker} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg p-2 text-xs font-bold uppercase tracking-widest transition-colors shadow"><i className="fas fa-plus mr-1"></i> Add Employee</button>
                                        </div>
                                    )}

                                    <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-2">
                                        {formData.workers?.map(w => (
                                            <div key={w.id} className="flex flex-col p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm relative group">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="text-sm font-bold text-white">{w.name} <span className="text-[9px] bg-slate-800 px-2 py-0.5 rounded ml-2 font-normal tracking-widest text-slate-400">{w.role}</span></div>
                                                        <div className="text-[10px] text-blue-300 mt-1"><i className="fas fa-certificate mr-1"></i> {w.competence}</div>
                                                    </div>
                                                    {w.proof && <a href={w.proof} target="_blank" rel="noreferrer" className="text-[10px] bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-colors"><i className="fas fa-eye"></i> View Proof</a>}
                                                </div>
                                                {canEdit && <button onClick={() => removeWorker(w.id)} className="absolute bottom-2 right-2 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash-alt"></i></button>}
                                            </div>
                                        ))}
                                        {(!formData.workers || formData.workers.length === 0) && <div className="text-center p-4 text-slate-500 italic text-xs">No employees registered yet.</div>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4 border-t border-slate-800">
                                {canEdit && <button onClick={saveVendorRegistration} disabled={saving} className="px-10 py-3.5 rounded-xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition flex items-center gap-2 uppercase tracking-widest text-sm disabled:opacity-50">{saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-arrow-right"></i>} Register & Proceed to Compliance</button>}
                            </div>
                        </div>
                    )}

                    {/* ===================================================================== */}
                    {/* SECTION 2: VENDOR COMPLIANCE STATUS */}
                    {/* ===================================================================== */}
                    {view === 'compliance' && (
                        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                            <table className="w-full text-left text-sm min-w-[1000px]">
                                <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                    <tr><th className="p-4 pl-6">Vendor Details</th><th className="p-4">Service Type</th><th className="p-4">Legal Status</th><th className="p-4">Documents</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                    {visibleContractors.map(c => {
                                        const statusObj = getComplianceStatus(c.documents);
                                        const totalDocs = c.documents ? c.documents.length : 0;
                                        const uploadedDocs = c.documents ? c.documents.filter(d => d.file || d.status === 'Uploaded').length : 0;

                                        return (
                                            <tr key={c.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-4 pl-6">
                                                    <div className="font-bold text-white text-base">{c.companyName}</div>
                                                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Site: <span className="text-indigo-400 font-bold">{c.siteId}</span></div>
                                                </td>
                                                <td className="p-4 font-medium text-slate-400">{c.serviceType}</td>
                                                <td className="p-4">
                                                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm block w-fit ${statusObj.color}`}>{statusObj.label}</span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-xs font-mono font-bold bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 w-fit">
                                                        <span className={uploadedDocs === totalDocs ? 'text-emerald-400' : 'text-yellow-400'}>{uploadedDocs}</span> / {totalDocs} Uploaded
                                                    </div>
                                                </td>
                                                <td className="p-4 pr-6 text-right">
                                                    <button onClick={() => { setActiveVendor(c); setModalType('docs'); }} className="bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-400 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-folder-open mr-1"></i> Manage Docs</button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {visibleContractors.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-500 italic">No vendors found. Please register one in Section 1.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ===================================================================== */}
                    {/* SECTION 3: TRAINING RECORDS */}
                    {/* ===================================================================== */}
                    {view === 'training' && (
                        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                            <table className="w-full text-left text-sm min-w-[1000px]">
                                <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                    <tr><th className="p-4 pl-6">Vendor Details</th><th className="p-4">Employees</th><th className="p-4">Training Sessions Logged</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                    {visibleContractors.map(c => (
                                        <tr key={c.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="p-4 pl-6">
                                                <div className="font-bold text-white text-base">{c.companyName}</div>
                                                <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Site: <span className="text-indigo-400 font-bold">{c.siteId}</span></div>
                                            </td>
                                            <td className="p-4 font-mono font-bold text-slate-300">{c.workers ? c.workers.length : 0} Reg.</td>
                                            <td className="p-4 font-mono font-bold text-blue-400">{c.trainings ? c.trainings.length : 0} Sessions</td>
                                            <td className="p-4 pr-6 text-right">
                                                <button onClick={() => { setActiveVendor(c); setModalType('training'); }} className="bg-blue-900/30 hover:bg-blue-600 border border-blue-500/30 text-blue-400 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-graduation-cap mr-1"></i> Manage Training</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {visibleContractors.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-slate-500 italic">No vendors found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ===================================================================== */}
                    {/* SECTION 4: INCIDENTS & NON-COMPLIANCE */}
                    {/* ===================================================================== */}
                    {view === 'incidents' && (
                        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                            <table className="w-full text-left text-sm min-w-[1000px]">
                                <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                    <tr><th className="p-4 pl-6">Vendor Details</th><th className="p-4 text-center">Injuries / Incidents</th><th className="p-4 text-center">Non-Compliances (NC)</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                    {visibleContractors.map(c => {
                                        const incCount = c.incidents ? c.incidents.length : 0;
                                        const ncCount = c.nonCompliances ? c.nonCompliances.length : 0;

                                        return (
                                            <tr key={c.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-4 pl-6">
                                                    <div className="font-bold text-white text-base">{c.companyName}</div>
                                                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">Site: <span className="text-indigo-400 font-bold">{c.siteId}</span></div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`font-mono font-bold px-3 py-1 rounded-lg ${incCount > 0 ? 'bg-red-900/30 text-red-400 border border-red-500/30' : 'text-slate-500'}`}>{incCount}</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`font-mono font-bold px-3 py-1 rounded-lg ${ncCount > 0 ? 'bg-orange-900/30 text-orange-400 border border-orange-500/30' : 'text-slate-500'}`}>{ncCount}</span>
                                                </td>
                                                <td className="p-4 pr-6 text-right">
                                                    <button onClick={() => { setActiveVendor(c); setModalType('incident'); }} className="bg-red-900/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-exclamation-triangle mr-1"></i> Log / View</button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {visibleContractors.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-slate-500 italic">No vendors found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}


                    {/* ===================================================================== */}
                    {/* MODALS */}
                    {/* ===================================================================== */}

                    {/* MODAL 1: COMPLIANCE DOCS */}
                    {activeVendor && modalType === 'docs' && (
                        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-3xl w-full relative max-h-[90vh] flex flex-col">
                                <button onClick={() => setActiveVendor(null)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                                <h3 className="text-2xl font-bold text-white mb-1"><i className="fas fa-folder-open text-indigo-400 mr-2"></i> Vendor Compliance Docs</h3>
                                <p className="text-slate-400 text-sm font-bold mb-6">{activeVendor.companyName}</p>

                                <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-4 mb-6">
                                    {activeVendor.documents && activeVendor.documents.map(doc => (
                                        <div key={doc.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                                            <div>
                                                <div className="text-sm font-bold text-white flex items-center gap-2">
                                                    {doc.name}
                                                    {doc.isMandatory && <span className="bg-red-900 text-red-300 text-[8px] px-1.5 py-0.5 rounded uppercase tracking-widest">Mandatory</span>}
                                                    {doc.status === 'Uploaded' && <span className="bg-emerald-900 text-emerald-300 text-[8px] px-1.5 py-0.5 rounded uppercase tracking-widest"><i className="fas fa-check"></i> Uploaded</span>}
                                                </div>
                                                {doc.expiryDate && <div className="text-[10px] font-mono text-slate-500 mt-1">Exp: {doc.expiryDate}</div>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {doc.file ? (
                                                    <a href={doc.file} target="_blank" rel="noreferrer" className="text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded border border-blue-500/30 font-bold uppercase tracking-widest transition-colors"><i className="fas fa-eye"></i> View File</a>
                                                ) : (
                                                    <div className="relative overflow-hidden w-28">
                                                        <input type="file" onChange={(e) => handleDocUpload(doc.id, e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                        <div className="w-full bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 text-[10px] p-1.5 text-center rounded uppercase font-bold tracking-widest transition-colors">Upload</div>
                                                    </div>
                                                )}
                                                {canEdit && !doc.isMandatory && (
                                                    <button onClick={() => {
                                                        const newDocs = activeVendor.documents.filter(d => d.id !== doc.id);
                                                        updateVendorDB(activeVendor.firebaseKey, { documents: newDocs });
                                                    }} className="text-slate-500 hover:text-red-500"><i className="fas fa-times"></i></button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {canEdit && (
                                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex gap-3 items-center">
                                        <input value={newDocReq} onChange={e => setNewDocReq(e.target.value)} placeholder="Request additional document (e.g. Specific ISO Cert)" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg text-sm p-2.5 text-white outline-none focus:border-indigo-500" />
                                        <button onClick={requestAdditionalDoc} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors shadow whitespace-nowrap"><i className="fas fa-paper-plane mr-1"></i> Request Doc</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* MODAL 2: TRAINING */}
                    {activeVendor && modalType === 'training' && (
                        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-4xl w-full relative max-h-[90vh] flex flex-col">
                                <button onClick={() => setActiveVendor(null)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                                <h3 className="text-2xl font-bold text-white mb-1"><i className="fas fa-graduation-cap text-blue-400 mr-2"></i> Contractor Training Log</h3>
                                <p className="text-slate-400 text-sm font-bold mb-6">{activeVendor.companyName}</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-hidden">
                                    {/* Left: Log New */}
                                    {canEdit && (
                                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col">
                                            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4">Log New Training</h4>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Topic / Course</label>
                                                    <input value={newTraining.topic} onChange={e => setNewTraining({ ...newTraining, topic: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500" placeholder="e.g. Site Safety Induction" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Date</label>
                                                    <input type="date" value={newTraining.date} onChange={e => setNewTraining({ ...newTraining, date: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 font-mono" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Attendees (Comma separated names)</label>
                                                    <textarea value={newTraining.attendees} onChange={e => setNewTraining({ ...newTraining, attendees: e.target.value })} rows="3" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 resize-none" placeholder="John Doe, Jane Smith..."></textarea>
                                                </div>
                                                <button onClick={addTrainingRecord} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow">Save Record</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Right: History */}
                                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col overflow-hidden">
                                        <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4">Training History</h4>
                                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                                            {activeVendor.trainings && activeVendor.trainings.map(t => (
                                                <div key={t.id} className="bg-slate-900 border border-slate-700 p-4 rounded-xl">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="font-bold text-sm text-white">{t.topic}</div>
                                                        <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded">{t.date}</div>
                                                    </div>
                                                    <div className="text-xs text-slate-400 italic">Attendees: {t.attendees}</div>
                                                </div>
                                            ))}
                                            {(!activeVendor.trainings || activeVendor.trainings.length === 0) && <div className="text-slate-500 italic text-sm text-center mt-10">No training recorded yet.</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MODAL 3: INCIDENTS & NC */}
                    {activeVendor && modalType === 'incident' && (
                        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-4xl w-full relative max-h-[90vh] flex flex-col">
                                <button onClick={() => setActiveVendor(null)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                                <h3 className="text-2xl font-bold text-white mb-1"><i className="fas fa-exclamation-triangle text-red-500 mr-2"></i> Incidents & Non-Compliance</h3>
                                <p className="text-slate-400 text-sm font-bold mb-6">{activeVendor.companyName}</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-hidden">
                                    {/* Left: Log New */}
                                    {canEdit && (
                                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col">
                                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-4">Log Event</h4>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Event Type</label>
                                                    <select value={newRecord.type} onChange={e => setNewRecord({ ...newRecord, type: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm font-bold text-white outline-none focus:border-red-500">
                                                        <option>Injury / Accident</option>
                                                        <option>Near Miss</option>
                                                        <option>Safety Rule Violation (NC)</option>
                                                        <option>Environmental NC</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Date Occurred</label>
                                                    <input type="date" value={newRecord.date} onChange={e => setNewRecord({ ...newRecord, date: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500 font-mono" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Description & Actions Taken</label>
                                                    <textarea value={newRecord.desc} onChange={e => setNewRecord({ ...newRecord, desc: e.target.value })} rows="4" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-red-500 resize-none" placeholder="Provide details of the event and immediate corrections..."></textarea>
                                                </div>
                                                <button onClick={addIncidentRecord} className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow">Save Record</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Right: History */}
                                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col overflow-hidden">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Event History</h4>
                                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                                            {/* Combine Incidents and NCs for display timeline */}
                                            {[...(activeVendor.incidents || []), ...(activeVendor.nonCompliances || [])]
                                                .sort((a, b) => new Date(b.date) - new Date(a.date))
                                                .map(rec => (
                                                    <div key={rec.id} className={`p-4 rounded-xl border ${rec.type.includes('NC') || rec.type.includes('Violation') ? 'bg-orange-950/20 border-orange-500/30' : 'bg-red-950/20 border-red-500/30'}`}>
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className={`font-bold text-xs uppercase tracking-widest ${rec.type.includes('NC') || rec.type.includes('Violation') ? 'text-orange-400' : 'text-red-400'}`}>{rec.type}</div>
                                                            <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded">{rec.date}</div>
                                                        </div>
                                                        <div className="text-xs text-slate-300 leading-relaxed">{rec.desc}</div>
                                                    </div>
                                                ))}
                                            {(!activeVendor.incidents && !activeVendor.nonCompliances) && <div className="text-emerald-500 italic font-bold text-sm text-center mt-10"><i className="fas fa-shield-alt mr-2"></i>Excellent! No events recorded.</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}