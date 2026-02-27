import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, update, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';

// --- COMPONENTS ---
const DynamicList = ({ label, items, onChange, placeholder, color = "text-slate-500" }) => {
    const safeItems = Array.isArray(items) ? items : [];
    return (
        <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
                <label className={`text-[10px] uppercase font-bold ${color}`}>{label}</label>
                <button onClick={() => onChange([...safeItems, ''])} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded transition">+ Add Line</button>
            </div>
            <div className="space-y-2">
                {safeItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                        <input value={item} onChange={e => { const newItems = [...safeItems]; newItems[i] = e.target.value; onChange(newItems); }} placeholder={placeholder} className="text-sm bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-purple-500 w-full" />
                        <button onClick={() => onChange(safeItems.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 px-3 rounded bg-red-900/10 border border-red-900/30 transition flex items-center justify-center"><i className="fas fa-times"></i></button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const MetricBuilder = ({ metrics, onChange }) => {
    const safeMetrics = Array.isArray(metrics) ? metrics : [];
    return (
        <div className="mb-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] uppercase font-bold text-emerald-400"><i className="fas fa-chart-line mr-1"></i> Impact Metrics</label>
                <button onClick={() => onChange([...safeMetrics, { name: '', value: '' }])} className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-900/50 transition">+ Add Metric</button>
            </div>
            <div className="space-y-2">
                {safeMetrics.map((m, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2">
                        <div className="col-span-3"><input value={m.name} onChange={e => { const nm = [...safeMetrics]; nm[i].name = e.target.value; onChange(nm); }} placeholder="Metric Name" className="text-xs bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-emerald-500 w-full" /></div>
                        <div className="col-span-2 flex gap-2">
                            <input value={m.value} onChange={e => { const nm = [...safeMetrics]; nm[i].value = e.target.value; onChange(nm); }} placeholder="Impact" className="text-xs bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-emerald-500 w-full" />
                            <button onClick={() => onChange(safeMetrics.filter((_, idx) => idx !== i))} className="text-red-400 hover:bg-red-900/20 px-3 rounded transition flex items-center justify-center"><i className="fas fa-times"></i></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ActionPlanBuilder = ({ actions, users, onChange, session }) => {
    const safeActions = Array.isArray(actions) ? actions : [];
    const myName = session?.name || session?.email || session?.user || 'Me';

    return (
        <div className="mb-6 bg-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-inner">
            <div className="flex justify-between items-center mb-3">
                <label className="text-xs uppercase font-bold text-cyan-400"><i className="fas fa-list-check mr-2"></i> Implementation Action Plan (CAPA)</label>
                <button onClick={() => onChange([...safeActions, { action: '', owner: '', due: '', status: 'Open' }])} className="bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] px-3 py-1.5 rounded font-bold transition shadow">+ Add Action</button>
            </div>
            <div className="space-y-2">
                {safeActions.map((act, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-900 p-2 rounded border border-slate-700">
                        <div className="col-span-4"><input value={act.action} onChange={e => { const na = [...safeActions]; na[i].action = e.target.value; onChange(na); }} placeholder="Action Description..." className="text-xs bg-transparent border-none p-1 text-white outline-none focus:border-b focus:border-cyan-500 w-full transition-colors" /></div>
                        <div className="col-span-3">
                            <select value={act.owner} onChange={e => { const na = [...safeActions]; na[i].owner = e.target.value; onChange(na); }} className="text-xs bg-slate-950 border border-slate-700 rounded p-1.5 text-white outline-none focus:border-cyan-500 w-full">
                                <option value="">Owner...</option>
                                <option value={myName} className="bg-slate-800 text-cyan-400 font-bold">➡️ Assign to Me</option>
                                {users.map((u, idx) => <option key={u.id || idx} value={u.name}>{u.name}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2"><input type="date" value={act.due} onChange={e => { const na = [...safeActions]; na[i].due = e.target.value; onChange(na); }} className="text-xs bg-slate-950 border border-slate-700 rounded p-1.5 text-white outline-none focus:border-cyan-500 w-full" /></div>
                        <div className="col-span-2">
                            <select value={act.status || 'Open'} onChange={e => { const na = [...safeActions]; na[i].status = e.target.value; onChange(na); }} className={`text-xs w-full p-1.5 outline-none rounded border border-slate-700 cursor-pointer transition-colors ${act.status === 'Closed' ? 'bg-emerald-900/50 text-emerald-400' : act.status === 'In Progress' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-950 text-slate-300'}`}>
                                <option value="Open">Open</option><option value="In Progress">In Progress</option><option value="Closed">Closed</option>
                            </select>
                        </div>
                        <div className="col-span-1 flex justify-center"><button onClick={() => onChange(safeActions.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 transition w-8 h-8 flex items-center justify-center rounded hover:bg-slate-800"><i className="fas fa-times"></i></button></div>
                    </div>
                ))}
                {safeActions.length === 0 && <div className="text-center text-xs text-slate-500 italic py-2">No actions defined.</div>}
            </div>
        </div>
    );
};

// --- MAIN APP ---
export default function Improvement() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [view, setView] = useState('list');
    const [improvements, setImprovements] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Dashboard Filter
    const [filterSite, setFilterSite] = useState('All');

    const [form, setForm] = useState({
        firebaseKey: null, type: 'JDI', title: '', siteId: '', date: new Date().toISOString().split('T')[0], description: '', cost: '',
        metrics: [], documentation: [], training: [], infrastructure: [], notifications: [],
        actions: [], status: 'Proposed'
    });

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        setSession(sess);

        let initialSite = 'All';
        if (sess.role !== 'Owner' && sess.assignedSite && sess.assignedSite !== 'GLOBAL') {
            initialSite = sess.assignedSite;
        }
        setFilterSite(initialSite);

        const loadDatabases = async () => {
            setLoading(true);
            try {
                const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
                const snap = await get(dbRef);

                if (snap.exists()) {
                    const val = snap.val();

                    // EXACT SITE PARSER
                    if (val.sites) {
                        const allSites = Object.keys(val.sites).map(key => {
                            const sVal = val.sites[key];
                            return typeof sVal === 'object' ? { id: key, code: sVal.code || key, name: sVal.name || sVal.code || key, ...sVal } : { id: key, code: sVal, name: sVal };
                        });
                        if (sess.role === 'Owner') setSites(allSites);
                        else {
                            const accessible = Array.isArray(sess.accessibleSites) ? sess.accessibleSites : (sess.assignedSite ? [sess.assignedSite] : []);
                            setSites(allSites.filter(s => accessible.includes(s.code) || accessible.includes(s.id) || sess.assignedSite === s.code || sess.assignedSite === s.id || sess.assignedSite === 'GLOBAL'));
                        }
                    }

                    // SMART USER PARSER WITH OWNER FALLBACK
                    if (val.users) {
                        const allUsers = Object.keys(val.users).map(key => {
                            const uVal = val.users[key];
                            return typeof uVal === 'object' ? { id: key, name: uVal.name || uVal.email || "System Owner", role: uVal.role || "User", ...uVal } : { id: key, name: uVal || "System Owner", role: "User" };
                        }).filter(u => u.status !== 'Inactive' && u.status !== 'Deleted');
                        setUsers(allUsers);
                    }

                    // SAFE IMPROVEMENT PARSER
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
    }, [navigate]);

    // --- GLOBAL USER FILTERING LOGIC ---
    const siteUsers = useMemo(() => {
        return users.filter(u => {
            const isGlobal = u.role === 'Owner' || u.role === 'Lead Auditor' || u.assignedSite === 'GLOBAL' || (u.accessibleSites && u.accessibleSites.includes('GLOBAL'));
            const siteMatch = isGlobal || !form.siteId || u.assignedSite === form.siteId || (u.accessibleSites && u.accessibleSites.includes(form.siteId));
            const modMatch = isGlobal || !u.accessibleModules || u.accessibleModules.includes('improvement');
            return siteMatch && modMatch;
        });
    }, [users, form.siteId]);

    const filteredImprovements = useMemo(() => {
        if (filterSite === 'All') return improvements;
        return improvements.filter(imp => imp.siteId === filterSite);
    }, [improvements, filterSite]);

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

    // Permissions logic for Status updating
    const canChangeStatus = session?.role === 'Owner' || session?.role === 'Manager';

    const handleSubmit = async () => {
        if (!form.title || !form.description) return alert("Title and Description are required.");
        if (!form.siteId) return alert("Site is required.");

        setSaving(true);

        // Deep clean payload to remove any React specific bindings/prototypes
        const payload = JSON.parse(JSON.stringify({
            ...form,
            id: form.id || `IMP-${Date.now().toString().slice(-6)}`,
            createdBy: form.createdBy || session.user,
            timestamp: form.timestamp || new Date().toISOString()
        }));

        try {
            if (form.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/improvements/${form.firebaseKey}`), payload);
                alert("Proposal Updated Successfully!");
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/improvements`), payload);
                alert("Proposal Saved! Actions have been pushed to CAPA Manager.");
            }

            // Refresh state smoothly
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
        setForm({
            firebaseKey: null, type: 'JDI', title: '', siteId: filterSite !== 'All' ? filterSite : (sites.length > 0 ? sites[0].code : ''),
            date: new Date().toISOString().split('T')[0], description: '', cost: '',
            metrics: [], documentation: [], training: [], infrastructure: [], notifications: [], actions: [], status: 'Proposed'
        });
        setView('form');
    };

    if (loading || !session) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 font-['Space_Grotesk'] flex-col gap-4">
            <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500"></i>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Module...</h2>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <div className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 shadow-md flex-shrink-0 relative z-20">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50"><i className="fas fa-lightbulb"></i></div>
                    <h1 className="font-bold text-lg text-blue-400 hidden md:block tracking-wide">Continuous Improvement</h1>
                </div>
                <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 shadow-inner gap-1">
                    <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-database mr-1"></i> Dashboard</button>
                    <button onClick={handleNewClick} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'form' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-plus mr-1"></i> New Proposal</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scroll relative z-10">
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
                                    <select value={filterSite} onChange={e => setFilterSite(e.target.value)} className="bg-slate-950 text-white text-xs font-bold rounded-lg border border-slate-800 px-3 py-2 w-48 outline-none focus:border-blue-500 transition-colors">
                                        <option value="All">All Sites</option>
                                        {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
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
                                        <tr><th className="p-5 pl-6">Date / Ref</th><th className="p-5">Type</th><th className="p-5">Title</th><th className="p-5">Site</th><th className="p-5">Action Progress</th><th className="p-5 pr-6 text-right">Actions</th></tr>
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
                                                    <td className="p-5 text-xs font-medium text-slate-300">{imp.siteId}</td>
                                                    <td className="p-5 w-1/4">
                                                        <div className="flex justify-between text-[10px] mb-1.5 font-bold tracking-wider"><span>{closed}/{total} Tasks Done</span><span className={pct === 100 ? 'text-emerald-400' : 'text-blue-400'}>{Math.round(pct)}%</span></div>
                                                        <div className="w-full bg-slate-950 rounded-full h-2 shadow-inner border border-slate-800"><div className={`h-2 rounded-full transition-all duration-1000 ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]'}`} style={{ width: `${pct}%` }}></div></div>
                                                    </td>
                                                    <td className="p-5 pr-6 text-right flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setForm(imp); setView('form'); }} className="text-blue-400 hover:text-white transition bg-slate-900 hover:bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center border border-slate-700 hover:border-blue-500 shadow-lg" title="Edit/View"><i className="fas fa-edit"></i></button>
                                                        {(session.role === 'Owner' || session.role === 'Manager') && <button onClick={() => handleDelete(imp.firebaseKey)} className="text-slate-500 hover:text-red-400 transition bg-slate-900 hover:bg-red-900/30 w-8 h-8 rounded-lg flex items-center justify-center border border-slate-700 hover:border-red-500/50 shadow-lg" title="Delete"><i className="fas fa-trash"></i></button>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredImprovements.length === 0 && <tr><td colSpan="6" className="p-16 text-center italic text-slate-500 text-lg border-2 border-dashed border-slate-800 rounded-b-3xl m-2 bg-slate-900/40">No improvement proposals found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {view === 'form' && (
                        <div className="glass-panel p-8 md:p-10 rounded-3xl animate-in slide-in-from-bottom-8 duration-500 shadow-2xl border border-slate-700 mb-20">
                            <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-4 border-b border-slate-800 pb-5">
                                <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-2xl shadow-lg"><i className="fas fa-lightbulb text-white"></i></span>
                                {form.firebaseKey ? 'Edit Improvement Proposal' : 'Submit Improvement Proposal'}
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Improvement Type</label>
                                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="bg-slate-950 text-white focus:border-blue-500 shadow-inner w-full outline-none p-3.5 rounded-xl border border-slate-700 text-sm font-bold transition-colors">
                                        <option value="JDI">Just Do It (JDI)</option>
                                        <option value="Kaizen">Kaizen Event</option>
                                        <option value="Program Development">Program Development</option>
                                    </select>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Site Location</label>
                                    <select value={form.siteId} onChange={e => setForm({ ...form, siteId: e.target.value })} className="bg-slate-950 focus:border-blue-500 outline-none w-full p-3.5 rounded-xl border border-slate-700 text-sm text-white shadow-inner transition-colors">
                                        <option value="">Select Site...</option>
                                        {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 tracking-widest ml-1">Title</label>
                                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Give your proposal a clear title..." className="bg-slate-950 focus:border-blue-500 font-bold outline-none w-full p-3.5 rounded-xl border border-slate-700 text-white shadow-inner transition-colors text-base" />
                                </div>
                            </div>

                            <div className="space-y-8">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-blue-400 tracking-widest block mb-3 flex items-center gap-2"><i className="fas fa-align-left"></i> Detailed Description</label>
                                    <textarea rows="4" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Explain the current state vs the proposed future state..." className="resize-none bg-slate-950 focus:border-blue-500 custom-scroll outline-none w-full p-5 rounded-xl border border-slate-700 text-sm text-slate-200 shadow-inner transition-colors leading-relaxed"></textarea>
                                </div>

                                {/* UNIVERSAL ACTION PLAN BUILDER WITH GLOBAL USER FILTERING */}
                                <ActionPlanBuilder actions={Array.isArray(form.actions) ? form.actions : []} users={siteUsers} onChange={a => setForm({ ...form, actions: a })} session={session} />

                                <MetricBuilder metrics={Array.isArray(form.metrics) ? form.metrics : []} onChange={m => setForm({ ...form, metrics: m })} />

                                {(form.type === 'Kaizen' || form.type === 'Program Development') && (
                                    <div className="w-1/3">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Estimated Cost / Investment</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3.5 text-slate-500 font-bold">$</span>
                                            <input value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="0.00" className="bg-slate-950 focus:border-blue-500 pl-10 outline-none w-full p-3.5 rounded-xl border border-slate-700 text-white shadow-inner font-mono transition-colors" />
                                        </div>
                                    </div>
                                )}

                                {form.type === 'Program Development' && (
                                    <div className="p-8 rounded-2xl border border-purple-500/30 bg-purple-900/10 grid grid-cols-1 md:grid-cols-3 gap-10 shadow-inner mt-8">
                                        <DynamicList label="Documentation Required" items={Array.isArray(form.documentation) ? form.documentation : []} onChange={v => setForm({ ...form, documentation: v })} placeholder="e.g. Update SOP-02" color="text-purple-400" />
                                        <DynamicList label="Training Requirements" items={Array.isArray(form.training) ? form.training : []} onChange={v => setForm({ ...form, training: v })} placeholder="e.g. Supervisor Briefing" color="text-purple-400" />
                                        <DynamicList label="Infrastructure Changes" items={Array.isArray(form.infrastructure) ? form.infrastructure : []} onChange={v => setForm({ ...form, infrastructure: v })} placeholder="e.g. New signage" color="text-purple-400" />
                                    </div>
                                )}

                                <div className="flex justify-between items-center pt-8 mt-10 border-t border-slate-800">
                                    <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-700 shadow-inner">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-3 flex items-center gap-1">
                                            Proposal Status: {!canChangeStatus && <i className="fas fa-lock text-red-400 ml-1" title="Only Managers can change status"></i>}
                                        </label>
                                        <select
                                            value={form.status}
                                            onChange={e => setForm({ ...form, status: e.target.value })}
                                            disabled={!canChangeStatus}
                                            className={`bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-blue-500 transition-colors ${!canChangeStatus ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${form.status === 'Completed' ? 'text-emerald-400' : form.status === 'Proposed' ? 'text-blue-400' : form.status === 'Rejected' ? 'text-red-400' : 'text-orange-400'}`}
                                        >
                                            <option>Proposed</option><option>Approved</option><option>In Progress</option><option>Completed</option><option>Rejected</option>
                                        </select>
                                    </div>
                                    <button onClick={handleSubmit} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-12 rounded-xl shadow-lg shadow-blue-900/50 transition-transform transform active:scale-95 flex items-center gap-3 uppercase tracking-widest text-sm disabled:opacity-50">
                                        {saving ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-paper-plane text-lg"></i>} Save Proposal
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}