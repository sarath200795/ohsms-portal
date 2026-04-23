import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { hasAccessibleModule } from '../utils/permissions';
import { canAuthenticateStatus, readStoredSession } from '../utils/session';

// --- COMPONENTS ---
const DynamicList = ({ label, items, onChange, placeholder, color = "text-slate-500", disabled }) => {
    const safeItems = Array.isArray(items) ? items : [];
    return (
        <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
                <label className={`text-[10px] uppercase font-bold ${color}`}>{label}</label>
                {!disabled && <button type="button" onClick={() => onChange([...safeItems, ''])} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded transition">+ Add Line</button>}
            </div>
            <div className="space-y-2">
                {safeItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                        <input value={item} onChange={e => { const newItems = [...safeItems]; newItems[i] = e.target.value; onChange(newItems); }} disabled={disabled} placeholder={placeholder} className="text-sm bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-purple-500 w-full" />
                        {!disabled && <button type="button" onClick={() => onChange(safeItems.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 px-3 rounded bg-red-900/10 border border-red-900/30 transition flex items-center justify-center"><i className="fas fa-times"></i></button>}
                    </div>
                ))}
                {safeItems.length === 0 && disabled && <div className="text-xs text-slate-500 italic">None specified.</div>}
            </div>
        </div>
    );
};

const MetricBuilder = ({ metrics, onChange, disabled }) => {
    const safeMetrics = Array.isArray(metrics) ? metrics : [];
    return (
        <div className="mb-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] uppercase font-bold text-emerald-400"><i className="fas fa-chart-line mr-1"></i> Impact Metrics</label>
                {!disabled && <button type="button" onClick={() => onChange([...safeMetrics, { name: '', value: '' }])} className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-900/50 transition">+ Add Metric</button>}
            </div>
            <div className="space-y-2">
                {safeMetrics.map((m, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2">
                        <div className="col-span-3"><input value={m.name} onChange={e => { const nm = [...safeMetrics]; nm[i].name = e.target.value; onChange(nm); }} disabled={disabled} placeholder="Metric Name" className="text-xs bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-emerald-500 w-full" /></div>
                        <div className="col-span-2 flex gap-2">
                            <input value={m.value} onChange={e => { const nm = [...safeMetrics]; nm[i].value = e.target.value; onChange(nm); }} disabled={disabled} placeholder="Impact" className="text-xs bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-emerald-500 w-full" />
                            {!disabled && <button type="button" onClick={() => onChange(safeMetrics.filter((_, idx) => idx !== i))} className="text-red-400 hover:bg-red-900/20 px-3 rounded transition flex items-center justify-center"><i className="fas fa-times"></i></button>}
                        </div>
                    </div>
                ))}
                {safeMetrics.length === 0 && disabled && <div className="text-xs text-slate-500 italic">No metrics defined.</div>}
            </div>
        </div>
    );
};

const ActionPlanBuilder = ({ actions, users, sites, defaultSiteId, onChange, disabled }) => {
    const safeActions = Array.isArray(actions) ? actions : [];

    return (
        <div className="mb-6 bg-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-inner">
            <div className="flex justify-between items-center mb-3">
                <div>
                    <label className="text-xs uppercase font-bold text-cyan-400"><i className="fas fa-list-check mr-2"></i> Implementation Action Plan (CAPA)</label>
                    <p className="text-[9px] text-slate-400 mt-1">Actions are drafted here and will automatically dispatch to the CAPA Manager once this proposal is <strong>Approved</strong>.</p>
                </div>
                {!disabled && <button type="button" onClick={() => onChange([...safeActions, { action: '', siteId: defaultSiteId, owner: '', due: '', status: 'Open' }])} className="bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] px-3 py-1.5 rounded font-bold transition shadow">+ Add Action</button>}
            </div>
            <div className="space-y-2">
                {safeActions.map((act, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-900 p-2 rounded border border-slate-700">
                        <div className="col-span-3">
                            <input value={act.action} onChange={e => { const na = [...safeActions]; na[i].action = e.target.value; onChange(na); }} disabled={disabled} placeholder="Action Description..." className="text-xs bg-transparent border-none p-1 text-white outline-none focus:border-b focus:border-cyan-500 w-full transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <select value={act.siteId || defaultSiteId} onChange={e => { const na = [...safeActions]; na[i].siteId = e.target.value; onChange(na); }} disabled={disabled} className="text-[10px] uppercase font-bold bg-slate-950 border border-slate-700 rounded p-1.5 text-white outline-none focus:border-cyan-500 w-full">
                                {sites.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <select value={act.owner} onChange={e => { const na = [...safeActions]; na[i].owner = e.target.value; onChange(na); }} disabled={disabled} className="text-xs bg-slate-950 border border-slate-700 rounded p-1.5 text-white outline-none focus:border-cyan-500 w-full">
                                <option value="">Owner...</option>
                                {users.map((u, idx) => <option key={u.id || idx} value={u.name || u.email}>{u.name || u.email}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <input type="date" value={act.due} onChange={e => { const na = [...safeActions]; na[i].due = e.target.value; onChange(na); }} disabled={disabled} className="text-xs bg-slate-950 border border-slate-700 rounded p-1.5 text-white outline-none focus:border-cyan-500 w-full" />
                        </div>
                        <div className="col-span-2">
                            <select value={act.status || 'Open'} onChange={e => { const na = [...safeActions]; na[i].status = e.target.value; onChange(na); }} disabled={disabled} className={`text-xs w-full p-1.5 outline-none rounded border border-slate-700 transition-colors ${!disabled && 'cursor-pointer'} ${act.status === 'Closed' ? 'bg-emerald-900/50 text-emerald-400' : act.status === 'In Progress' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-950 text-slate-300'}`}>
                                <option value="Open">Open</option><option value="In Progress">In Progress</option><option value="Closed">Closed</option>
                            </select>
                        </div>
                        {!disabled && <div className="col-span-1 flex justify-center"><button type="button" onClick={() => onChange(safeActions.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 transition w-8 h-8 flex items-center justify-center rounded hover:bg-slate-800"><i className="fas fa-times"></i></button></div>}
                    </div>
                ))}
                {safeActions.length === 0 && <div className="text-center text-xs text-slate-500 italic py-2">No actions defined.</div>}
            </div>
        </div>
    );
};

// --- STRICT ROLE-BASED APPROVAL BLOCK ---
const ApprovalBlock = ({ roleName, icon, color, data: _data, form, setForm, session, disabled, users }) => {
    const appData = form.approvals?.[roleName] || { status: 'Pending', comment: '', by: '', date: '', assignedTo: '' };

    const currentUser = session?.name || session?.email;
    const isAssignedToMe = appData.assignedTo === currentUser;

    const canAssign = !disabled && appData.status === 'Pending';
    const canDecide = !disabled && isAssignedToMe && appData.status === 'Pending';

    const assignUser = (val) => {
        const newApprovals = { ...form.approvals };
        newApprovals[roleName] = { ...appData, assignedTo: val };
        setForm({ ...form, approvals: newApprovals });
    };

    const handleDecision = (decision) => {
        if (!isAssignedToMe) return alert("Security Error: Only the assigned reviewer can make this decision.");
        const newApprovals = { ...form.approvals };
        newApprovals[roleName] = {
            ...appData,
            status: decision,
            by: currentUser,
            date: new Date().toISOString().split('T')[0]
        };
        setForm({ ...form, approvals: newApprovals });
    };

    const updateComment = (val) => {
        const newApprovals = { ...form.approvals };
        newApprovals[roleName] = { ...appData, comment: val };
        setForm({ ...form, approvals: newApprovals });
    };

    return (
        <div className={`p-4 rounded-2xl border ${appData.status === 'Approved' ? 'bg-emerald-900/10 border-emerald-500/30' : appData.status === 'Rejected' ? 'bg-red-900/10 border-red-500/30' : 'bg-slate-900/50 border-slate-700'} shadow-inner flex flex-col`}>
            <div className="flex justify-between items-center mb-3">
                <label className={`text-xs uppercase font-bold tracking-widest flex items-center gap-2 ${color}`}><i className={`fas ${icon}`}></i> {roleName}</label>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${appData.status === 'Approved' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50' : appData.status === 'Rejected' ? 'bg-red-900/30 text-red-400 border-red-500/50' : 'bg-slate-800 text-slate-400 border-slate-600'}`}>{appData.status}</span>
            </div>

            <div className="mb-3">
                <select
                    value={appData.assignedTo || ''}
                    onChange={(e) => assignUser(e.target.value)}
                    disabled={!canAssign}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs outline-none transition-colors ${canAssign ? 'text-white focus:border-blue-500 cursor-pointer' : 'text-slate-500 cursor-not-allowed'}`}
                >
                    <option value="">-- Assign Reviewer --</option>
                    {users.map(u => <option key={u.id} value={u.name || u.email}>{u.name || u.email} ({u.role})</option>)}
                </select>
            </div>

            <textarea
                value={appData.comment}
                onChange={(e) => updateComment(e.target.value)}
                disabled={!canDecide}
                placeholder={appData.assignedTo ? (isAssignedToMe ? "Enter your review comments here..." : `Waiting on ${appData.assignedTo}...`) : "Assign a reviewer first..."}
                className={`w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 outline-none resize-none mb-3 transition-colors ${canDecide ? 'focus:border-blue-500' : 'opacity-60 cursor-not-allowed'}`}
                rows="2"
            ></textarea>

            {appData.status === 'Pending' ? (
                <div className="flex gap-2 mt-auto">
                    <button type="button" onClick={() => handleDecision('Approved')} disabled={!canDecide} className={`flex-1 border py-2 rounded-lg text-xs font-bold transition-colors ${canDecide ? 'bg-emerald-900/30 hover:bg-emerald-600 text-emerald-400 hover:text-white border-emerald-500/30' : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'}`}>Approve</button>
                    <button type="button" onClick={() => handleDecision('Rejected')} disabled={!canDecide} className={`flex-1 border py-2 rounded-lg text-xs font-bold transition-colors ${canDecide ? 'bg-red-900/30 hover:bg-red-600 text-red-400 hover:text-white border-red-500/30' : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'}`}>Reject</button>
                </div>
            ) : (
                <div className="text-[10px] text-slate-500 font-mono mt-auto flex flex-col">
                    <span className="text-slate-400">Signed: <strong>{appData.by}</strong></span>
                    <span>Date: {appData.date}</span>
                </div>
            )}
        </div>
    );
};

// --- MAIN APP ---
export default function Improvement() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [view, setView] = useState('list');
    const [improvements, setImprovements] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [printData, setPrintData] = useState(null);

    // RBAC & Filter
    const [permissions, setPermissions] = useState({ viewOnly: false, canDelete: false, canEditCreate: false });
    const [filterSite, setFilterSite] = useState('All');

    const [form, setForm] = useState({
        firebaseKey: null, type: 'JDI', title: '', siteId: '', date: new Date().toISOString().split('T')[0], description: '', cost: '',
        metrics: [], documentation: [], training: [], infrastructure: [], notifications: [],
        actions: [], status: 'Proposed', horizontalDeployment: false,
        approvals: { safety: { status: 'Pending', assignedTo: '' }, operations: { status: 'Pending', assignedTo: '' }, engineering: { status: 'Pending', assignedTo: '' } }
    });

    useEffect(() => {
        const sess = readStoredSession();
        if (!sess || !canAuthenticateStatus(sess.status)) { navigate('/'); return; }

        // 1. STRICT MODULE GUARD
        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || hasAccessibleModule(sess.accessibleModules, 'Improvement');

        if (!hasModuleAccess) {
            alert("Security Alert: You do not have permission to access the Improvement module.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        // 2. STRICT RBAC MATRIX
        const canDel = ['Global Owner', 'Owner', 'Admin', 'Site Owner'].includes(sess.role);
        const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(sess.role);

        setPermissions({
            viewOnly: !canEditCr,
            canDelete: canDel,
            canEditCreate: canEditCr
        });

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


        const loadDatabases = async () => {
            setLoading(true);
            try {
                const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                const snap = await get(dbRef);

                if (snap.exists()) {
                    const val = snap.val();

                    if (val.sites) {
                        const parsedSites = Object.keys(val.sites).map(key => {
                            const sVal = val.sites[key];
                            return typeof sVal === 'object' ? { code: sVal.code || key, name: sVal.name || sVal.code || key } : { code: sVal, name: sVal };
                        });
                        setSites(parsedSites);
                    }

                    if (val.users) {
                        const allUsers = Object.keys(val.users).map(key => {
                            const uVal = val.users[key];
                            return typeof uVal === 'object' ? { id: key, name: uVal.name || uVal.email || "System Owner", role: uVal.role || "User", ...uVal } : { id: key, name: uVal || "System Owner", role: "User" };
                        }).filter(u => canAuthenticateStatus(u.status));
                        setUsers(allUsers);
                    }

                    if (val.improvements) {
                        setImprovements(Object.entries(val.improvements).map(([k, v]) => ({
                            firebaseKey: k,
                            ...v
                        })).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)));
                    }
                }
            } catch (err) { console.error("Database Load Error:", err); }
            finally { setLoading(false); }
        };

        loadDatabases();
    }, [navigate, location]);

    // ==========================================
    // 4. STRICT ROW-LEVEL SECURITY (RLS)
    // ==========================================
    const role = session?.role || 'User';
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
        setFilterSite(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite === 'All' ? 'GLOBAL' : newSite);
    };

    const canViewRecord = useCallback((siteId) => (
        isGlobalUser || allowedSiteCodes.has(siteId)
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
        if (!form.siteId) return true;
        return allowedSiteCodes.has(form.siteId);
    }, [permissions.canEditCreate, isGlobalUser, allowedSiteCodes, form.siteId]);

    // --- FILTERS & USERS ---
    const siteUsers = useMemo(() => {
        return users.filter(u => {
            const isGlobal = u.role === 'Owner' || u.role === 'Lead Auditor' || u.assignedSite === 'GLOBAL' || (u.accessibleSites && u.accessibleSites.includes('GLOBAL'));
            if (form.horizontalDeployment) return true;
            const siteMatch = isGlobal || !form.siteId || u.assignedSite === form.siteId || (u.accessibleSites && u.accessibleSites.includes(form.siteId));
            return siteMatch;
        });
    }, [users, form.siteId, form.horizontalDeployment]);

    const filteredImprovements = useMemo(() => {
        return improvements.filter(imp => {
            if (!canViewRecord(imp.siteId)) return false;
            if (filterSite === 'All') return true;
            return imp.siteId === filterSite;
        });
    }, [improvements, filterSite, canViewRecord]);

    const stats = useMemo(() => {
        let totalActions = 0;
        let closedActions = 0;
        let openActions = 0;

        filteredImprovements.forEach(imp => {
            const safeActions = Array.isArray(imp.actions) ? imp.actions : (imp.actions ? Object.values(imp.actions) : []);
            safeActions.forEach(act => {
                totalActions++;
                if (act.status === 'Closed') closedActions++;
                else openActions++;
            });
        });
        return { totalActions, closedActions, openActions };
    }, [filteredImprovements]);

    // --- WORKFLOW & SAVING LOGIC ---
    const handleSubmit = async () => {
        if (!canEditForm) return alert("Security Error: You do not have permission to edit records for this site.");
        if (!form.title || !form.description) return alert("Title and Description are required.");
        if (!form.siteId) return alert("Site is required.");

        setSaving(true);

        const cleanActions = (form.actions || []).filter(a => a.action && a.action.trim() !== '');
        let explodedActions = [];

        // EXPLODE ACTIONS FOR HORIZONTAL DEPLOYMENT
        if (form.horizontalDeployment) {
            const uniqueActionDesc = [...new Set(cleanActions.map(a => a.action))];
            uniqueActionDesc.forEach(desc => {
                const template = cleanActions.find(a => a.action === desc);
                sites.forEach(site => {
                    const existing = cleanActions.find(a => a.action === desc && (a.siteId === site.code || (!a.siteId && form.siteId === site.code)));
                    if (existing) {
                        explodedActions.push({ ...existing, siteId: site.code });
                    } else {
                        explodedActions.push({ action: desc, siteId: site.code, owner: 'Unassigned', due: template.due, status: 'Open' });
                    }
                });
            });
        } else {
            explodedActions = cleanActions.map(a => ({ ...a, siteId: a.siteId || form.siteId }));
        }

        // AUTO-STATUS ROUTING ENGINE
        let finalStatus = form.status;
        const apps = form.approvals || {};

        if (finalStatus === 'Proposed' || finalStatus === 'Rejected' || finalStatus === 'Approved') {
            if (apps.safety?.status === 'Rejected' || apps.operations?.status === 'Rejected' || apps.engineering?.status === 'Rejected') {
                finalStatus = 'Rejected';
            } else if (apps.safety?.status === 'Approved' && apps.operations?.status === 'Approved' && apps.engineering?.status === 'Approved') {
                finalStatus = 'Approved';
            } else {
                finalStatus = 'Proposed'; // Remains proposed if approvals are missing
            }
        }

        // CAPA Auto-Completion Check
        if ((finalStatus === 'Approved' || finalStatus === 'In Progress') && explodedActions.length > 0) {
            const allClosed = explodedActions.every(a => a.status === 'Closed');
            if (allClosed) {
                finalStatus = 'Completed';
            } else {
                finalStatus = 'In Progress';
            }
        }

        const payload = JSON.parse(JSON.stringify({
            ...form,
            status: finalStatus,
            actions: explodedActions,
            id: form.id || `IMP-${Date.now().toString().slice(-6)}`,
            createdBy: form.createdBy || session.name || session.email,
            timestamp: form.timestamp || new Date().toISOString()
        }));

        try {
            if (form.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/improvements/${form.firebaseKey}`), payload);
                alert(form.horizontalDeployment ? "Horizontal Proposal Updated. CAPAs auto-synced!" : "Proposal Updated Successfully!");
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/improvements`), payload);
                alert(form.horizontalDeployment ? "Horizontal Proposal Created. CAPAs deployed globally!" : "Proposal Saved! Actions pushed to CAPA Manager.");
            }

            const dbRef = ref(rtdb, `organizations/${session.orgId}/improvements`);
            const snap = await get(dbRef);
            if (snap.exists()) {
                setImprovements(Object.entries(snap.val()).map(([k, v]) => ({ firebaseKey: k, ...v })).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)));
            }
            setView('list');
        } catch (e) { alert("Save Failed: " + e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (key) => {
        if (window.confirm("Permanently delete this improvement proposal?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/improvements/${key}`));
            setImprovements(improvements.filter(i => i.firebaseKey !== key));
        }
    };

    const handleNewClick = () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to create proposals.");
        setForm({
            firebaseKey: null, type: 'JDI', title: '', siteId: (!isGlobalUser && visibleSites.length === 1) ? visibleSites[0].code : (filterSite !== 'All' ? filterSite : ''),
            date: new Date().toISOString().split('T')[0], description: '', cost: '',
            metrics: [], documentation: [], training: [], infrastructure: [], notifications: [], actions: [], status: 'Proposed',
            horizontalDeployment: false,
            approvals: { safety: { status: 'Pending', assignedTo: '' }, operations: { status: 'Pending', assignedTo: '' }, engineering: { status: 'Pending', assignedTo: '' } }
        });
        setView('form');
    };

    const triggerPrint = (record) => {
        setPrintData(record);
        setTimeout(() => window.print(), 800);
    };

    if (loading || !session) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 font-['Space_Grotesk'] flex-col gap-4">
            <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500"></i>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Module...</h2>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none z-0 no-print"></div>

            <div className="app-ui h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 shadow-md flex-shrink-0 relative z-20 no-print">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50"><i className="fas fa-lightbulb"></i></div>
                    <h1 className="font-bold text-lg text-blue-400 hidden md:block tracking-wide">Continuous Improvement</h1>

                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
                <div className="app-tabbar gap-1">
                    <button type="button" onClick={() => setView('list')} className={`app-tab ${view === 'list' ? 'app-tab-active' : ''}`}><i className="fas fa-database"></i> Dashboard</button>
                    {permissions.canEditCreate && (
                        <button type="button" onClick={handleNewClick} className={`app-tab app-tab-success ${view === 'form' ? 'app-tab-active' : ''}`}><i className="fas fa-plus"></i> New Proposal</button>
                    )}
                </div>
            </div>

            <div className="app-ui flex-1 overflow-y-auto p-6 md:p-8 custom-scroll relative z-10 no-print">
                <div className="max-w-6xl mx-auto">
                    {view === 'list' && (
                        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
                            {/* DASHBOARD FILTERS */}
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2">Improvement Register</h2>
                                    <p className="text-sm text-slate-400">Track and manage Kaizen events and JDI proposals.</p>
                                </div>
                                <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-700 flex items-center gap-2 shadow-inner">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Filter Site:</span>
                                    <select value={filterSite} onChange={handleSiteFilterChange} className="bg-slate-950 text-white text-xs font-bold rounded-lg border border-slate-800 px-3 py-2 w-48 outline-none focus:border-blue-500 transition-colors">
                                        {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* DASHBOARD STATS */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-emerald-500 shadow-xl relative overflow-hidden">
                                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2 relative z-10">Total Proposals</div>
                                    <div className="text-5xl font-black text-white relative z-10">{filteredImprovements.length}</div>
                                    <i className="fas fa-lightbulb absolute -right-4 -bottom-4 text-7xl text-emerald-500/10"></i>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-blue-500 shadow-xl relative overflow-hidden">
                                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2 relative z-10">Actions Closed</div>
                                    <div className="text-5xl font-black text-blue-400 relative z-10">{stats.closedActions}</div>
                                    <i className="fas fa-check-circle absolute -right-4 -bottom-4 text-7xl text-blue-500/10"></i>
                                </div>
                                <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl relative overflow-hidden">
                                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2 relative z-10">Actions Open</div>
                                    <div className="text-5xl font-black text-yellow-400 relative z-10">{stats.openActions}</div>
                                    <i className="fas fa-clock absolute -right-4 -bottom-4 text-7xl text-yellow-500/10"></i>
                                </div>
                            </div>

                            {/* LIST TABLE */}
                            <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-950/80 backdrop-blur-md text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                                        <tr><th className="p-5 pl-6">Date / Ref</th><th className="p-5">Type</th><th className="p-5">Title</th><th className="p-5">Origin Site</th><th className="p-5">Status</th><th className="p-5">Action Progress</th><th className="p-5 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                                        {filteredImprovements.map((imp, idx) => {
                                            const safeActions = Array.isArray(imp.actions) ? imp.actions : (imp.actions ? Object.values(imp.actions) : []);
                                            const total = safeActions.length;
                                            const closed = safeActions.filter(a => a.status === 'Closed').length;
                                            const pct = total > 0 ? (closed / total) * 100 : 0;

                                            return (
                                                <tr key={imp.firebaseKey || idx} className="hover:bg-slate-800/50 transition-colors group">
                                                    <td className="p-5 pl-6">
                                                        <div className="text-xs font-mono font-bold text-blue-400">{imp.id}</div>
                                                        <div className="text-[10px] text-slate-500 mt-1">{imp.date}</div>
                                                    </td>
                                                    <td className="p-5">
                                                        <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded-lg border shadow-sm ${imp.type === 'JDI' ? 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30' : imp.type === 'Kaizen' ? 'text-blue-400 bg-blue-900/20 border-blue-500/30' : 'text-purple-400 bg-purple-900/20 border-purple-500/30'}`}>
                                                            {imp.type}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 font-bold text-white text-base max-w-xs truncate group-hover:text-blue-400 transition-colors" title={imp.title}>{imp.title}</td>
                                                    <td className="p-5 text-xs font-medium text-slate-300">
                                                        {imp.siteId}
                                                        {imp.horizontalDeployment && <span className="ml-2 bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold border border-blue-500/30 tracking-widest">Global</span>}
                                                    </td>
                                                    <td className="p-5">
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${imp.status === 'Completed' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50' : imp.status === 'Rejected' ? 'bg-red-900/30 text-red-400 border-red-500/50' : imp.status === 'Approved' ? 'bg-blue-900/30 text-blue-400 border-blue-500/50' : 'bg-slate-800 text-slate-400 border-slate-600'}`}>{imp.status}</span>
                                                    </td>
                                                    <td className="p-5 w-[15%]">
                                                        <div className="flex justify-between text-[10px] mb-1.5 font-bold tracking-wider"><span>{closed}/{total} Done</span><span className={pct === 100 ? 'text-emerald-400' : 'text-blue-400'}>{Math.round(pct)}%</span></div>
                                                        <div className="w-full bg-slate-950 rounded-full h-2 shadow-inner border border-slate-800"><div className={`h-2 rounded-full transition-all duration-1000 ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]'}`} style={{ width: `${pct}%` }}></div></div>
                                                    </td>
                                                    <td className="p-5 pr-6 text-right flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button type="button" onClick={() => triggerPrint(imp)} className="text-blue-400 hover:text-white transition bg-slate-900 hover:bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center border border-slate-700 hover:border-blue-500 shadow-lg" title="Print"><i className="fas fa-print"></i></button>
                                                        {canEditRecord(imp.siteId) ? (
                                                            <button type="button" onClick={() => { setForm(imp); setView('form'); }} className="text-purple-400 hover:text-white transition bg-slate-900 hover:bg-purple-600 w-8 h-8 rounded-lg flex items-center justify-center border border-slate-700 hover:border-purple-500 shadow-lg" title="Edit"><i className="fas fa-edit"></i></button>
                                                        ) : (
                                                            <button type="button" onClick={() => { setForm(imp); setView('form'); }} className="text-slate-400 hover:text-white transition bg-slate-900 hover:bg-slate-700 w-8 h-8 rounded-lg flex items-center justify-center border border-slate-700 hover:border-slate-500 shadow-lg" title="View"><i className="fas fa-eye"></i></button>
                                                        )}

                                                        {canDeleteRecord(imp.siteId) && (
                                                            <button type="button" onClick={() => handleDelete(imp.firebaseKey)} className="text-slate-500 hover:text-red-400 transition bg-slate-900 hover:bg-red-900/30 w-8 h-8 rounded-lg flex items-center justify-center border border-slate-700 hover:border-red-500/50 shadow-lg" title="Delete"><i className="fas fa-trash"></i></button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredImprovements.length === 0 && <tr><td colSpan="7" className="p-16 text-center italic text-slate-500 text-lg border-2 border-dashed border-slate-800 rounded-b-3xl m-2 bg-slate-900/40">No improvement proposals found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {view === 'form' && (
                        <div className="glass-panel p-8 md:p-10 rounded-3xl animate-in slide-in-from-bottom-8 duration-500 shadow-2xl border border-slate-700 mb-20">
                            <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-4 border-b border-slate-800 pb-5">
                                <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-2xl shadow-lg"><i className="fas fa-lightbulb text-white"></i></span>
                                {form.firebaseKey ? (canEditForm ? 'Edit Improvement Proposal' : 'View Improvement Proposal') : 'Submit Improvement Proposal'}
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Improvement Type</label>
                                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} disabled={!canEditForm} className="bg-slate-950 text-white focus:border-blue-500 shadow-inner w-full outline-none p-3.5 rounded-xl border border-slate-700 text-sm font-bold transition-colors">
                                        <option value="JDI">Just Do It (JDI)</option>
                                        <option value="Kaizen">Kaizen Event</option>
                                        <option value="Program Development">Program Development</option>
                                    </select>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Originating Site</label>
                                    <select value={form.siteId} onChange={e => setForm({ ...form, siteId: e.target.value })} disabled={form.firebaseKey || !canEditForm} className="bg-slate-950 focus:border-blue-500 outline-none w-full p-3.5 rounded-xl border border-slate-700 text-sm text-white shadow-inner transition-colors">
                                        {(isGlobalUser || visibleSites.length > 1) && <option value="">Select Site...</option>}
                                        {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Title</label>
                                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} disabled={!canEditForm} placeholder="Give your proposal a clear title..." className="bg-slate-950 focus:border-blue-500 font-bold outline-none w-full p-3.5 rounded-xl border border-slate-700 text-white shadow-inner transition-colors text-base" />
                                </div>

                                {/* HORIZONTAL DEPLOYMENT TOGGLE */}
                                <div className="col-span-1 md:col-span-4 mt-2 bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl flex items-center justify-between shadow-inner">
                                    <div>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input type="checkbox" checked={form.horizontalDeployment || false} onChange={e => setForm({ ...form, horizontalDeployment: e.target.checked })} disabled={!canEditForm} className="w-5 h-5 accent-blue-500 cursor-pointer" />
                                            <span className="text-sm font-bold text-blue-400 uppercase tracking-widest">Horizontal Deployment</span>
                                        </label>
                                        <p className="text-[10px] text-slate-400 mt-1 ml-8">If checked, saving this proposal will automatically generate a separate CAPA Action for <strong>every site in the organization</strong>.</p>
                                    </div>
                                    <i className="fas fa-globe text-3xl text-blue-500/20"></i>
                                </div>
                            </div>

                            <div className="space-y-8">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-blue-400 tracking-widest block mb-3 flex items-center gap-2"><i className="fas fa-align-left"></i> Detailed Description</label>
                                    <textarea rows="4" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} disabled={!canEditForm} placeholder="Explain the current state vs the proposed future state..." className="resize-none bg-slate-950 focus:border-blue-500 custom-scroll outline-none w-full p-5 rounded-xl border border-slate-700 text-sm text-slate-200 shadow-inner transition-colors leading-relaxed"></textarea>
                                </div>

                                <ActionPlanBuilder actions={Array.isArray(form.actions) ? form.actions : []} users={siteUsers} sites={sites} defaultSiteId={form.siteId} disabled={!canEditForm} onChange={a => setForm({ ...form, actions: a })} />

                                <MetricBuilder metrics={Array.isArray(form.metrics) ? form.metrics : []} onChange={m => setForm({ ...form, metrics: m })} disabled={!canEditForm} />

                                {(form.type === 'Kaizen' || form.type === 'Program Development') && (
                                    <div className="w-1/3">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Estimated Cost / Investment</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3.5 text-slate-500 font-bold">$</span>
                                            <input value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} disabled={!canEditForm} placeholder="0.00" className="bg-slate-950 focus:border-blue-500 pl-10 outline-none w-full p-3.5 rounded-xl border border-slate-700 text-white shadow-inner font-mono transition-colors" />
                                        </div>
                                    </div>
                                )}

                                {form.type === 'Program Development' && (
                                    <div className="p-8 rounded-2xl border border-purple-500/30 bg-purple-900/10 grid grid-cols-1 md:grid-cols-3 gap-10 shadow-inner mt-8">
                                        <DynamicList label="Documentation Required" items={Array.isArray(form.documentation) ? form.documentation : []} disabled={!canEditForm} onChange={v => setForm({ ...form, documentation: v })} placeholder="e.g. Update SOP-02" color="text-purple-400" />
                                        <DynamicList label="Training Requirements" items={Array.isArray(form.training) ? form.training : []} disabled={!canEditForm} onChange={v => setForm({ ...form, training: v })} placeholder="e.g. Supervisor Briefing" color="text-purple-400" />
                                        <DynamicList label="Infrastructure Changes" items={Array.isArray(form.infrastructure) ? form.infrastructure : []} disabled={!canEditForm} onChange={v => setForm({ ...form, infrastructure: v })} placeholder="e.g. New signage" color="text-purple-400" />
                                    </div>
                                )}

                                {/* WORKFLOW APPROVAL GATES */}
                                <div className="pt-8 border-t border-slate-800">
                                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><i className="fas fa-file-signature text-blue-400"></i> Review & Approvals</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <ApprovalBlock roleName="safety" icon="fa-hard-hat" color="text-emerald-400" data={form} form={form} setForm={setForm} session={session} disabled={!canEditForm} users={siteUsers} />
                                        <ApprovalBlock roleName="operations" icon="fa-cogs" color="text-orange-400" data={form} form={form} setForm={setForm} session={session} disabled={!canEditForm} users={siteUsers} />
                                        <ApprovalBlock roleName="engineering" icon="fa-wrench" color="text-blue-400" data={form} form={form} setForm={setForm} session={session} disabled={!canEditForm} users={siteUsers} />
                                    </div>
                                </div>

                                <div className="flex justify-between items-center pt-8 mt-10 border-t border-slate-800">
                                    <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-xl border border-slate-700 shadow-inner">
                                        <label className="text-xs uppercase font-bold text-slate-500 tracking-widest ml-2 flex items-center gap-2">
                                            System Status:
                                            {form.status === 'Completed' ? <i className="fas fa-check-circle text-emerald-400"></i> :
                                                form.status === 'Approved' ? <i className="fas fa-thumbs-up text-blue-400"></i> :
                                                    form.status === 'Rejected' ? <i className="fas fa-times-circle text-red-400"></i> :
                                                        form.status === 'In Progress' ? <i className="fas fa-spinner fa-spin text-yellow-400"></i> :
                                                            <i className="fas fa-hourglass-half text-slate-400"></i>}
                                        </label>
                                        <span className={`px-4 py-1.5 rounded-lg text-sm font-bold uppercase tracking-widest border ${form.status === 'Completed' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50' : form.status === 'Approved' ? 'bg-blue-900/30 text-blue-400 border-blue-500/50' : form.status === 'Rejected' ? 'bg-red-900/30 text-red-400 border-red-500/50' : form.status === 'In Progress' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/50' : 'bg-slate-800 text-slate-400 border-slate-600'}`}>
                                            {form.status}
                                        </span>
                                    </div>

                                    <div className="flex gap-4">
                                        <button type="button" onClick={() => triggerPrint(form)} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition-transform transform active:scale-95 flex items-center gap-3 uppercase tracking-widest text-sm">
                                            <i className="fas fa-print text-lg"></i> Print Record
                                        </button>
                                        {canEditForm && (
                                            <button type="button" onClick={handleSubmit} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-12 rounded-xl shadow-lg shadow-blue-900/50 transition-transform transform active:scale-95 flex items-center gap-3 uppercase tracking-widest text-sm disabled:opacity-50">
                                                {saving ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-paper-plane text-lg"></i>} Save Proposal
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- PRINT OVERLAY --- */}
            {printData && (
                <div className="hidden print:block p-8 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                        <div>
                            <div className="text-sm font-bold text-gray-500 mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Continuous Improvement</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">{printData.type} Proposal Record</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold font-mono">Ref ID: {printData.id}</p>
                            <p className="text-sm font-bold mt-1 uppercase">Date: {printData.date}</p>
                        </div>
                    </div>

                    <div className="mb-6 border border-black p-4 bg-gray-50">
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Title:</td>
                                    <td colSpan="3" className="text-lg font-bold py-2 border-b border-gray-300">{printData.title}</td>
                                </tr>
                                <tr>
                                    <td className="font-bold py-2 border-b border-gray-300">Origin Site:</td>
                                    <td className="w-[35%] py-2 border-b border-gray-300">{printData.siteId} {printData.horizontalDeployment && '(Horizontal Deployment)'}</td>
                                    <td className="w-[15%] font-bold py-2 pl-4 border-b border-gray-300">Status:</td>
                                    <td className="w-[35%] py-2 border-b border-gray-300 font-bold uppercase">{printData.status}</td>
                                </tr>
                                <tr>
                                    <td className="font-bold py-2 border-none">Submitted By:</td>
                                    <td className="py-2 border-none">{printData.createdBy}</td>
                                    <td className="font-bold py-2 pl-4 border-none">Est. Cost:</td>
                                    <td className="py-2 border-none font-mono">${printData.cost || '0.00'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 border border-black p-4">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Proposal Description</h2>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">{printData.description || 'No description provided.'}</div>
                    </div>

                    <div className="mb-6">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-black inline-block">2. Impact Metrics</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border border-black p-2 text-left">Metric Name</th>
                                    <th className="border border-black p-2 text-left w-1/3">Projected Impact</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.metrics && printData.metrics.length > 0 ? printData.metrics.map((m, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-2 font-bold">{m.name}</td>
                                        <td className="border border-black p-2">{m.value}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="2" className="border border-black p-4 text-center italic">No metrics defined.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 page-break-inside-avoid">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-black inline-block">3. Implementation Action Plan (CAPA)</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border border-black p-2 text-left">Action Description</th>
                                    <th className="border border-black p-2 text-left w-[20%]">Site</th>
                                    <th className="border border-black p-2 text-left w-[20%]">Owner</th>
                                    <th className="border border-black p-2 w-[15%] text-center">Due Date</th>
                                    <th className="border border-black p-2 w-[15%] text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.actions && printData.actions.length > 0 ? printData.actions.map((c, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-2 font-medium">{c.action}</td>
                                        <td className="border border-black p-2">{c.siteId}</td>
                                        <td className="border border-black p-2 font-bold">{c.owner}</td>
                                        <td className="border border-black p-2 text-center font-mono">{c.due}</td>
                                        <td className="border border-black p-2 text-center font-bold uppercase">{c.status}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="5" className="border border-black p-4 text-center italic">No CAPA items required.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 page-break-inside-avoid">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-black inline-block">4. Approvals & Sign-Off</h2>
                        <div className="grid grid-cols-3 gap-4">
                            {['safety', 'operations', 'engineering'].map(role => {
                                const app = printData.approvals?.[role] || { status: 'Pending', by: 'N/A', date: 'N/A', comment: 'N/A', assignedTo: 'N/A' };
                                return (
                                    <div key={role} className="border border-black p-3">
                                        <div className="font-bold uppercase border-b border-black pb-1 mb-2">{role} Approval</div>
                                        <div className="text-xs mb-1">Status: <strong className="uppercase">{app.status}</strong></div>
                                        <div className="text-xs mb-1">Assigned To: <strong>{app.assignedTo || 'Unassigned'}</strong></div>
                                        {app.status !== 'Pending' && (
                                            <>
                                                <div className="text-xs mb-1">Signed By: {app.by}</div>
                                                <div className="text-xs mb-2">Date: {app.date}</div>
                                            </>
                                        )}
                                        <div className="text-xs italic bg-gray-100 p-2 border border-gray-300 min-h-[40px]">{app.comment || 'No comments provided.'}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                </div>
            )}
        </div>
    );
}
