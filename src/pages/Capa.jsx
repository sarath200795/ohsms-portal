import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

// --- UTILITIES ---
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

export default function Capa() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [actions, setActions] = useState([]);
    const [users, setUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterSite, setFilterSite] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterSource, setFilterSource] = useState('All');

    // Closure Modal State (Now includes evidence)
    const [closureModal, setClosureModal] = useState({ isOpen: false, action: null, comment: '', evidence: null });
    const [updating, setUpdating] = useState(false);

    // RBAC
    const [permissions, setPermissions] = useState({ viewOnly: false, canEditCreate: false });

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);

        // 1. STRICT MODULE GUARD
        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || (sess.accessibleModules || []).includes('CAPA Manager');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission to access the CAPA Manager module.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        // 2. STRICT RBAC MATRIX
        const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(sess.role);
        setPermissions({ viewOnly: !canEditCr, canEditCreate: canEditCr });

        // 3. SYNCHRONIZED SITE PERSISTENCE
        const params = new URLSearchParams(location.search);
        const urlSite = params.get('site');

        let storedSite = sessionStorage.getItem('isoCurrentSite');
        if (storedSite === 'GLOBAL') storedSite = 'All';

        let ctxSite = urlSite || storedSite || 'All';

        if (!isGlobalAdmin && ctxSite === 'All') {
            ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
        }

        setFilterSite(ctxSite);
        sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);

        fetchActions(sess.orgId);
    }, [navigate, location]);

    const fetchActions = async (orgId) => {
        setLoading(true);
        try {
            const dbRef = ref(rtdb, `organizations/${orgId}`);
            const snap = await get(dbRef);

            if (snap.exists()) {
                const data = snap.val();
                const allActions = [];

                if (data.sites) {
                    const parsedSites = Object.keys(data.sites).map(key => {
                        const sVal = data.sites[key];
                        return typeof sVal === 'object' ? { code: sVal.code || key, name: sVal.name || sVal.code || key } : { code: sVal, name: sVal };
                    });
                    setSites(parsedSites);
                }

                if (data.users) {
                    setUsers(Object.entries(data.users)
                        .map(([k, v]) => ({ id: k, name: v.name || v.email || 'System Owner', ...v }))
                        .filter(u => u.status !== 'Inactive' && u.status !== 'Deleted')
                    );
                }

                // 1. INCIDENTS 
                if (data.incidents) {
                    Object.entries(data.incidents).forEach(([key, inc]) => {
                        const capaList = inc.capa || (inc.investigation && inc.investigation.capa);
                        if (capaList) {
                            Object.entries(capaList).forEach(([idx, act]) => {
                                if (!act) return;
                                allActions.push({
                                    uid: `INC-${key}-${idx}`,
                                    source: 'Incident',
                                    sourceId: inc.id || inc.docId || 'INC',
                                    desc: act.act || act.action || act.desc || 'No Description',
                                    owner: act.own || act.owner || act.responsible || 'Unassigned',
                                    due: act.due || act.deadline || act.target || 'N/A',
                                    status: act.status || 'Open',
                                    siteId: inc.siteId || 'Global',
                                    closureComment: act.closureComment || null,
                                    closureEvidence: act.closureEvidence || null,
                                    closedAt: act.closedAt || null,
                                    closedBy: act.closedBy || null,
                                    dbPath: inc.capa ? `organizations/${orgId}/incidents/${key}/capa/${idx}` : `organizations/${orgId}/incidents/${key}/investigation/capa/${idx}`
                                });
                            });
                        }
                    });
                }

                // 2. AUDIT FINDINGS
                if (data.auditFindings) {
                    Object.entries(data.auditFindings).forEach(([key, aud]) => {
                        if (aud.findings) {
                            Object.entries(aud.findings).forEach(([fIdx, find]) => {
                                if (find && find.response && find.response.capa) {
                                    allActions.push({
                                        uid: `AUD-${key}-${fIdx}`,
                                        source: 'Audit',
                                        sourceId: aud.docId || aud.id || 'AUD',
                                        desc: find.response.capa,
                                        owner: find.response.owner || 'Unassigned',
                                        due: find.response.targetDate || 'N/A',
                                        status: find.response.capaStatus || 'Open',
                                        siteId: aud.siteId || aud.taskDetails?.siteId || 'Global',
                                        closureComment: find.response.closureComment || null,
                                        closureEvidence: find.response.closureEvidence || null,
                                        closedAt: find.response.closedAt || null,
                                        closedBy: find.response.closedBy || null,
                                        dbPath: `organizations/${orgId}/auditFindings/${key}/findings/${fIdx}/response`
                                    });
                                }
                            });
                        }
                    });
                }

                // 3. MOCK DRILLS
                if (data.mockDrills) {
                    Object.entries(data.mockDrills).forEach(([key, drill]) => {
                        if (drill.capa) {
                            Object.entries(drill.capa).forEach(([idx, act]) => {
                                if (!act) return;
                                allActions.push({
                                    uid: `MD-${key}-${idx}`,
                                    source: 'Emergency Drill',
                                    sourceId: drill.docId || drill.id || 'DRILL',
                                    desc: act.action || act.act || 'No Description',
                                    owner: act.owner || act.own || 'Unassigned',
                                    due: act.due || act.target || 'N/A',
                                    status: act.status || 'Open',
                                    siteId: drill.siteId || 'Global',
                                    closureComment: act.closureComment || null,
                                    closureEvidence: act.closureEvidence || null,
                                    closedAt: act.closedAt || null,
                                    closedBy: act.closedBy || null,
                                    dbPath: `organizations/${orgId}/mockDrills/${key}/capa/${idx}`
                                });
                            });
                        }
                    });
                }

                // 4. CONSULTATION / MEETINGS
                if (data.consultations) {
                    Object.entries(data.consultations).forEach(([key, meet]) => {
                        if (meet.actions) {
                            Object.entries(meet.actions).forEach(([idx, act]) => {
                                if (!act) return;
                                allActions.push({
                                    uid: `MEET-${key}-${idx}`,
                                    source: 'Consultation',
                                    sourceId: meet.id || meet.docId || 'MEET',
                                    desc: act.item || act.action || 'No Description',
                                    owner: act.owner || act.own || 'Unassigned',
                                    due: act.deadline || act.due || 'N/A',
                                    status: act.status || 'Open',
                                    siteId: meet.siteId || 'Global',
                                    closureComment: act.closureComment || null,
                                    closureEvidence: act.closureEvidence || null,
                                    closedAt: act.closedAt || null,
                                    closedBy: act.closedBy || null,
                                    dbPath: `organizations/${orgId}/consultations/${key}/actions/${idx}`
                                });
                            });
                        }
                    });
                }

                // 5. IMPROVEMENTS
                if (data.improvements) {
                    Object.entries(data.improvements).forEach(([key, imp]) => {
                        if (!['Approved', 'In Progress', 'Completed'].includes(imp.status)) return;

                        if (imp.actions && imp.actions.length > 0) {
                            Object.entries(imp.actions).forEach(([idx, act]) => {
                                if (!act) return;
                                allActions.push({
                                    uid: `IMP-${key}-${idx}`,
                                    source: 'Improvement',
                                    sourceId: imp.id,
                                    desc: act.action || act.act,
                                    owner: act.owner || act.own,
                                    due: act.due || act.deadline,
                                    status: act.status,
                                    siteId: act.siteId || imp.siteId || 'Global',
                                    closureComment: act.closureComment || null,
                                    closureEvidence: act.closureEvidence || null,
                                    closedAt: act.closedAt || null,
                                    closedBy: act.closedBy || null,
                                    dbPath: `organizations/${orgId}/improvements/${key}/actions/${idx}`
                                });
                            });
                        } else if (imp.title) {
                            allActions.push({
                                uid: `IMP-${key}`,
                                source: 'Improvement',
                                sourceId: imp.id,
                                desc: `Execute: ${imp.title}`,
                                owner: imp.createdBy,
                                due: imp.date,
                                status: imp.status,
                                siteId: imp.siteId || 'Global',
                                closureComment: imp.closureComment || null,
                                closureEvidence: imp.closureEvidence || null,
                                closedAt: imp.closedAt || null,
                                closedBy: imp.closedBy || null,
                                dbPath: `organizations/${orgId}/improvements/${key}`
                            });
                        }
                    });
                }

                // 6. ROUTINE INSPECTIONS (NEW INTEGRATION)
                if (data.inspectionRecords) {
                    Object.entries(data.inspectionRecords).forEach(([key, record]) => {
                        if (record.capa && Array.isArray(record.capa)) {
                            record.capa.forEach((act, idx) => {
                                if (!act) return;
                                allActions.push({
                                    uid: `INSP-${key}-${idx}`,
                                    source: 'Inspection',
                                    sourceId: record.templateTitle || 'Inspection',
                                    desc: act.desc || act.act || act.action || 'No Description',
                                    owner: act.owner || act.own || 'Unassigned',
                                    due: act.dueDate || act.due || 'N/A',
                                    status: act.status || 'Open',
                                    siteId: act.siteId || record.siteId || 'Global',
                                    closureComment: act.closureComment || null,
                                    closureEvidence: act.closureEvidence || null,
                                    closedAt: act.closedAt || null,
                                    closedBy: act.closedBy || null,
                                    dbPath: `organizations/${orgId}/inspectionRecords/${key}/capa/${idx}`
                                });
                            });
                        }
                    });
                }

                setActions(allActions.sort((a, b) => new Date(a.due) - new Date(b.due)));
            }
        } catch (error) {
            console.error("Error fetching CAPA data:", error);
        } finally {
            setLoading(false);
        }
    };

    // ==========================================
    // 4. ROW LEVEL SECURITY (RLS)
    // ==========================================
    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);

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
        setFilterSite(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite === 'All' ? 'GLOBAL' : newSite);
    };

    // ==========================================
    // STATUS & EVIDENCE UPLOAD UPDATES
    // ==========================================
    const handleStatusChange = (action, newStatus) => {
        if (!permissions.canEditCreate && action.owner !== (session?.name || session?.email)) {
            return alert("Security Error: You can only update the status of actions assigned directly to you.");
        }

        if (newStatus === 'Closed') {
            setClosureModal({ isOpen: true, action, comment: '', evidence: null });
        } else {
            executeStatusUpdate(action, newStatus);
        }
    };

    const handleEvidenceUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2097152) { // 2MB restriction for RTDB limits
                return alert("File is too large. Please upload an image or document smaller than 2MB.");
            }
            try {
                const base64 = await fileToBase64(file);
                setClosureModal(prev => ({ ...prev, evidence: base64 }));
            } catch (error) {
                alert("Failed to process file.");
            }
        }
    };

    const confirmClosure = async () => {
        if (!closureModal.comment.trim()) {
            return alert("Closure Comments/Description are mandatory to close a CAPA action.");
        }
        setUpdating(true);
        await executeStatusUpdate(closureModal.action, 'Closed', closureModal.comment, closureModal.evidence);
        setUpdating(false);
        setClosureModal({ isOpen: false, action: null, comment: '', evidence: null });
    };

    const executeStatusUpdate = async (action, newStatus, comment = null, evidence = null) => {
        const field = action.source === 'Audit' ? 'capaStatus' : 'status';
        const payload = { [field]: newStatus };

        if (newStatus === 'Closed') {
            payload.closureComment = comment;
            payload.closureEvidence = evidence; // Save evidence to DB
            payload.closedAt = new Date().toISOString();
            payload.closedBy = session.name || session.email;
        }

        try {
            await update(ref(rtdb, action.dbPath), payload);
            fetchActions(session.orgId); // Re-fetch to guarantee sync
        } catch (e) {
            alert("Failed to update database.");
        }
    };

    const updateOwner = async (action, newOwner) => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to reassign actions.");
        setActions(prev => prev.map(a => a.uid === action.uid ? { ...a, owner: newOwner } : a));
        try {
            await update(ref(rtdb, action.dbPath), { owner: newOwner, own: newOwner });
        } catch (e) {
            alert("Failed to update owner.");
            fetchActions(session.orgId);
        }
    };

    const filteredActions = useMemo(() => {
        return actions.filter(a => {
            const hasSiteAccess = isGlobalUser || allowedSiteCodes.has(a.siteId) || a.siteId === 'Global' || a.siteId === 'GLOBAL';
            if (!hasSiteAccess) return false;

            const matchSite = filterSite === 'All' || a.siteId === filterSite;
            const matchStatus = filterStatus === 'All' || a.status === filterStatus;
            const matchSource = filterSource === 'All' || a.source === filterSource;
            return matchSite && matchStatus && matchSource;
        });
    }, [actions, filterSite, filterStatus, filterSource, isGlobalUser, allowedSiteCodes]);

    const stats = useMemo(() => {
        const total = filteredActions.length;
        const closed = filteredActions.filter(a => a.status === 'Closed').length;
        const open = total - closed;
        const today = new Date().toISOString().split('T')[0];
        const overdue = filteredActions.filter(a => a.status !== 'Closed' && a.due !== 'N/A' && a.due < today).length;
        return { total, closed, open, overdue };
    }, [filteredActions]);

    const exportExcel = () => {
        const exportData = filteredActions.map(({ source, sourceId, desc, owner, due, status, siteId, closureComment, closedBy, closedAt, closureEvidence }) => ({
            "Source Module": source,
            "Reference ID": sourceId,
            "Site": siteId,
            "Action Description": desc,
            "Owner": owner,
            "Due Date": due,
            "Current Status": status,
            "Closure Comments": closureComment || 'N/A',
            "Evidence Attached": closureEvidence ? 'Yes' : 'No',
            "Closed By": closedBy || 'N/A',
            "Date Closed": closedAt ? new Date(closedAt).toLocaleDateString() : 'N/A'
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "CAPA_Register");
        XLSX.writeFile(wb, `CAPA_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const myName = session?.name || session?.email || session?.user || 'Me';

    if (loading) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col gap-4 font-['Space_Grotesk']">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin mb-2"></div>
            <h2 className="text-sm font-bold tracking-widest uppercase text-slate-400">Loading Action Registry...</h2>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

            {/* --- CLOSURE MODAL WITH EVIDENCE UPLOAD --- */}
            {closureModal.isOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in zoom-in-95">
                    <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-lg w-full relative">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-t-3xl"></div>
                        <h3 className="text-2xl font-bold text-white mb-2"><i className="fas fa-check-circle text-emerald-400 mr-2"></i> Close Corrective Action</h3>
                        <p className="text-slate-400 text-sm mb-6">ISO 45001 requires verifiable evidence when closing corrective actions. Once closed, this action is locked and cannot be reopened.</p>

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6 shadow-inner">
                            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest mb-1 block">Ref: {closureModal.action.sourceId}</span>
                            <div className="text-sm font-medium text-slate-300">{closureModal.action.desc}</div>
                        </div>

                        <div className="space-y-5 mb-8">
                            <div>
                                <label className="text-xs uppercase font-bold text-emerald-400 block mb-2">Closure Comments <span className="text-red-500">*</span></label>
                                <textarea
                                    rows="3"
                                    placeholder="State exactly what was done to fix this..."
                                    value={closureModal.comment}
                                    onChange={e => setClosureModal({ ...closureModal, comment: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 text-white p-3 text-sm rounded-xl outline-none focus:border-emerald-500 resize-none shadow-inner"
                                ></textarea>
                            </div>

                            <div>
                                <label className="text-xs uppercase font-bold text-emerald-400 block mb-2 flex items-center gap-2"><i className="fas fa-paperclip"></i> Upload Evidence (Optional)</label>
                                <div className="bg-slate-950 border border-slate-700 p-3 rounded-xl shadow-inner">
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={handleEvidenceUpload}
                                        className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-900/30 file:text-emerald-400 hover:file:bg-emerald-900/50 cursor-pointer w-full transition-colors"
                                    />
                                </div>
                                {closureModal.evidence && (
                                    <div className="mt-3 text-[10px] bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 px-3 py-2 rounded-lg flex items-center gap-2 animate-in fade-in">
                                        <i className="fas fa-check"></i> Evidence file attached successfully and ready to save.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                            <button onClick={() => setClosureModal({ isOpen: false, action: null, comment: '', evidence: null })} className="px-6 py-2.5 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition">Cancel</button>
                            <button onClick={confirmClosure} disabled={updating || !closureModal.comment.trim()} className="px-8 py-2.5 rounded-xl font-bold bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 transition disabled:opacity-50 flex items-center gap-2">
                                {updating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-lock"></i>} Confirm & Lock
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-900/50">
                        <i className="fas fa-list-check"></i>
                    </div>
                    <h1 className="text-base font-bold text-white tracking-wide hidden md:block uppercase">Global CAPA Manager</h1>

                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded border border-cyan-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-600/20 uppercase tracking-widest">
                        <i className="fas fa-file-excel"></i> Export CSV
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto w-full relative z-10 custom-scroll">
                <main className="p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-blue-500 shadow-xl flex justify-between items-center group hover:border-blue-400 transition-colors relative overflow-hidden">
                            <div className="card-glow bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1),transparent_70%)]"></div>
                            <div className="relative z-10">
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Total Actions</p>
                                <h3 className="text-4xl font-black text-white">{stats.total}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-blue-900/20 flex items-center justify-center text-blue-500/50 group-hover:text-blue-400 transition-colors relative z-10"><i className="fas fa-list-check text-2xl"></i></div>
                        </div>
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-emerald-500 shadow-xl flex justify-between items-center group hover:border-emerald-400 transition-colors relative overflow-hidden">
                            <div className="card-glow bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_70%)]"></div>
                            <div className="relative z-10">
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Closed</p>
                                <h3 className="text-4xl font-black text-emerald-400">{stats.closed}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-emerald-900/20 flex items-center justify-center text-emerald-500/50 group-hover:text-emerald-400 transition-colors relative z-10"><i className="fas fa-check-circle text-2xl"></i></div>
                        </div>
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl flex justify-between items-center group hover:border-yellow-400 transition-colors relative overflow-hidden">
                            <div className="card-glow bg-[radial-gradient(circle_at_50%_0%,rgba(234,179,8,0.1),transparent_70%)]"></div>
                            <div className="relative z-10">
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Open</p>
                                <h3 className="text-4xl font-black text-yellow-400">{stats.open}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-yellow-900/20 flex items-center justify-center text-yellow-500/50 group-hover:text-yellow-400 transition-colors relative z-10"><i className="fas fa-clock text-2xl"></i></div>
                        </div>
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-500 shadow-xl flex justify-between items-center group hover:border-red-400 transition-colors relative overflow-hidden">
                            <div className="card-glow bg-[radial-gradient(circle_at_50%_0%,rgba(239,68,68,0.1),transparent_70%)]"></div>
                            <div className="relative z-10">
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Overdue</p>
                                <h3 className="text-4xl font-black text-red-400">{stats.overdue}</h3>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-red-900/20 flex items-center justify-center text-red-500/50 group-hover:text-red-400 transition-colors relative z-10"><i className="fas fa-exclamation-triangle text-2xl animate-pulse"></i></div>
                        </div>
                    </div>

                    <div className="glass-panel rounded-3xl border border-slate-700 overflow-hidden flex flex-col shadow-2xl relative">

                        <div className="p-6 border-b border-slate-700 bg-slate-900/80 flex flex-wrap gap-4 items-center relative z-10">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-2"><i className="fas fa-filter mr-1"></i> Filter By:</span>
                            <select value={filterSite} onChange={handleSiteFilterChange} className="w-48 bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-cyan-500 shadow-inner">
                                {(isGlobalUser || visibleSites.length > 1) && <option value="All" className="bg-slate-900 text-white">All Authorized Sites</option>}
                                {visibleSites.map(s => <option key={s.code} value={s.code} className="bg-slate-900 text-white">{s.name}</option>)}
                            </select>
                            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="w-48 bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-cyan-500 shadow-inner">
                                <option value="All" className="bg-slate-900 text-white">All Sources</option>
                                <option value="Incident" className="bg-slate-900 text-white">Incidents</option>
                                <option value="Audit" className="bg-slate-900 text-white">Audits</option>
                                <option value="Inspection" className="bg-slate-900 text-white">Inspections</option>
                                <option value="Emergency Drill" className="bg-slate-900 text-white">Drills</option>
                                <option value="Consultation" className="bg-slate-900 text-white">Meetings</option>
                                <option value="Improvement" className="bg-slate-900 text-white">Improvements</option>
                            </select>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-48 bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-cyan-500 shadow-inner">
                                <option value="All" className="bg-slate-900 text-white">All Statuses</option>
                                <option value="Open" className="bg-slate-900 text-white">Open</option>
                                <option value="In Progress" className="bg-slate-900 text-white">In Progress</option>
                                <option value="Closed" className="bg-slate-900 text-white">Closed</option>
                            </select>
                        </div>

                        <div className="flex-1 overflow-x-auto w-full custom-scroll relative z-10">
                            <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap min-w-[1000px]">
                                <thead className="bg-slate-950/80 backdrop-blur-md text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                                    <tr>
                                        <th className="p-5 pl-6">Source</th>
                                        <th className="p-5">Ref ID & Site</th>
                                        <th className="p-5 w-1/3 whitespace-normal">Action Description</th>
                                        <th className="p-5">Owner</th>
                                        <th className="p-5">Due Date</th>
                                        <th className="p-5 pr-6">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                                    {filteredActions.map((act) => {
                                        const isOverdue = act.status !== 'Closed' && act.due !== 'N/A' && new Date(act.due) < new Date();

                                        // RBAC UI Locks
                                        const canEditThisRow = permissions.canEditCreate || act.owner === myName;
                                        const canChangeOwner = permissions.canEditCreate && act.status !== 'Closed';
                                        const isStatusLocked = !canEditThisRow || act.status === 'Closed';

                                        return (
                                            <tr key={act.uid} className="hover:bg-slate-800/60 transition-colors">
                                                <td className="p-5 pl-6 align-top">
                                                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${act.source === 'Incident' ? 'text-orange-400 bg-orange-900/20 border-orange-500/30' :
                                                            act.source === 'Audit' ? 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30' :
                                                                act.source === 'Inspection' ? 'text-lime-400 bg-lime-900/20 border-lime-500/30' :
                                                                    'text-blue-400 bg-blue-900/20 border-blue-500/30'
                                                        }`}>
                                                        {act.source}
                                                    </span>
                                                </td>
                                                <td className="p-5 align-top">
                                                    <div className="font-mono text-xs font-bold text-cyan-400 mb-1">{act.sourceId}</div>
                                                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{act.siteId}</div>
                                                </td>
                                                <td className="p-5 font-medium text-white leading-relaxed whitespace-normal min-w-[300px] align-top">
                                                    {act.desc}
                                                    {/* CLOSURE AUDIT TRAIL DISPLAY */}
                                                    {act.status === 'Closed' && act.closureComment && (
                                                        <div className="mt-3 bg-emerald-950/40 border border-emerald-500/20 p-3 rounded-xl shadow-inner">
                                                            <div className="text-[10px] uppercase font-bold text-emerald-500 tracking-widest mb-1 flex items-center gap-1"><i className="fas fa-lock"></i> Closure Evidence</div>
                                                            <div className="text-xs text-emerald-100 italic mb-2 leading-snug">"{act.closureComment}"</div>

                                                            {act.closureEvidence && (
                                                                <div className="mb-3 mt-2">
                                                                    <a href={act.closureEvidence} target="_blank" rel="noreferrer" className="text-[10px] bg-emerald-900/30 text-emerald-400 px-3 py-1.5 rounded border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-colors inline-flex items-center gap-2 shadow-sm font-bold tracking-widest uppercase">
                                                                        <i className="fas fa-file-invoice"></i> View Attachment
                                                                    </a>
                                                                </div>
                                                            )}

                                                            <div className="text-[9px] text-emerald-500/60 font-mono">Verified by: {act.closedBy} | {act.closedAt ? new Date(act.closedAt).toLocaleDateString() : ''}</div>
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-5 align-top">
                                                    <select
                                                        value={act.owner && act.owner !== 'Unassigned' ? act.owner : ''}
                                                        onChange={(e) => updateOwner(act, e.target.value)}
                                                        disabled={!canChangeOwner}
                                                        className={`bg-transparent border-b hover:border-slate-600 focus:border-cyan-500 text-xs font-bold outline-none w-full py-1 transition-colors ${canChangeOwner ? 'cursor-pointer text-cyan-400 border-transparent' : 'cursor-not-allowed text-slate-400 border-transparent opacity-70'}`}
                                                    >
                                                        <option value="" className="bg-slate-900 text-slate-500">Unassigned</option>
                                                        {users.filter(u => {
                                                            const isGlobal = u.role === 'Owner' || u.role === 'Lead Auditor' || u.assignedSite === 'GLOBAL' || (u.accessibleSites || []).includes('GLOBAL');
                                                            if (isGlobal) return true;
                                                            if (!act.siteId || act.siteId === 'Global' || act.siteId === 'GLOBAL') return true;
                                                            return u.assignedSite === act.siteId || (u.accessibleSites || []).includes(act.siteId);
                                                        }).map(u => (
                                                            <option key={u.id} value={u.name || u.email} className="bg-slate-900 text-white">
                                                                {u.name || u.email}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>

                                                <td className="p-5 text-xs font-mono text-slate-300 align-top">
                                                    {act.due}
                                                    {isOverdue && <span className="block mt-2 w-max px-2 py-1 bg-red-900/40 text-red-400 border border-red-500/30 rounded-lg font-bold uppercase text-[9px] animate-pulse">Overdue</span>}
                                                </td>
                                                <td className="p-5 pr-6 align-top">
                                                    <select
                                                        value={act.status}
                                                        onChange={(e) => handleStatusChange(act, e.target.value)}
                                                        disabled={isStatusLocked}
                                                        className={`text-xs px-3 py-2 rounded-xl font-bold transition-colors outline-none border shadow-inner ${isStatusLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${act.status === 'Closed' ? 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30 focus:border-emerald-500' : act.status === 'In Progress' ? 'text-blue-400 bg-blue-950/50 border-blue-500/30 focus:border-blue-500' : 'text-orange-400 bg-orange-950/50 border-orange-500/30 focus:border-orange-500'}`}
                                                    >
                                                        <option value="Open" className="bg-slate-900 text-white">Open</option>
                                                        <option value="In Progress" className="bg-slate-900 text-white">In Progress</option>
                                                        <option value="Closed" className="bg-slate-900 text-white">Closed</option>
                                                    </select>
                                                    {act.status === 'Closed' && <div className="text-[8px] text-slate-500 uppercase tracking-widest mt-2 font-bold text-center"><i className="fas fa-lock mr-1"></i> Locked</div>}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {filteredActions.length === 0 && (
                                        <tr><td colSpan="6" className="p-16 text-center text-slate-500 italic text-sm">No CAPA records found matching the current filters.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}