import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, update } from 'firebase/database';
import { rtdb } from '../config/firebase';
import * as XLSX from 'xlsx';

export default function Capa() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [actions, setActions] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterSite, setFilterSite] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterSource, setFilterSource] = useState('All');
    const [dbSites, setDbSites] = useState([]);

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        setSession(sess);
        fetchActions(sess.orgId);
    }, [navigate]);

    const fetchActions = async (orgId) => {
        try {
            const dbRef = ref(rtdb, `organizations/${orgId}`);
            const snap = await get(dbRef);

            if (snap.exists()) {
                const data = snap.val();
                const allActions = [];

                if (data.sites) {
                    setDbSites(Object.values(data.sites).map(s => s.code || s.name));
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
                                    dbPath: `organizations/${orgId}/consultations/${key}/actions/${idx}`
                                });
                            });
                        }
                    });
                }

                // 5. IMPROVEMENTS
                if (data.improvements) {
                    Object.entries(data.improvements).forEach(([key, imp]) => {
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
                                    siteId: imp.siteId || 'Global',
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
                                dbPath: `organizations/${orgId}/improvements/${key}`
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

    const updateStatus = async (action, newStatus) => {
        setActions(prev => prev.map(a => a.uid === action.uid ? { ...a, status: newStatus } : a));
        try {
            const field = action.source === 'Audit' ? 'capaStatus' : 'status';
            await update(ref(rtdb, action.dbPath), { [field]: newStatus });
        } catch (e) {
            alert("Failed to update status.");
            fetchActions(session.orgId);
        }
    };

    const updateOwner = async (action, newOwner) => {
        setActions(prev => prev.map(a => a.uid === action.uid ? { ...a, owner: newOwner } : a));
        try {
            await update(ref(rtdb, action.dbPath), { owner: newOwner, own: newOwner });
        } catch (e) {
            alert("Failed to update owner.");
            fetchActions(session.orgId);
        }
    };

    const uniqueSites = useMemo(() => {
        return ['All', ...new Set([...dbSites, ...actions.map(a => a.siteId).filter(Boolean)])];
    }, [actions, dbSites]);

    const filteredActions = useMemo(() => {
        return actions.filter(a => {
            const matchSite = filterSite === 'All' || a.siteId === filterSite;
            const matchStatus = filterStatus === 'All' || a.status === filterStatus;
            const matchSource = filterSource === 'All' || a.source === filterSource;
            return matchSite && matchStatus && matchSource;
        });
    }, [actions, filterSite, filterStatus, filterSource]);

    const stats = useMemo(() => {
        const total = filteredActions.length;
        const closed = filteredActions.filter(a => a.status === 'Closed').length;
        const open = total - closed;
        const today = new Date().toISOString().split('T')[0];
        const overdue = filteredActions.filter(a => a.status !== 'Closed' && a.due !== 'N/A' && a.due < today).length;
        return { total, closed, open, overdue };
    }, [filteredActions]);

    const exportExcel = () => {
        const exportData = filteredActions.map(({ source, sourceId, desc, owner, due, status, siteId }) => ({
            "Source Module": source,
            "Reference ID": sourceId,
            "Site": siteId,
            "Action Description": desc,
            "Owner": owner,
            "Due Date": due,
            "Current Status": status
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

            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-900/50">
                        <i className="fas fa-list-check"></i>
                    </div>
                    <h1 className="text-base font-bold text-white tracking-wide hidden md:block uppercase">Global CAPA Manager</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-600/20 uppercase tracking-widest">
                        <i className="fas fa-file-excel"></i> Export CSV
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto w-full relative z-10">
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
                            <select value={filterSite} onChange={e => setFilterSite(e.target.value)} className="w-48 bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-cyan-500 shadow-inner">
                                {uniqueSites.map(s => <option key={s} value={s} className="bg-slate-900 text-white">{s === 'All' ? 'All Sites' : s}</option>)}
                            </select>
                            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="w-48 bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-cyan-500 shadow-inner">
                                <option value="All" className="bg-slate-900 text-white">All Sources</option>
                                <option value="Incident" className="bg-slate-900 text-white">Incidents</option>
                                <option value="Audit" className="bg-slate-900 text-white">Audits</option>
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
                            <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap min-w-[800px]">
                                <thead className="bg-slate-950/80 backdrop-blur-md text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                                    <tr>
                                        <th className="p-5 pl-6">Source</th>
                                        <th className="p-5">Ref ID</th>
                                        <th className="p-5 w-1/3 whitespace-normal">Action Description</th>
                                        <th className="p-5">Owner</th>
                                        <th className="p-5">Due Date</th>
                                        <th className="p-5 pr-6">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                                    {filteredActions.map((act) => {
                                        const isOverdue = act.status !== 'Closed' && act.due !== 'N/A' && new Date(act.due) < new Date();
                                        return (
                                            <tr key={act.uid} className="hover:bg-slate-800/60 transition-colors">
                                                <td className="p-5 pl-6">
                                                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${act.source === 'Incident' ? 'text-orange-400 bg-orange-900/20 border-orange-500/30' : act.source === 'Audit' ? 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30' : 'text-blue-400 bg-blue-900/20 border-blue-500/30'}`}>
                                                        {act.source}
                                                    </span>
                                                </td>
                                                <td className="p-5 font-mono text-xs font-bold text-slate-400">{act.sourceId}</td>
                                                <td className="p-5 font-medium text-white leading-relaxed whitespace-normal min-w-[300px]">{act.desc}</td>

                                                <td className="p-5">
                                                    <select
                                                        value={act.owner && act.owner !== 'Unassigned' ? act.owner : ''}
                                                        onChange={(e) => updateOwner(act, e.target.value)}
                                                        className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 text-xs font-bold text-cyan-400 outline-none cursor-pointer w-full py-1 transition-colors"
                                                    >
                                                        <option value="" className="bg-slate-900 text-slate-500">Unassigned</option>
                                                        {/* ADDED ASSIGN TO ME OPTION */}
                                                        <option value={myName} className="bg-slate-800 text-blue-400 font-bold">➡️ Assign to Me ({myName})</option>
                                                        {users.filter(u => {
                                                            const isGlobal = u.role === 'Owner' || u.role === 'Lead Auditor' || u.assignedSite === 'GLOBAL' || (u.accessibleSites || []).includes('GLOBAL');
                                                            if (isGlobal) return true;
                                                            if (!act.siteId || act.siteId === 'Global' || act.siteId === 'GLOBAL') return true;
                                                            return u.assignedSite === act.siteId || (u.accessibleSites || []).includes(act.siteId);
                                                        }).map(u => (
                                                            <option key={u.id} value={u.name} className="bg-slate-900 text-white">
                                                                {u.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>

                                                <td className="p-5 text-xs font-mono text-slate-300">
                                                    {act.due}
                                                    {isOverdue && <span className="ml-3 px-2 py-1 bg-red-900/40 text-red-400 border border-red-500/30 rounded-lg font-bold uppercase text-[9px] animate-pulse">Overdue</span>}
                                                </td>
                                                <td className="p-5 pr-6">
                                                    <select value={act.status} onChange={(e) => updateStatus(act, e.target.value)} className={`text-xs px-3 py-2 rounded-xl font-bold cursor-pointer transition-colors outline-none border shadow-inner ${act.status === 'Closed' ? 'text-emerald-400 bg-emerald-950/50 border-emerald-500/30 focus:border-emerald-500' : act.status === 'In Progress' ? 'text-blue-400 bg-blue-950/50 border-blue-500/30 focus:border-blue-500' : 'text-orange-400 bg-orange-950/50 border-orange-500/30 focus:border-orange-500'}`}>
                                                        <option value="Open" className="bg-slate-900 text-white">Open</option>
                                                        <option value="In Progress" className="bg-slate-900 text-white">In Progress</option>
                                                        <option value="Closed" className="bg-slate-900 text-white">Closed</option>
                                                    </select>
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