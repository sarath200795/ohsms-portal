import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { equalTo, onValue, orderByChild, push, query, ref, update } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { readOrgChildren } from '../utils/orgData';
import { hasAccessibleModule } from '../utils/permissions';
import { canAuthenticateStatus, readStoredSession } from '../utils/session';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const getTypeClass = (type) => {
    const t = type || '';
    if (t.includes('Major')) return 'bg-red-900/50 text-red-300 border border-red-500';
    if (t.includes('Minor')) return 'bg-orange-900/50 text-orange-300 border border-orange-500';
    if (t.includes('OFI')) return 'bg-yellow-900/50 text-yellow-300 border border-yellow-500';
    return 'bg-blue-900/50 text-blue-300 border border-blue-500';
};

const safeArrayParse = (data) => {
    try {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (typeof data !== 'object') return [];
        return Object.keys(data).map(key => {
            const item = data[key];
            return typeof item === 'object' ? { firebaseKey: key, ...item } : item;
        });
    } catch { return []; }
};

const GLOBAL_AUDIT_ROLES = ['Global Owner', 'Global Manager', 'Owner', 'Admin'];

const scopedCollectionRef = (session, childName) => {
    if (GLOBAL_AUDIT_ROLES.includes(session?.role) || session?.assignedSite === 'GLOBAL') {
        return ref(rtdb, `organizations/${session.orgId}/${childName}`);
    }
    return query(ref(rtdb, `organizations/${session.orgId}/${childName}`), orderByChild('siteId'), equalTo(session?.assignedSite || ''));
};

// ============================================================================
// MODULE 1: AUDIT SCHEDULER
// ============================================================================
const AuditScheduler = ({ setView, session }) => {
    const [sites, setSites] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [teamSearch, setTeamSearch] = useState('');

    const [plan, setPlan] = useState({
        siteId: '', leadAuditor: '', team: [], standard: 'ISO 45001:2018', startDate: '', endDate: '', docId: ''
    });

    const [rows, setRows] = useState([{ auditor: '', auditee: '', dept: '', area: '', aspect: '', date: '', time: '' }]);
    const myName = session?.name || session?.email || session?.user || 'Me';

    useEffect(() => {
        const load = async () => {
            try {
                const val = await readOrgChildren(rtdb, session.orgId, ['sites', 'users']);
                if (val.sites) {
                    const parsedSites = Object.keys(val.sites).map(key => {
                        const sVal = val.sites[key];
                        return typeof sVal === 'object' ? { code: sVal.code || key, name: sVal.name || sVal.code || key, ...sVal } : { code: sVal, name: sVal };
                    });
                    setSites(parsedSites);
                }
                if (val.users) {
                    const parsedUsers = Object.keys(val.users).map(key => {
                        const uVal = val.users[key];
                        return typeof uVal === 'object' ? { id: key, name: uVal.name || uVal.email || "System Owner", role: uVal.role || 'User', email: uVal.email || '', ...uVal } : { id: key, name: uVal || "System Owner", role: 'User', email: '' };
                    }).filter(u => canAuthenticateStatus(u.status));
                    setAllUsers(parsedUsers);
                }
            } catch (e) {
                console.error("Load error:", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [session.orgId]);

    useEffect(() => {
        if (plan.siteId) {
            const seq = Math.floor(1000 + Math.random() * 9000);
            setPlan(p => ({ ...p, docId: `${session.orgId}-${plan.siteId}-IAP-${seq}` }));
        }
    }, [plan.siteId, session.orgId]);

    const addRow = () => setRows([...rows, { auditor: '', auditee: '', dept: '', area: '', aspect: '', date: '', time: '' }]);
    const removeRow = (index) => setRows(rows.filter((_, i) => i !== index));
    const updateRow = (index, field, value) => { const newRows = [...rows]; newRows[index][field] = value; setRows(newRows); };
    const toggleTeamMember = (userName) => {
        if (plan.team.includes(userName)) setPlan({ ...plan, team: plan.team.filter(t => t !== userName) });
        else setPlan({ ...plan, team: [...plan.team, userName] });
    };

    const handleSave = async () => {
        if (!plan.siteId || !plan.startDate || !plan.leadAuditor) return alert("Please fill in Site, Lead Auditor and Dates.");
        const payload = { ...plan, matrix: rows, createdAt: new Date().toISOString(), createdBy: session.user, status: 'Planned' };
        try {
            await push(ref(rtdb, `organizations/${session.orgId}/auditPlans`), payload);
            alert("Audit Plan Saved Successfully!");
            setView('hub');
        } catch (e) {
            alert("Save failed: " + e.message);
        }
    };

    const siteUsers = useMemo(() => {
        if (!plan.siteId) return [];
        return allUsers.filter(u => u.assignedSite === plan.siteId || (u.accessibleSites && u.accessibleSites.includes(plan.siteId)) || u.role === 'Owner');
    }, [allUsers, plan.siteId]);

    const filteredAuditors = useMemo(() => {
        if (!teamSearch) return allUsers;
        const q = teamSearch.toLowerCase();
        return allUsers.filter(u =>
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.id && u.id.toLowerCase().includes(q))
        );
    }, [allUsers, teamSearch]);

    if (loading) return <div className="flex h-full items-center justify-center text-white"><div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-4"></div> Loading Scheduler...</div>;

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 relative">
            <style type="text/css">{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>

            <div className="flex justify-between items-center mb-6 print:hidden">
                <div>
                    <h2 className="text-2xl font-bold text-blue-400"><i className="fas fa-calendar-alt mr-2"></i> Audit Scheduler</h2>
                    <p className="text-slate-400 text-sm">Plan and assign audits across the organization.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg flex items-center gap-2"><i className="fas fa-print"></i> Print Plan</button>
                    <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-save"></i> Save Plan</button>
                </div>
            </div>

            <div className="space-y-6 pb-20 print:hidden">
                <div className="glass-panel p-8 rounded-3xl border-l-4 border-blue-500 shadow-xl border border-slate-700 bg-slate-900/40">
                    <div className="flex justify-between items-start mb-6">
                        <h2 className="text-xl font-bold text-blue-400">Section 1: General Information</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Target Site</label>
                                <select value={plan.siteId} onChange={e => setPlan({ ...plan, siteId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-sm text-white focus:border-blue-500 outline-none shadow-inner">
                                    <option value="">Select Site...</option>
                                    {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Standard</label>
                                <input value={plan.standard} onChange={e => setPlan({ ...plan, standard: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-sm text-white focus:border-blue-500 outline-none shadow-inner" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Lead Auditor</label>
                                <select value={plan.leadAuditor} onChange={e => setPlan({ ...plan, leadAuditor: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-sm text-white focus:border-blue-500 outline-none shadow-inner">
                                    <option value="">Select...</option>
                                    <option value={myName} className="bg-slate-800 text-blue-400 font-bold">➡️ Assign to Me ({myName})</option>
                                    {allUsers.map(u => <option key={u.id} value={u.name}>{u.name} {u.email ? `(${u.email})` : ''}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Start Date</label><input type="date" value={plan.startDate} onChange={e => setPlan({ ...plan, startDate: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-sm text-white focus:border-blue-500 outline-none shadow-inner font-mono" /></div>
                                <div><label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">End Date</label><input type="date" value={plan.endDate} onChange={e => setPlan({ ...plan, endDate: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-sm text-white focus:border-blue-500 outline-none shadow-inner font-mono" /></div>
                            </div>
                        </div>
                        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700 flex flex-col h-full shadow-inner">
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3 block">Audit Team Members</label>
                            <div className="relative mb-3">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                <input type="text" placeholder="Search name or email..." value={teamSearch} onChange={e => setTeamSearch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-9 pr-3 text-xs text-white focus:border-blue-500 outline-none" />
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scroll space-y-1.5 min-h-[120px] max-h-[160px]">
                                {filteredAuditors.map(u => (
                                    <div key={u.id} onClick={() => toggleTeamMember(u.name)} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${plan.team.includes(u.name) ? 'bg-blue-600/20 border border-blue-500/50 shadow-sm' : 'hover:bg-slate-800 border border-transparent'}`}>
                                        <div className={`w-5 h-5 shrink-0 rounded flex items-center justify-center border transition-colors ${plan.team.includes(u.name) ? 'bg-blue-500 border-blue-400 text-white' : 'border-slate-600 bg-slate-900'}`}>
                                            {plan.team.includes(u.name) && <i className="fas fa-check text-[10px]"></i>}
                                        </div>
                                        <div className="truncate">
                                            <div className={`text-xs font-bold truncate ${plan.team.includes(u.name) ? 'text-blue-300' : 'text-slate-300'}`}>{u.name}</div>
                                            <div className="text-[9px] text-slate-500 truncate">{u.email || 'No email registered'}</div>
                                        </div>
                                    </div>
                                ))}
                                {filteredAuditors.length === 0 && <div className="text-center text-xs text-slate-500 italic py-4">No auditors found.</div>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-8 rounded-3xl border-t-4 border-emerald-500 shadow-xl border border-slate-700 bg-slate-900/40">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-emerald-400">Section 2: Audit Execution Matrix</h2>
                        <button onClick={addRow} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 border border-slate-600 shadow-lg"><i className="fas fa-plus text-emerald-400"></i> Add Row</button>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-700 shadow-inner custom-scroll pb-4">
                        <table className="w-full text-left text-sm text-slate-300 min-w-[1000px]">
                            <thead className="bg-slate-950/80 backdrop-blur-md text-[10px] uppercase font-bold text-slate-500 tracking-widest sticky top-0 border-b border-slate-800">
                                <tr><th className="p-4">Auditor</th><th className="p-4">Auditee</th><th className="p-4">Department</th><th className="p-4">Area</th><th className="p-4">Aspect / Process</th><th className="p-4 w-36">Date</th><th className="p-4 w-32">Time</th><th className="p-4 w-12 text-center"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                                {rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="p-3">
                                            <select className="bg-slate-900 border border-slate-700 text-white w-full text-xs p-2.5 rounded-lg outline-none focus:border-emerald-500" value={row.auditor} onChange={e => updateRow(i, 'auditor', e.target.value)}>
                                                <option value="">Select...</option>
                                                <option value={myName} className="bg-slate-800 text-blue-400 font-bold">➡️ Assign to Me</option>
                                                {plan.leadAuditor && <option value={plan.leadAuditor}>{plan.leadAuditor} (Lead)</option>}
                                                {plan.team.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-3">
                                            <select className="bg-slate-900 border border-slate-700 text-white w-full text-xs p-2.5 rounded-lg outline-none focus:border-emerald-500" value={row.auditee} onChange={e => updateRow(i, 'auditee', e.target.value)}>
                                                <option value="">Select...</option>
                                                <option value={myName} className="bg-slate-800 text-emerald-400 font-bold">➡️ Assign to Me</option>
                                                {siteUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-slate-700 p-2 text-xs outline-none focus:border-emerald-500 w-full text-white transition-colors" placeholder="Dept" value={row.dept} onChange={e => updateRow(i, 'dept', e.target.value)} /></td>
                                        <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-slate-700 p-2 text-xs outline-none focus:border-emerald-500 w-full text-white transition-colors" placeholder="Area" value={row.area} onChange={e => updateRow(i, 'area', e.target.value)} /></td>
                                        <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-slate-700 p-2 text-xs outline-none focus:border-emerald-500 w-full text-white transition-colors" placeholder="Scope / Standard clause..." value={row.aspect} onChange={e => updateRow(i, 'aspect', e.target.value)} /></td>
                                        <td className="p-3"><input type="date" className="bg-slate-900 border border-slate-700 p-2 text-xs rounded-lg outline-none focus:border-emerald-500 w-full text-white font-mono" value={row.date} onChange={e => updateRow(i, 'date', e.target.value)} /></td>
                                        <td className="p-3"><input type="time" className="bg-slate-900 border border-slate-700 p-2 text-xs rounded-lg outline-none focus:border-emerald-500 w-full text-white font-mono" value={row.time} onChange={e => updateRow(i, 'time', e.target.value)} /></td>
                                        <td className="p-3 text-center"><button onClick={() => removeRow(i)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* PRINT OVERLAY */}
            <div className="hidden print:block p-10 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                    <div>
                        <div className="text-sm text-gray-500 font-bold mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Formal Record</div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Internal Audit Schedule & Matrix</h1>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-bold font-mono">Ref ID: {plan.docId || 'DRAFT'}</p>
                        <p className="text-sm font-bold uppercase mt-1">Date Printed: {new Date().toLocaleDateString()}</p>
                    </div>
                </div>

                <div className="mb-8 border border-black p-6 bg-gray-50">
                    <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. General Information</h2>
                    <table className="w-full text-sm border-none">
                        <tbody>
                            <tr>
                                <td className="w-[15%] font-bold py-2 border-b border-gray-300">Target Site:</td><td className="w-[35%] py-2 border-b border-gray-300 text-lg font-bold">{plan.siteId || 'N/A'}</td>
                                <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Lead Auditor:</td><td className="w-[35%] py-2 border-b border-gray-300">{plan.leadAuditor || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td className="w-[15%] font-bold py-2 border-b border-gray-300">Standard:</td><td className="w-[35%] py-2 border-b border-gray-300">{plan.standard}</td>
                                <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Date Range:</td><td className="w-[35%] py-2 border-b border-gray-300 font-mono font-bold">{plan.startDate} to {plan.endDate}</td>
                            </tr>
                            <tr>
                                <td className="w-[15%] font-bold py-2 border-none">Audit Team:</td><td colSpan="3" className="py-2 border-none">{plan.team.join(', ') || 'None assigned'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="page-break-inside-avoid">
                    <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Execution Matrix</h2>
                    <table className="w-full text-[11px] border-collapse border border-black">
                        <thead>
                            <tr className="bg-gray-200">
                                <th className="border border-black p-2 text-left w-[15%]">Auditor</th>
                                <th className="border border-black p-2 text-left w-[15%]">Auditee</th>
                                <th className="border border-black p-2 text-left w-[15%]">Department</th>
                                <th className="border border-black p-2 text-left w-[15%]">Area</th>
                                <th className="border border-black p-2 text-left w-[20%]">Aspect / Process</th>
                                <th className="border border-black p-2 text-center w-[10%]">Date</th>
                                <th className="border border-black p-2 text-center w-[10%]">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i}>
                                    <td className="border border-black p-2 font-bold">{row.auditor}</td>
                                    <td className="border border-black p-2 font-bold">{row.auditee}</td>
                                    <td className="border border-black p-2">{row.dept}</td>
                                    <td className="border border-black p-2">{row.area}</td>
                                    <td className="border border-black p-2">{row.aspect}</td>
                                    <td className="border border-black p-2 text-center font-mono">{row.date}</td>
                                    <td className="border border-black p-2 text-center font-mono">{row.time}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <table className="w-full border-none mt-24 text-sm page-break-inside-avoid">
                    <tbody>
                        <tr>
                            <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Lead Auditor Signature</td>
                            <td className="w-[10%] border-none"></td>
                            <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Management Rep Signature</td>
                        </tr>
                    </tbody>
                </table>
                <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
            </div>
        </div>
    );
};

// ============================================================================
// MODULE 2: AUDITOR WORKPLACE
// ============================================================================
const AuditorWorkplace = ({ setView, session }) => {
    const [workplaceView, setWorkplaceView] = useState('list');
    const [myTasks, setMyTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ date: '', auditor: '', auditee: '', id: '' });

    const [currentTask, setCurrentTask] = useState(null);
    const [findings, setFindings] = useState([]);
    const [docId, setDocId] = useState('');
    const [criteria, setCriteria] = useState('');

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const val = await readOrgChildren(rtdb, session.orgId, ['auditFindings', 'auditPlans']);
                let findingsList = [];
                if (val.auditFindings) {
                    const rawFindings = safeArrayParse(val.auditFindings);
                    rawFindings.forEach(v => {
                        if (v.auditor === session.user || session.role === 'Owner') {
                            findingsList.push({ ...(v.taskDetails || {}), status: v.status, findingRecord: v, _key: `${v.taskDetails?.planId}_${v.taskDetails?.area}_${v.taskDetails?.auditee}` });
                        }
                    });
                }

                let plannedList = [];
                if (val.auditPlans) {
                    const rawPlans = safeArrayParse(val.auditPlans);
                    rawPlans.forEach(plan => {
                        const matrix = Array.isArray(plan.matrix) ? plan.matrix : [];
                        matrix.forEach(row => {
                            if (row.auditor === session.user || session.role === 'Owner') {
                                const uniqueKey = `${plan.docId}_${row.area}_${row.auditee}`;
                                if (!findingsList.some(f => f._key === uniqueKey)) {
                                    plannedList.push({ auditor: row.auditor || '', auditee: row.auditee || '', dept: row.dept || '', area: row.area || '', date: row.date || '', time: row.time || '', aspect: row.aspect || row.aspects || '', planId: plan.docId || '', siteId: plan.siteId || '', leadAuditor: plan.leadAuditor || '', standard: plan.standard || '', scope: plan.scope || 'OH&S Management System', status: 'Planned', findingRecord: null, _key: uniqueKey });
                                }
                            }
                        });
                    });
                }
                setMyTasks([...findingsList, ...plannedList]);
            } catch (e) {
                console.error("Load Error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [session.orgId, session.user, session.role]);

    const filteredTasks = useMemo(() => {
        return myTasks.filter(t => {
            const matchDate = !filters.date || (t.date && t.date.includes(filters.date));
            const matchAuditor = !filters.auditor || (t.auditor && t.auditor.toLowerCase().includes(filters.auditor.toLowerCase()));
            const matchAuditee = !filters.auditee || (t.auditee && t.auditee.toLowerCase().includes(filters.auditee.toLowerCase()));
            const matchId = !filters.id || (t.findingRecord?.docId && t.findingRecord.docId.toLowerCase().includes(filters.id.toLowerCase())) || (t.findingRecord?.findings && t.findingRecord.findings.some(f => f.id && f.id.toLowerCase().includes(filters.id.toLowerCase())));
            return matchDate && matchAuditor && matchAuditee && matchId;
        });
    }, [myTasks, filters]);

    useEffect(() => {
        if (currentTask && !currentTask.findingRecord) {
            const seq = Math.floor(10000 + Math.random() * 90000);
            setDocId(`${session.orgId}-${currentTask.siteId || 'GEN'}-IAF-${seq}`);
        } else if (currentTask && currentTask.findingRecord) {
            setDocId(currentTask.findingRecord.docId);
        }
    }, [currentTask, session.orgId]);

    const generateID = () => `AF-${Math.floor(10000 + Math.random() * 90000)}`;

    const handleCardClick = (task) => {
        setCurrentTask(task);
        setCriteria(task.standard || '');

        if (task.status === 'Planned') {
            setFindings([{ id: generateID(), type: 'Observation', desc: '', clause: '', evidence: '', fileName: '' }]);
            setWorkplaceView('perform');
        } else {
            setFindings(task.findingRecord?.findings || []);
            setCriteria(task.findingRecord?.taskDetails?.criteria || task.standard || '');

            if (task.status === 'Reported' || task.status === 'Closed') {
                setWorkplaceView('readOnly');
            } else if (task.status === 'Submitted for Verification') {
                setWorkplaceView('verify');
            }
        }
    };

    const addRow = () => setFindings([...findings, { id: generateID(), type: 'Observation', desc: '', clause: '', evidence: '', fileName: '' }]);
    const removeRow = (i) => setFindings(findings.filter((_, idx) => idx !== i));
    const updateRow = (i, f, v) => { const u = [...findings]; u[i][f] = v; setFindings(u); };
    const handleFile = (i, f) => {
        if (!f) return;
        const r = new FileReader(); r.readAsDataURL(f);
        r.onload = () => { const u = [...findings]; u[i].evidence = r.result; u[i].fileName = f.name; setFindings(u); };
    };

    const handleSave = async () => {
        if (findings.some(f => !f.desc)) return alert("Please fill description for all findings.");

        const cleanTask = { ...currentTask, criteria: criteria || '' };

        const cleanFindings = findings.map((f, index) => {
            let days = 30;
            if (f.type === 'Minor NC') days = 15;
            if (f.type === 'Major NC') days = 7;

            const assignDate = new Date();
            const dueDate = new Date();
            dueDate.setDate(assignDate.getDate() + days);

            return {
                ...f,
                id: f.id || generateID() + index,
                auditeeDueDate: dueDate.toISOString().split('T')[0]
            };
        });

        const payload = { docId: docId || '', taskDetails: cleanTask, findings: cleanFindings, status: 'Reported', auditDate: new Date().toISOString(), auditor: session.user || '', siteId: cleanTask.siteId || 'GEN' };

        try {
            await push(ref(rtdb, `organizations/${session.orgId}/auditFindings`), payload);
            alert("Audit Saved & Sent to Auditee.");
            setView('hub');
        } catch (e) { alert("Error saving: " + e.message); }
    };

    const handleVerifyClose = async () => {
        if (!currentTask.findingRecord) return;
        try {
            await update(ref(rtdb, `organizations/${session.orgId}/auditFindings/${currentTask.findingRecord.firebaseKey}`), { status: 'Closed', closureDate: new Date().toISOString() });
            alert("Audit Verified & Closed!");
            setView('hub');
        } catch (e) { alert("Error closing: " + e.message); }
    };

    if (loading) return <div className="flex h-full items-center justify-center text-white"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mr-4"></div>Loading Workplace...</div>;

    const currentAuditRecord = currentTask?.findingRecord || null;

    const renderPrintView = (data) => (
        <div className="hidden print:block p-10 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                <div>
                    <div className="text-sm text-gray-500 font-bold mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Formal Record</div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Internal Audit Report</h1>
                    <p className="mt-2 text-sm">{data.taskDetails?.scope || currentTask?.scope || 'OH&S Management System'}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold font-mono">Ref ID: {data.docId || docId}</p>
                    <p className="text-sm font-bold uppercase mt-1">Audit Date: {(data.auditDate || new Date().toISOString()).split('T')[0]}</p>
                </div>
            </div>

            <div className="mb-8 border border-black p-6 bg-gray-50">
                <table className="w-full text-sm border-none">
                    <tbody>
                        <tr>
                            <td className="w-[15%] font-bold py-2 border-b border-gray-300">Site:</td><td className="w-[35%] py-2 border-b border-gray-300">{data.taskDetails?.siteId || currentTask?.siteId}</td>
                            <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Standard:</td><td className="w-[35%] py-2 border-b border-gray-300">{data.taskDetails?.standard || currentTask?.standard}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] font-bold py-2 border-b border-gray-300">Auditor:</td><td className="w-[35%] py-2 border-b border-gray-300 font-bold">{data.taskDetails?.auditor || currentTask?.auditor}</td>
                            <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Lead Auditor:</td><td className="w-[35%] py-2 border-b border-gray-300">{data.taskDetails?.leadAuditor || currentTask?.leadAuditor}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] font-bold py-2 border-none">Auditee:</td><td className="w-[35%] py-2 border-none font-bold">{data.taskDetails?.auditee || currentTask?.auditee}</td>
                            <td className="w-[15%] font-bold py-2 border-none pl-4">Dept / Area:</td><td className="w-[35%] py-2 border-none">{data.taskDetails?.dept || currentTask?.dept} / {data.taskDetails?.area || currentTask?.area}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="page-break-inside-avoid">
                <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Findings Summary</h2>
                <table className="w-full text-sm border-collapse border border-black mb-8">
                    <thead>
                        <tr className="bg-gray-200">
                            <th className="border border-black p-3 text-center w-[10%]">ID</th>
                            <th className="border border-black p-3 text-center w-[15%]">Type</th>
                            <th className="border border-black p-3 text-center w-[10%]">Clause</th>
                            <th className="border border-black p-3 text-left">Description of Finding</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data.findings || findings || []).map((f, i) => (
                            <tr key={i}>
                                <td className="border border-black p-3 text-center font-mono font-bold">{f.id}</td>
                                <td className="border border-black p-3 text-center font-bold">{f.type}</td>
                                <td className="border border-black p-3 text-center">{f.clause}</td>
                                <td className="border border-black p-3">{f.desc}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Corrective Action Report (CAR)</h2>
            {(data.findings || findings || []).map((f, i) => (
                <div key={i} className="mb-6 border border-black p-5 page-break-inside-avoid">
                    <div className="flex justify-between border-b border-gray-300 pb-2 mb-3">
                        <span className="font-bold">Finding {f.id}</span>
                        <span className="font-bold border border-black px-2 py-0.5 uppercase text-xs">{f.type}</span>
                    </div>
                    <div className="italic mb-4 text-sm text-gray-700">"{f.desc}"</div>
                    {f.response && f.response.status === 'Completed' ? (
                        <div className="text-sm bg-gray-50 p-4 border border-gray-300">
                            <div className="mb-3"><strong>Root Cause Analysis:</strong><br />{f.response.rootCause}</div>
                            <div className="mb-3"><strong>Immediate Correction:</strong><br />{f.response.correction}</div>
                            <div className="mb-4"><strong>Corrective Action (CAPA):</strong><br />{f.response.capa}</div>
                            <div className="flex justify-between border-t border-gray-300 pt-3 text-xs">
                                <div><strong>Owner:</strong> {f.response.owner}</div>
                                <div><strong>Target Date:</strong> {f.response.targetDate}</div>
                                <div><strong>Evidence:</strong> {f.response.evidenceFileName || 'Not Provided'}</div>
                            </div>
                        </div>
                    ) : <div className="text-red-600 font-bold italic text-sm">No corrective action submitted yet.</div>}
                </div>
            ))}

            <table className="w-full border-none mt-24 text-sm page-break-inside-avoid">
                <tbody>
                    <tr>
                        <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Auditor Signature</td>
                        <td className="w-[10%] border-none"></td>
                        <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Auditee Signature</td>
                    </tr>
                </tbody>
            </table>
            <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
        </div>
    );

    return (
        <div className="flex flex-col h-screen animate-in fade-in duration-300 relative">
            <div className="flex justify-between items-center mb-6 print:hidden">
                <div>
                    <h2 className="text-2xl font-bold text-emerald-400"><i className="fas fa-clipboard-list mr-2"></i> Auditor Workplace</h2>
                    <p className="text-slate-400 text-sm">Execute your assigned audits and raise findings.</p>
                </div>
                <button onClick={() => setView('hub')} className="text-slate-400 hover:text-white bg-slate-900 w-10 h-10 rounded-xl flex items-center justify-center transition-colors border border-slate-800 shadow-lg"><i className="fas fa-times text-xl"></i></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll pb-20 print:hidden">
                {workplaceView === 'list' && (
                    <div className="max-w-7xl mx-auto">
                        <div className="flex flex-wrap justify-between items-center mb-6 gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-700 shadow-xl">
                            <div className="flex gap-3 w-full md:w-auto">
                                <input type="date" className="bg-slate-950 text-xs w-36 border border-slate-800 outline-none focus:border-emerald-500 rounded-lg px-3 py-2 text-slate-300" value={filters.date} onChange={e => setFilters({ ...filters, date: e.target.value })} />
                                <input type="text" placeholder="Auditor Name" className="bg-slate-950 text-xs w-36 border border-slate-800 outline-none focus:border-emerald-500 rounded-lg px-3 py-2 text-white" value={filters.auditor} onChange={e => setFilters({ ...filters, auditor: e.target.value })} />
                                <input type="text" placeholder="Auditee Name" className="bg-slate-950 text-xs w-36 border border-slate-800 outline-none focus:border-emerald-500 rounded-lg px-3 py-2 text-white" value={filters.auditee} onChange={e => setFilters({ ...filters, auditee: e.target.value })} />
                                <input type="text" placeholder="Doc ID" className="bg-slate-950 text-xs w-28 border border-slate-800 outline-none focus:border-emerald-500 rounded-lg px-3 py-2 text-white" value={filters.id} onChange={e => setFilters({ ...filters, id: e.target.value })} />
                                <button onClick={() => setFilters({ date: '', auditor: '', auditee: '', id: '' })} className="text-xs text-slate-400 hover:text-white px-3 transition-colors bg-slate-800 rounded-lg border border-slate-700 font-bold uppercase tracking-wider"><i className="fas fa-undo mr-1"></i> Reset</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredTasks.length === 0 ? <div className="col-span-full text-center text-slate-500 py-16 bg-slate-900/40 rounded-3xl border-2 border-dashed border-slate-800 text-lg italic">No audits found matching your criteria.</div> :
                                filteredTasks.map((task, i) => {
                                    const isEnabled = task.status === 'Planned' || task.status === 'Submitted for Verification' || task.status === 'Reported' || task.status === 'Closed';

                                    let statusStyles = '';
                                    let statusText = '';
                                    if (task.status === 'Planned') { statusStyles = 'border-blue-500 from-blue-900/20'; statusText = 'Needs Audit'; }
                                    else if (task.status === 'Reported') { statusStyles = 'border-red-500 from-red-900/20'; statusText = 'Correction Pending'; }
                                    else if (task.status === 'Submitted for Verification') { statusStyles = 'border-orange-500 from-orange-900/20'; statusText = 'Verification Ready'; }
                                    else { statusStyles = 'border-emerald-500 from-emerald-900/20'; statusText = 'Closed'; }

                                    return (
                                        <div key={i} onClick={() => isEnabled && handleCardClick(task)} className={`glass-panel p-6 rounded-3xl relative border-t-4 bg-gradient-to-b to-slate-900/40 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all ${statusStyles} ${isEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded shadow-sm border ${task.status === 'Planned' ? 'bg-blue-900/40 text-blue-400 border-blue-500/30' : task.status === 'Reported' ? 'bg-red-900/40 text-red-400 border-red-500/30' : task.status === 'Submitted for Verification' ? 'bg-orange-900/40 text-orange-400 border-orange-500/30' : 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30'}`}>{statusText}</span>
                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800"><i className="far fa-calendar-alt mr-1"></i> {task.date}</span>
                                            </div>
                                            <h3 className="font-bold text-white text-lg mb-1 truncate" title={`${task.dept} - ${task.area}`}>{task.dept} - {task.area}</h3>
                                            <p className="text-xs text-slate-400 mb-6 truncate" title={task.aspect}><i className="fas fa-bullseye text-slate-500 mr-1.5"></i> {task.aspect}</p>

                                            <div className="space-y-2 text-[10px] text-slate-300 font-medium mb-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                                                <div className="flex justify-between"><span>Site:</span><span className="font-bold text-white">{task.siteId}</span></div>
                                                <div className="flex justify-between"><span>Auditor:</span><span className="font-bold text-emerald-400">{task.auditor}</span></div>
                                                <div className="flex justify-between"><span>Auditee:</span><span className="font-bold text-amber-400">{task.auditee}</span></div>
                                            </div>

                                            <div className="pt-3 border-t border-slate-800 text-center">
                                                {task.status === 'Planned' && <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center justify-center gap-2"><i className="fas fa-play"></i> Perform Audit</span>}
                                                {task.status === 'Reported' && <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center justify-center gap-2"><i className="fas fa-hourglass-half"></i> Awaiting Correction</span>}
                                                {task.status === 'Submitted for Verification' && <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest animate-pulse flex items-center justify-center gap-2"><i className="fas fa-check-double"></i> Verify Now</span>}
                                                {task.status === 'Closed' && <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center justify-center gap-2"><i className="fas fa-file-contract"></i> View Record</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* PERFORM AUDIT */}
                {workplaceView === 'perform' && currentTask && (
                    <div className="animate-in slide-in-from-bottom-8 duration-500 max-w-5xl mx-auto">
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={() => setWorkplaceView('list')} className="text-slate-400 hover:text-white transition font-bold text-sm flex items-center gap-2"><i className="fas fa-arrow-left"></i> Back to Audit List</button>
                            <button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/50 transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-paper-plane"></i> Save & Send to Auditee</button>
                        </div>

                        <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-2xl mb-8">
                            <h3 className="text-emerald-400 font-bold uppercase tracking-widest text-xs mb-6 border-b border-slate-700 pb-3 flex items-center gap-2"><i className="fas fa-info-circle"></i> Section 1: Audit Context</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Site</label><div className="font-bold text-white text-sm bg-slate-950 p-2.5 rounded-lg border border-slate-800">{currentTask.siteId}</div></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Auditor</label><div className="font-bold text-white text-sm bg-slate-950 p-2.5 rounded-lg border border-slate-800">{currentTask.auditor}</div></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Auditee</label><div className="font-bold text-amber-400 text-sm bg-slate-950 p-2.5 rounded-lg border border-slate-800">{currentTask.auditee}</div></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Date</label><div className="font-bold text-white text-sm bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono">{currentTask.date}</div></div>
                                <div className="col-span-2 md:col-span-4"><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1 ml-1">Standard / Criteria Applied</label><input value={criteria} onChange={e => setCriteria(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-3 w-full text-sm font-bold text-white outline-none focus:border-emerald-500 shadow-inner transition-colors" placeholder="e.g. ISO 45001:2018 Clause 8.1..." /></div>
                            </div>
                        </div>

                        <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-2xl">
                            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                                <h3 className="text-blue-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2"><i className="fas fa-list-check"></i> Section 2: Audit Findings Register</h3>
                                <button onClick={addRow} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-900/30 transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-plus"></i> Log New Finding</button>
                            </div>

                            <div className="space-y-6">
                                {(findings || []).map((f, i) => (
                                    <div key={i} className="bg-slate-900/60 p-6 rounded-2xl border border-slate-700 relative shadow-inner">
                                        <div className="absolute top-4 right-4 text-[10px] font-bold text-emerald-400 font-mono bg-emerald-900/30 px-3 py-1 rounded-lg border border-emerald-500/30 shadow-sm">{f.id}</div>
                                        <div className="grid grid-cols-12 gap-6 items-start mt-2">
                                            <div className="col-span-12 md:col-span-3">
                                                <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2 ml-1">Finding Type</label>
                                                <select value={f.type} onChange={e => updateRow(i, 'type', e.target.value)} className={`w-full text-xs font-bold rounded-xl p-3 outline-none shadow-sm transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-white/20 ${getTypeClass(f.type)}`}>
                                                    <option value="Observation" className="text-black bg-white">Observation</option>
                                                    <option value="OFI" className="text-black bg-white">Opp. for Improv. (OFI)</option>
                                                    <option value="Minor NC" className="text-black bg-white">Minor Non-Conformance</option>
                                                    <option value="Major NC" className="text-black bg-white">Major Non-Conformance</option>
                                                </select>
                                            </div>
                                            <div className="col-span-12 md:col-span-3">
                                                <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2 ml-1">Ref Clause</label>
                                                <input value={f.clause} onChange={e => updateRow(i, 'clause', e.target.value)} className="bg-slate-950 text-sm font-bold text-white w-full border border-slate-700 rounded-xl p-3 outline-none focus:border-blue-500 shadow-inner transition-colors" placeholder="e.g. 9.1.2" />
                                            </div>
                                            <div className="col-span-12 md:col-span-6">
                                                <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2 ml-1">Objective Evidence Attachment</label>
                                                <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-700 shadow-inner">
                                                    <input type="file" onChange={(e) => handleFile(i, e.target.files[0])} className="text-[10px] text-slate-400 file:bg-slate-800 file:text-slate-300 file:hover:text-white file:border-none file:rounded-lg file:px-4 file:py-1.5 file:font-bold file:cursor-pointer file:transition-colors file:mr-3 w-full" />
                                                </div>
                                                {f.fileName && <div className="text-[10px] text-emerald-400 mt-2 ml-1 font-bold truncate flex items-center gap-1.5"><i className="fas fa-check-circle"></i> Attached: {f.fileName}</div>}
                                            </div>
                                            <div className="col-span-12">
                                                <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2 ml-1">Detailed Description of Finding</label>
                                                <textarea value={f.desc} onChange={e => updateRow(i, 'desc', e.target.value)} className="bg-slate-950 text-sm font-medium text-slate-200 w-full border border-slate-700 rounded-xl p-4 outline-none focus:border-blue-500 resize-none shadow-inner custom-scroll transition-colors leading-relaxed" rows="3" placeholder="Describe the specific observation or non-conformance..."></textarea>
                                            </div>
                                        </div>
                                        <button onClick={() => removeRow(i)} className="absolute bottom-4 right-4 text-slate-500 hover:text-red-400 bg-slate-950 hover:bg-red-900/20 w-10 h-10 rounded-xl transition-colors border border-slate-800 shadow flex items-center justify-center"><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                ))}
                                {findings.length === 0 && <div className="text-center p-12 border-2 border-dashed border-slate-700 rounded-3xl text-slate-500 italic bg-slate-900/30">No findings logged. The audit is completely clean!</div>}
                            </div>
                        </div>
                    </div>
                )}

                {/* VERIFICATION / READONLY VIEW */}
                {(workplaceView === 'readOnly' || workplaceView === 'verify') && currentAuditRecord && (
                    <div className="animate-in slide-in-from-bottom-8 duration-500 max-w-5xl mx-auto">
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={() => setWorkplaceView('list')} className="text-slate-400 hover:text-white transition font-bold text-sm flex items-center gap-2"><i className="fas fa-arrow-left"></i> Back to Audit List</button>
                            <div className="flex gap-3">
                                <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg flex items-center gap-2"><i className="fas fa-print"></i> Print Report</button>
                                {workplaceView === 'verify' && <button onClick={handleVerifyClose} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-orange-900/30 flex items-center gap-2 transition-transform active:scale-95"><i className="fas fa-check-double text-lg"></i> Verify & Close Audit</button>}
                            </div>
                        </div>

                        <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-2xl">
                            <div className="flex justify-between items-start mb-8 border-b border-slate-700 pb-6">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-2">Audit Report Details</h2>
                                    <p className="text-sm text-emerald-400 font-mono font-bold bg-emerald-900/20 px-3 py-1 rounded-lg border border-emerald-500/30 inline-block">Ref: {currentAuditRecord.docId}</p>
                                </div>
                                <div className="text-right bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-inner">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Status</p>
                                    <span className={`text-sm font-bold uppercase tracking-wider ${currentAuditRecord.status === 'Closed' ? 'text-emerald-400' : currentAuditRecord.status === 'Submitted for Verification' ? 'text-orange-400' : 'text-red-400'}`}>{currentAuditRecord.status}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Site</label><span className="text-sm text-white font-bold">{currentAuditRecord.taskDetails?.siteId}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Audit Date</label><span className="text-sm text-white font-bold font-mono">{(currentAuditRecord.auditDate || '').split('T')[0]}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Auditor</label><span className="text-sm text-white font-bold">{currentAuditRecord.auditor}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Auditee</label><span className="text-sm text-amber-400 font-bold">{currentAuditRecord.taskDetails?.auditee}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Department</label><span className="text-sm text-white font-bold">{currentAuditRecord.taskDetails?.dept}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Area</label><span className="text-sm text-white font-bold">{currentAuditRecord.taskDetails?.area}</span></div>
                                <div className="col-span-2"><label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Scope / Standard</label><span className="text-sm text-white font-bold">{currentAuditRecord.taskDetails?.scope} / {currentAuditRecord.taskDetails?.criteria || currentAuditRecord.taskDetails?.standard}</span></div>
                            </div>

                            <h3 className="text-blue-400 font-bold uppercase text-xs tracking-widest mb-6 border-b border-slate-700 pb-2 flex items-center gap-2"><i className="fas fa-list-check"></i> Documented Findings ({(currentAuditRecord.findings || []).length})</h3>

                            <div className="space-y-6">
                                {(currentAuditRecord.findings || []).map((f, i) => (
                                    <div key={i} className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                        <div className="flex justify-between items-start mb-4 border-b border-slate-700/50 pb-3">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-mono font-bold text-red-400 bg-red-900/20 px-2.5 py-1 rounded-lg border border-red-500/30">{f.id}</span>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg shadow-sm ${getTypeClass(f.type)}`}>{f.type}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">Clause: <span className="text-white">{f.clause}</span></span>
                                        </div>
                                        <p className="text-sm text-slate-200 mb-6 border-l-4 border-slate-600 pl-4 py-1 leading-relaxed bg-slate-800/30 rounded-r-lg">"{f.desc}"</p>

                                        {f.response && f.response.status === 'Completed' ? (
                                            <div className="mt-2 border border-orange-500/30 bg-orange-900/10 p-5 rounded-xl shadow-inner relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <i className="fas fa-reply text-orange-400"></i>
                                                    <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Auditee Corrective Action Plan</span>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-4">
                                                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                                        <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5">Root Cause Analysis:</span>
                                                        <span className="font-medium text-white">{f.response.rootCause}</span>
                                                    </div>
                                                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                                        <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5">Corrective Action (CAPA):</span>
                                                        <span className="font-medium text-white">{f.response.capa}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-4 border-t border-slate-700/50 bg-slate-900/50 -mx-5 -mb-5 px-5 py-4">
                                                    {f.response.evidenceFileName ? <a href={f.response.evidenceFile} download={f.response.evidenceFileName} className="text-xs font-bold bg-emerald-900/30 text-emerald-400 px-4 py-2 rounded-lg border border-emerald-500/50 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-2 shadow-sm"><i className="fas fa-download"></i> View Evidence</a> : <span className="text-xs text-slate-500 italic bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">No Evidence Provided</span>}
                                                    <div className="text-right flex items-center gap-6">
                                                        <div><span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-0.5">CAPA Owner</span><span className="text-white font-bold text-xs">{f.response.owner}</span></div>
                                                        <div><span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-0.5">Target Date</span><span className="font-mono text-white text-xs bg-slate-950 px-2 py-1 rounded border border-slate-800">{f.response.targetDate}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : <div className="text-xs text-slate-500 italic bg-slate-950 p-4 rounded-xl text-center border border-dashed border-slate-700">No response submitted by auditee yet.</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {renderPrintView(currentTask?.findingRecord || {})}
            </div>
        </div>
    );
};

// ============================================================================
// MODULE 3: AUDITEE WORKPLACE
// ============================================================================
const AuditeeWorkplace = ({ setView, session }) => {
    const [myAudits, setMyAudits] = useState([]);
    const [users, setUsers] = useState([]);
    const [selectedAudit, setSelectedAudit] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ date: '', auditor: '', auditee: '', id: '' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentFinding, setCurrentFinding] = useState(null);
    const [responseForm, setResponseForm] = useState({ rootCause: '', correction: '', capa: '', owner: '', targetDate: '', evidenceFile: null, evidenceFileName: '' });

    const myName = session?.name || session?.email || session?.user || 'Me';

    useEffect(() => {
        const load = async () => {
            try {
                const val = await readOrgChildren(rtdb, session.orgId, ['auditFindings', 'users']);
                if (val.auditFindings) {
                    const rawData = safeArrayParse(val.auditFindings);
                    const mine = rawData.filter(f => f.taskDetails && f.taskDetails.auditee === session.user);
                    setMyAudits(mine);
                }
                if (val.users) {
                    const parsedUsers = safeArrayParse(val.users).filter(u => canAuthenticateStatus(u.status));
                    setUsers(parsedUsers);
                }
            } catch (e) {
                console.error("Load Error:", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [session.orgId, session.user]);

    const filteredAudits = useMemo(() => {
        return myAudits.filter(a => {
            const matchDate = !filters.date || (a.auditDate && a.auditDate.includes(filters.date));
            const matchAuditor = !filters.auditor || (a.auditor && a.auditor.toLowerCase().includes(filters.auditor.toLowerCase()));
            const matchId = !filters.id || (a.docId && a.docId.toLowerCase().includes(filters.id.toLowerCase()));
            return matchDate && matchAuditor && matchId;
        });
    }, [myAudits, filters]);

    const openResponseModal = (finding) => {
        setCurrentFinding(finding);
        setResponseForm({
            rootCause: finding.response?.rootCause || '',
            correction: finding.response?.correction || '',
            capa: finding.response?.capa || '',
            owner: finding.response?.owner || '',
            targetDate: finding.response?.targetDate || finding.auditeeDueDate || new Date().toISOString().split('T')[0],
            evidenceFile: finding.response?.evidenceFile || null,
            evidenceFileName: finding.response?.evidenceFileName || ''
        });
        setIsModalOpen(true);
    };

    const handleFile = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const base64 = await fileToBase64(file);
            setResponseForm({ ...responseForm, evidenceFile: base64, evidenceFileName: file.name });
        }
    };

    const saveFindingResponse = () => {
        if (!responseForm.rootCause || !responseForm.correction || !responseForm.capa || !responseForm.owner || !responseForm.targetDate) return alert("Please fill all required fields, including CAPA Owner and Date.");
        const updatedFindings = (selectedAudit.findings || []).map(f => {
            if (f.id === currentFinding.id) return { ...f, response: { ...responseForm, status: 'Completed', capaStatus: 'Open' } };
            return f;
        });
        setSelectedAudit({ ...selectedAudit, findings: updatedFindings });
        setIsModalOpen(false);
    };

    const submitAuditToAuditor = async () => {
        const allDone = (selectedAudit.findings || []).every(f => f.response && f.response.status === 'Completed');
        if (!allDone) return alert("Please provide a response for ALL findings before submitting.");

        const updatedRecord = { ...selectedAudit, status: 'Submitted for Verification', submissionDate: new Date().toISOString() };
        try {
            await update(ref(rtdb, `organizations/${session.orgId}/auditFindings/${selectedAudit.firebaseKey}`), updatedRecord);
            alert("Audit Response Submitted Successfully!");
            setMyAudits(myAudits.map(a => a.firebaseKey === selectedAudit.firebaseKey ? updatedRecord : a));
            setSelectedAudit(updatedRecord);
        } catch (e) {
            alert("Submission failed: " + e.message);
        }
    };

    if (loading) return <div className="flex h-full items-center justify-center text-white"><div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mr-4"></div> Loading Auditee View...</div>;

    const isEditable = selectedAudit && selectedAudit.status === 'Reported';

    return (
        <div className="flex flex-col h-screen animate-in fade-in duration-300 relative print:hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-amber-400"><i className="fas fa-user-edit mr-2"></i> Auditee Workplace</h2>
                    <p className="text-slate-400 text-sm">Respond to findings and submit corrective actions.</p>
                </div>
                <button onClick={() => setView('hub')} className="text-slate-400 hover:text-white bg-slate-900 w-10 h-10 rounded-xl flex items-center justify-center transition-colors border border-slate-800 shadow-lg"><i className="fas fa-times text-xl"></i></button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-6 pb-20">
                {/* LEFT LIST */}
                <div className="w-full md:w-1/3 bg-slate-900/60 border border-slate-700 rounded-3xl flex flex-col shadow-2xl overflow-hidden backdrop-blur-md">
                    <div className="p-5 border-b border-slate-700 bg-slate-800/80">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-bold text-white uppercase text-xs tracking-widest flex items-center gap-2"><i className="fas fa-inbox text-amber-400"></i> Action Inbox <span className="bg-amber-500 text-slate-900 px-2 py-0.5 rounded-full text-[10px] ml-1">{filteredAudits.length}</span></h2>
                            <button onClick={() => setFilters({ date: '', auditor: '', auditee: '', id: '' })} className="text-[10px] text-slate-400 hover:text-white transition uppercase font-bold tracking-widest bg-slate-950 px-2 py-1 rounded-lg border border-slate-700"><i className="fas fa-undo mr-1"></i> Clear</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="date" className="bg-slate-950 text-xs p-2.5 rounded-xl border border-slate-700 outline-none focus:border-amber-500 text-slate-300 font-mono shadow-inner" value={filters.date} onChange={e => setFilters({ ...filters, date: e.target.value })} />
                            <input type="text" placeholder="Search ID..." className="bg-slate-950 text-xs p-2.5 rounded-xl border border-slate-700 outline-none focus:border-amber-500 text-white shadow-inner" value={filters.id} onChange={e => setFilters({ ...filters, id: e.target.value })} />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-4 custom-scroll space-y-3">
                        {filteredAudits.length === 0 && <div className="text-slate-500 text-center text-sm mt-10 p-6 border-2 border-dashed border-slate-700 rounded-2xl mx-2 bg-slate-900/50 italic">No pending audits found in your inbox.</div>}
                        {filteredAudits.map(audit => {
                            const statusColor = audit.status === 'Reported' ? 'border-red-500 bg-gradient-to-r from-red-900/20 to-slate-900/40' : audit.status === 'Submitted for Verification' ? 'border-orange-500 bg-gradient-to-r from-orange-900/20 to-slate-900/40' : 'border-emerald-500 bg-gradient-to-r from-emerald-900/20 to-slate-900/40';
                            const statusText = audit.status === 'Reported' ? 'Action Required' : audit.status === 'Submitted for Verification' ? 'Pending Approval' : 'Closed';
                            return (
                                <div key={audit.firebaseKey} onClick={() => setSelectedAudit(audit)} className={`p-5 rounded-2xl border-l-4 border-y border-r border-y-slate-700 border-r-slate-700 transition-all cursor-pointer hover:shadow-lg ${statusColor} ${selectedAudit?.firebaseKey === audit.firebaseKey ? 'ring-2 ring-amber-500/50 shadow-xl scale-[1.02]' : 'hover:bg-slate-800/80'}`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">{audit.docId}</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded shadow-sm border ${audit.status === 'Reported' ? 'bg-red-900/50 text-red-300 border-red-500/50' : audit.status === 'Submitted for Verification' ? 'bg-orange-900/50 text-orange-300 border-orange-500/50' : 'bg-emerald-900/50 text-emerald-300 border-emerald-500/50'}`}>{statusText}</span>
                                    </div>
                                    <h3 className="font-bold text-white text-base mb-1 truncate" title={`${audit.taskDetails?.dept} - ${audit.taskDetails?.area}`}>{audit.taskDetails?.dept} - {audit.taskDetails?.area}</h3>
                                    <div className="flex justify-between items-center text-xs mt-4 border-t border-slate-700/50 pt-3">
                                        <span className="text-slate-400 font-bold bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800"><i className="fas fa-list-ul text-blue-400 mr-1.5"></i> {audit.findings?.length || 0} Findings</span>
                                        <span className="text-slate-500 font-mono"><i className="far fa-calendar-alt mr-1"></i> {(audit.auditDate || '').split('T')[0]}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT DETAILS */}
                <div className="w-full md:w-2/3 glass-panel rounded-3xl border border-slate-700 shadow-2xl flex flex-col h-full overflow-hidden bg-slate-900/40">
                    {!selectedAudit ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/20">
                            <div className="w-24 h-24 rounded-3xl bg-slate-800/50 flex items-center justify-center text-amber-500 text-4xl mb-6 shadow-inner border border-slate-700/50"><i className="fas fa-file-signature"></i></div>
                            <p className="text-lg font-bold text-white mb-2">No Audit Selected</p>
                            <p className="text-sm">Select an assignment from your inbox to view findings and respond.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full animate-in fade-in duration-300">
                            <div className="p-8 border-b border-slate-700 bg-slate-900/80 backdrop-blur-md flex-shrink-0">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-3xl font-bold text-white mb-2">Audit Findings</h2>
                                        <p className="text-sm font-mono text-amber-400 font-bold bg-amber-900/20 px-3 py-1 rounded-lg border border-amber-500/30 inline-block">Ref: {selectedAudit.docId}</p>
                                    </div>
                                    <div className="text-right bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1">Auditor Details</p>
                                        <p className="text-sm font-bold text-white mb-1"><i className="fas fa-user-tie text-blue-400 mr-2"></i>{selectedAudit.auditor}</p>
                                        <p className="text-xs text-slate-400 font-mono"><i className="far fa-calendar-alt text-slate-500 mr-2"></i>{(selectedAudit.auditDate || new Date().toISOString()).split('T')[0]}</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="bg-slate-800 px-4 py-2 rounded-xl text-xs border border-slate-700 shadow-inner"><span className="text-slate-400 uppercase font-bold tracking-widest mr-2">Site:</span><span className="text-white font-bold">{selectedAudit.taskDetails?.siteId}</span></div>
                                    <div className="bg-slate-800 px-4 py-2 rounded-xl text-xs border border-slate-700 shadow-inner"><span className="text-slate-400 uppercase font-bold tracking-widest mr-2">Dept/Area:</span><span className="text-white font-bold">{selectedAudit.taskDetails?.dept} / {selectedAudit.taskDetails?.area}</span></div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 custom-scroll bg-slate-900/20 space-y-6">
                                {(selectedAudit.findings || []).map((f, i) => {
                                    const hasResponse = f.response && f.response.status === 'Completed';
                                    const isOverdue = !hasResponse && new Date() > new Date(f.auditeeDueDate);
                                    return (
                                        <div key={i} className={`bg-slate-900/90 p-6 rounded-2xl border transition-colors shadow-xl ${hasResponse ? 'border-emerald-500/50' : 'border-slate-700'}`}>
                                            <div className="flex justify-between items-start mb-4 border-b border-slate-800 pb-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-mono font-bold text-red-400 bg-red-900/20 px-3 py-1 rounded-lg border border-red-500/30">{f.id}</span>
                                                    <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg shadow-sm ${getTypeClass(f.type)}`}>{f.type}</span>
                                                    {f.auditeeDueDate && !hasResponse && <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg border ${isOverdue ? 'bg-red-900/40 text-red-400 border-red-500/50 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'bg-orange-900/30 text-orange-400 border-orange-500/30'}`}>Due: {f.auditeeDueDate} {isOverdue && '!'}</span>}
                                                </div>
                                                {isEditable && (
                                                    <button onClick={() => openResponseModal(f)} className={`text-xs px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest transition-transform active:scale-95 shadow-lg flex items-center gap-2 ${hasResponse ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:bg-slate-700' : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white'}`}>
                                                        {hasResponse ? <><i className="fas fa-edit"></i> Edit Reply</> : <><i className="fas fa-reply"></i> Respond Now</>}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="mb-4 text-sm font-medium text-slate-200 border-l-4 border-slate-600 pl-4 py-1 leading-relaxed bg-slate-800/30 rounded-r-lg">"{f.desc}"</div>

                                            {hasResponse && (
                                                <div className="mt-6 pt-5 border-t border-slate-700">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <i className="fas fa-check-circle text-emerald-500 text-lg"></i>
                                                        <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Corrective Action Plan Logged</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                                                            <b className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1.5">Root Cause Analysis:</b>
                                                            <span className="text-sm text-white">{f.response.rootCause}</span>
                                                        </div>
                                                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner">
                                                            <b className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1.5">Corrective Action (CAPA):</b>
                                                            <span className="text-sm text-white">{f.response.capa}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800">
                                                        {f.response.evidenceFileName ? <a href={f.response.evidenceFile} download={f.response.evidenceFileName} className="text-[10px] font-bold uppercase tracking-widest bg-emerald-900/30 text-emerald-400 px-4 py-2.5 rounded-lg border border-emerald-900 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-2 shadow-sm"><i className="fas fa-download text-sm"></i> Download Evidence</a> : <span className="text-xs text-slate-500 italic bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">No Evidence Uploaded</span>}
                                                        <div className="text-right flex items-center gap-6">
                                                            <div><span className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-0.5">CAPA Owner</span> <span className="text-white font-bold text-sm">{f.response.owner}</span></div>
                                                            <div><span className="block text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-0.5">Target Date</span> <span className="font-mono text-white text-sm bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700 shadow-inner">{f.response.targetDate}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="p-6 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md flex-shrink-0 flex justify-end">
                                {isEditable ? (
                                    <button onClick={submitAuditToAuditor} className={`font-bold py-3.5 px-10 rounded-xl shadow-lg flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest ${(selectedAudit.findings || []).every(f => f.response?.status === 'Completed') ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'}`}>
                                        <i className="fas fa-paper-plane text-lg"></i> Submit Responses to Auditor
                                    </button>
                                ) : (
                                    <span className={`px-8 py-3.5 rounded-xl text-sm font-bold uppercase tracking-widest shadow-inner border flex items-center gap-2 ${selectedAudit.status === 'Closed' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-orange-400 border-orange-500/30'}`}>
                                        {selectedAudit.status === 'Closed' ? <i className="fas fa-lock"></i> : <i className="fas fa-lock-open"></i>}
                                        Status: {selectedAudit.status}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL */}
            {isModalOpen && currentFinding && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in-95 duration-300 print:hidden">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-3xl p-8 shadow-2xl relative flex flex-col max-h-[95vh] overflow-hidden">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-600/10 rounded-full blur-[80px] pointer-events-none"></div>

                        <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4 relative z-10 flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-bold text-amber-400 flex items-center gap-3"><i className="fas fa-reply"></i> Submit Corrective Action</h2>
                                <p className="text-xs text-slate-400 font-mono mt-1">Finding ID: <span className="text-white font-bold">{currentFinding.id}</span></p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-lg"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 relative z-10 space-y-6">
                            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-inner">
                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2">Auditor's Finding Description</span>
                                <p className="text-sm font-medium text-slate-200 border-l-4 border-amber-500/50 pl-4 py-1 leading-relaxed">"{currentFinding.desc}"</p>
                            </div>

                            <div className="space-y-5 bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-2 ml-1">1. Root Cause Analysis</label>
                                    <textarea rows="3" className="bg-slate-950 border border-slate-800 text-white w-full p-4 rounded-xl text-sm outline-none focus:border-amber-500 shadow-inner transition-colors resize-none custom-scroll" value={responseForm.rootCause} onChange={e => setResponseForm({ ...responseForm, rootCause: e.target.value })} placeholder="Investigate and explain why this issue occurred..."></textarea>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-2 ml-1">2. Immediate Correction</label>
                                    <input className="bg-slate-950 border border-slate-800 text-white w-full p-3.5 rounded-xl text-sm outline-none focus:border-amber-500 shadow-inner transition-colors" value={responseForm.correction} onChange={e => setResponseForm({ ...responseForm, correction: e.target.value })} placeholder="What was done immediately to fix the issue?" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-2 ml-1">3. Corrective / Preventive Action (CAPA)</label>
                                    <textarea rows="2" className="bg-slate-950 border border-slate-800 text-white w-full p-4 rounded-xl text-sm outline-none focus:border-amber-500 shadow-inner transition-colors resize-none custom-scroll" value={responseForm.capa} onChange={e => setResponseForm({ ...responseForm, capa: e.target.value })} placeholder="What long-term action will be taken to prevent recurrence?"></textarea>
                                </div>

                                <div className="grid grid-cols-2 gap-6 pt-2">
                                    <div>
                                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-2 ml-1">4. CAPA Owner</label>
                                        <select className="bg-slate-950 border border-slate-800 text-white w-full p-3.5 rounded-xl text-sm outline-none focus:border-amber-500 shadow-inner transition-colors font-bold" value={responseForm.owner} onChange={e => setResponseForm({ ...responseForm, owner: e.target.value })}>
                                            <option value="">Select Assignee...</option>
                                            <option value={myName} className="bg-slate-800 text-amber-400 font-bold">➡️ Assign to Me</option>
                                            {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-2 ml-1">5. Target Closure Date</label>
                                        <input type="date" className="bg-slate-950 border border-slate-800 text-white w-full p-3.5 rounded-xl text-sm outline-none focus:border-amber-500 shadow-inner transition-colors font-mono" value={responseForm.targetDate} onChange={e => setResponseForm({ ...responseForm, targetDate: e.target.value })} />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-800">
                                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-3 ml-1">6. Objective Evidence Upload (Optional)</label>
                                    <div className="flex items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800 shadow-inner">
                                        <input type="file" className="text-xs font-bold text-slate-400 file:bg-amber-600 file:hover:bg-amber-500 file:text-white file:border-none file:rounded-lg file:px-4 file:py-2 file:cursor-pointer file:transition-colors file:mr-4 transition-colors" onChange={handleFile} />
                                        {responseForm.evidenceFileName && <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest truncate bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-900 flex items-center gap-2"><i className="fas fa-check-circle"></i> {responseForm.evidenceFileName}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end gap-4 pt-6 border-t border-slate-800 relative z-10 flex-shrink-0">
                            <button onClick={() => setIsModalOpen(false)} className="px-8 py-3.5 rounded-xl text-white font-bold text-sm uppercase tracking-widest bg-slate-800 hover:bg-slate-700 transition-colors shadow-lg">Cancel</button>
                            <button onClick={saveFindingResponse} className="bg-amber-600 hover:bg-amber-500 px-10 py-3.5 rounded-xl text-white font-bold text-sm shadow-lg shadow-amber-900/30 transition-transform active:scale-95 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-save"></i> Save Response</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MODULE 4: AUDIT REPORTS
// ============================================================================
const AuditReports = ({ setView, session }) => {
    const [reports, setReports] = useState([]);
    const [plans, setPlans] = useState([]);
    const [reportView, setReportView] = useState('findings');
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ search: '', status: '', dept: '' });
    const [printData, setPrintData] = useState(null);
    const [printPlanData, setPrintPlanData] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const val = await readOrgChildren(rtdb, session.orgId, ['auditFindings', 'auditPlans']);

                if (val.auditFindings) {
                    const rawData = safeArrayParse(val.auditFindings);
                    rawData.sort((a, b) => new Date(b.auditDate || 0) - new Date(a.auditDate || 0));
                    setReports(rawData);
                }
                if (val.auditPlans) {
                    const rawPlans = safeArrayParse(val.auditPlans);
                    rawPlans.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                    setPlans(rawPlans);
                }
            } catch (e) {
                console.error("Load Error:", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [session.orgId]);

    const filteredReports = useMemo(() => {
        return reports.filter(r => {
            if (!r.taskDetails) return false;
            const matchSearch = (r.docId || '').toLowerCase().includes(filters.search.toLowerCase()) || (r.taskDetails.auditor || '').toLowerCase().includes(filters.search.toLowerCase()) || (r.taskDetails.auditee || '').toLowerCase().includes(filters.search.toLowerCase());
            const matchStatus = !filters.status || r.status === filters.status;
            const matchDept = !filters.dept || (r.taskDetails.dept || '').toLowerCase().includes(filters.dept.toLowerCase());
            return matchSearch && matchStatus && matchDept;
        });
    }, [reports, filters]);

    const filteredPlans = useMemo(() => {
        return plans.filter(p => {
            const matchSearch = (p.docId || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                (p.leadAuditor || '').toLowerCase().includes(filters.search.toLowerCase()) ||
                (p.siteId || '').toLowerCase().includes(filters.search.toLowerCase());
            return matchSearch;
        });
    }, [plans, filters]);

    const handlePrint = (report) => { setPrintPlanData(null); setPrintData(report); setTimeout(() => window.print(), 100); };
    const handlePrintPlan = (plan) => { setPrintData(null); setPrintPlanData(plan); setTimeout(() => window.print(), 100); };

    const getStatusColor = (status) => {
        if (status === 'Closed') return 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50';
        if (status === 'Submitted for Verification') return 'bg-orange-900/30 text-orange-400 border-orange-500/50';
        return 'bg-red-900/30 text-red-400 border-red-500/50';
    };

    if (loading) return <div className="flex h-full items-center justify-center text-white"><div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mr-4"></div> Loading Reports...</div>;

    return (
        <div className="flex flex-col h-screen animate-in fade-in duration-300 relative print:hidden">
            <style type="text/css">{`@media print { @page { size: A4 ${printPlanData ? 'landscape' : 'portrait'}; margin: 10mm; } }`}</style>

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-purple-400"><i className="fas fa-file-contract mr-2"></i> Audit Reports & Schedules</h2>
                    <p className="text-slate-400 text-sm">Access and generate PDFs for all historical and active audits.</p>
                </div>
                <button onClick={() => setView('hub')} className="text-slate-400 hover:text-white bg-slate-900 w-10 h-10 rounded-xl flex items-center justify-center transition-colors border border-slate-800 shadow-lg"><i className="fas fa-times text-xl"></i></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll pb-20">
                <div className="max-w-7xl mx-auto space-y-6">

                    {/* TABS */}
                    <div className="flex gap-4">
                        <button onClick={() => setReportView('findings')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${reportView === 'findings' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600'}`}><i className="fas fa-search mr-2"></i> Audit Findings Reports</button>
                        <button onClick={() => setReportView('schedules')} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${reportView === 'schedules' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600'}`}><i className="fas fa-calendar-alt mr-2"></i> Audit Master Schedules</button>
                    </div>

                    {/* FILTER BAR */}
                    <div className="glass-panel p-5 rounded-2xl flex flex-wrap gap-4 items-center shadow-xl border border-slate-700 bg-slate-900/40">
                        <div className="flex-1 min-w-[250px] relative">
                            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                            <input placeholder="Search ID, Auditor, Site..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white outline-none focus:border-purple-500 shadow-inner transition-colors" />
                        </div>
                        {reportView === 'findings' && (
                            <>
                                <div className="w-48"><input placeholder="Filter Department" value={filters.dept} onChange={e => setFilters({ ...filters, dept: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-purple-500 shadow-inner transition-colors" /></div>
                                <div className="w-56"><select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-purple-500 shadow-inner transition-colors cursor-pointer"><option value="">All Statuses</option><option value="Reported">Open / Reported</option><option value="Submitted for Verification">Verification Pending</option><option value="Closed">Closed</option></select></div>
                            </>
                        )}
                        <button onClick={() => setFilters({ search: '', status: '', dept: '' })} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-white font-bold text-xs uppercase tracking-widest transition-colors shadow flex items-center gap-2"><i className="fas fa-undo"></i> Reset</button>
                    </div>

                    {/* REPORT LIST */}
                    <div className="glass-panel rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
                        {reportView === 'findings' ? (
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-950/80 backdrop-blur-md text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                                    <tr><th className="p-5 pl-6">Report Ref</th><th className="p-5">Date</th><th className="p-5">Auditee / Dept</th><th className="p-5 text-center">Findings</th><th className="p-5 text-center">Status</th><th className="p-5 pr-6 text-right">Action</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                                    {filteredReports.map((report, i) => (
                                        <tr key={i} className="hover:bg-slate-800/60 transition-colors">
                                            <td className="p-5 pl-6 font-mono text-xs font-bold text-blue-400">{report.docId}</td>
                                            <td className="p-5 text-xs font-mono">{(report.auditDate || new Date().toISOString()).split('T')[0]}</td>
                                            <td className="p-5"><div className="font-bold text-white text-base mb-1">{report.taskDetails?.dept}</div><div className="text-[10px] uppercase tracking-widest text-slate-500"><i className="fas fa-user mr-1"></i> {report.taskDetails?.auditee}</div></td>
                                            <td className="p-5 text-center"><span className="bg-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-800 shadow-inner">{report.findings?.length || 0}</span></td>
                                            <td className="p-5 text-center"><span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${getStatusColor(report.status)}`}>{report.status === 'Submitted for Verification' ? 'Pending Verif.' : report.status}</span></td>
                                            <td className="p-5 pr-6 text-right"><button onClick={() => handlePrint(report)} className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-lg flex items-center gap-2 ml-auto uppercase tracking-widest"><i className="fas fa-file-pdf text-lg"></i> Gen PDF</button></td>
                                        </tr>
                                    ))}
                                    {filteredReports.length === 0 && <tr><td colSpan="6" className="p-16 text-center text-slate-500 italic text-lg border-2 border-dashed border-slate-800 rounded-b-3xl m-2">No reports match your current filters.</td></tr>}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-950/80 backdrop-blur-md text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                                    <tr><th className="p-5 pl-6">Schedule Ref</th><th className="p-5">Target Site</th><th className="p-5">Standard Applied</th><th className="p-5">Lead Auditor</th><th className="p-5">Schedule Range</th><th className="p-5 pr-6 text-right">Action</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                                    {filteredPlans.map((plan, i) => (
                                        <tr key={i} className="hover:bg-slate-800/60 transition-colors">
                                            <td className="p-5 pl-6 font-mono text-xs font-bold text-blue-400">{plan.docId}</td>
                                            <td className="p-5 font-bold text-white text-base">{plan.siteId}</td>
                                            <td className="p-5 font-bold text-purple-300">{plan.standard}</td>
                                            <td className="p-5 text-sm font-medium">{plan.leadAuditor}</td>
                                            <td className="p-5 text-xs font-mono text-slate-400">{plan.startDate} <span className="text-slate-600 mx-1">to</span> {plan.endDate}</td>
                                            <td className="p-5 pr-6 text-right"><button onClick={() => handlePrintPlan(plan)} className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-lg flex items-center gap-2 ml-auto uppercase tracking-widest"><i className="fas fa-file-pdf text-lg"></i> Gen PDF</button></td>
                                        </tr>
                                    ))}
                                    {filteredPlans.length === 0 && <tr><td colSpan="6" className="p-16 text-center text-slate-500 italic text-lg border-2 border-dashed border-slate-800 rounded-b-3xl m-2">No schedules match your current filters.</td></tr>}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* PRINT CONTAINER FOR FINDINGS */}
            {printData && (
                <div className="hidden print:block p-10 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                        <div>
                            <div className="text-sm text-gray-500 font-bold mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Formal Record</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Internal Audit Report</h1>
                            <p className="mt-2 text-sm font-bold uppercase text-gray-600">{printData.taskDetails?.scope || 'OH&S Management System'}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold font-mono">Ref: {printData.docId}</p>
                            <p className="text-sm font-bold mt-1 uppercase">Date: {(printData.auditDate || new Date().toISOString()).split('T')[0]}</p>
                        </div>
                    </div>

                    <div className="mb-8 border border-black p-6 bg-gray-50">
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Site / Location:</td><td className="w-[35%] py-2 border-b border-gray-300 text-lg font-bold">{printData.taskDetails?.siteId}</td>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Standard:</td><td className="w-[35%] py-2 border-b border-gray-300">{printData.taskDetails?.standard}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Auditor:</td><td className="w-[35%] py-2 border-b border-gray-300 font-bold">{printData.taskDetails?.auditor}</td>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Lead Auditor:</td><td className="w-[35%] py-2 border-b border-gray-300">{printData.taskDetails?.leadAuditor}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-none">Auditee:</td><td className="w-[35%] py-2 border-none font-bold">{printData.taskDetails?.auditee}</td>
                                    <td className="w-[15%] font-bold py-2 border-none pl-4">Dept / Area:</td><td className="w-[35%] py-2 border-none">{printData.taskDetails?.dept} / {printData.taskDetails?.area}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="page-break-inside-avoid">
                        <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Findings Summary</h2>
                        <table className="w-full text-sm border-collapse border border-black mb-8">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-3 text-center w-[10%]">ID</th>
                                    <th className="border border-black p-3 text-center w-[15%]">Type</th>
                                    <th className="border border-black p-3 text-center w-[10%]">Clause</th>
                                    <th className="border border-black p-3 text-left">Description of Finding</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(printData.findings || []).map((f, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-3 text-center font-mono font-bold">{f.id}</td>
                                        <td className="border border-black p-3 text-center font-bold">{f.type}</td>
                                        <td className="border border-black p-3 text-center">{f.clause}</td>
                                        <td className="border border-black p-3">{f.desc}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Corrective Action Report (CAR)</h2>
                    {(printData.findings || []).map((f, i) => (
                        <div key={i} className="mb-6 border border-black p-5 page-break-inside-avoid">
                            <div className="flex justify-between border-b border-gray-300 pb-2 mb-3">
                                <span className="font-bold text-lg">Finding {f.id}</span>
                                <span className="font-bold border border-black px-2 py-0.5 uppercase text-xs bg-gray-100">{f.type}</span>
                            </div>
                            <div className="italic mb-4 text-sm text-gray-700 pl-3 border-l-4 border-gray-400 py-1">"{f.desc}"</div>

                            {f.response && f.response.status === 'Completed' ? (
                                <div className="text-sm bg-gray-50 p-5 border border-gray-300">
                                    <div className="mb-4"><strong>Root Cause Analysis:</strong><br /><span className="block mt-1">{f.response.rootCause}</span></div>
                                    <div className="mb-4"><strong>Immediate Correction:</strong><br /><span className="block mt-1">{f.response.correction}</span></div>
                                    <div className="mb-5"><strong>Corrective Action (CAPA):</strong><br /><span className="block mt-1">{f.response.capa}</span></div>
                                    <div className="flex justify-between border-t border-gray-300 pt-3 text-xs bg-gray-200 p-2">
                                        <div><strong>Owner:</strong> <span className="uppercase">{f.response.owner}</span></div>
                                        <div><strong>Target Date:</strong> <span className="font-mono">{f.response.targetDate}</span></div>
                                        <div><strong>Evidence Provided:</strong> {f.response.evidenceFileName ? 'Yes' : 'No'}</div>
                                    </div>
                                </div>
                            ) : <div className="text-red-600 font-bold italic text-sm text-center p-4 border border-dashed border-red-300 bg-red-50">No corrective action submitted by auditee.</div>}
                        </div>
                    ))}

                    <table className="w-full border-none mt-24 text-sm page-break-inside-avoid">
                        <tbody>
                            <tr>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Auditor Signature</td>
                                <td className="w-[10%] border-none"></td>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Auditee Signature</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                </div>
            )}

            {/* PRINT CONTAINER FOR SCHEDULES */}
            {printPlanData && (
                <div className="hidden print:block p-10 bg-white text-black min-h-screen absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                        <div>
                            <div className="text-sm text-gray-500 font-bold mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Formal Record</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Internal Audit Schedule & Matrix</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold font-mono">Ref ID: {printPlanData.docId}</p>
                            <p className="text-sm font-bold uppercase mt-1">Date Printed: {new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="mb-8 border border-black p-6 bg-gray-50">
                        <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. General Information</h2>
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Target Site:</td><td className="w-[35%] py-2 border-b border-gray-300 text-lg font-bold">{printPlanData.siteId || 'N/A'}</td>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Lead Auditor:</td><td className="w-[35%] py-2 border-b border-gray-300 font-bold">{printPlanData.leadAuditor || 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Standard:</td><td className="w-[35%] py-2 border-b border-gray-300">{printPlanData.standard}</td>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300 pl-4">Date Range:</td><td className="w-[35%] py-2 border-b border-gray-300 font-mono">{printPlanData.startDate} to {printPlanData.endDate}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-none">Audit Team:</td><td colSpan="3" className="py-2 border-none">{(printPlanData.team || []).join(', ') || 'None assigned'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="page-break-inside-avoid">
                        <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Execution Matrix</h2>
                        <table className="w-full text-xs border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 text-left w-[15%]">Auditor</th>
                                    <th className="border border-black p-2 text-left w-[15%]">Auditee</th>
                                    <th className="border border-black p-2 text-left w-[15%]">Department</th>
                                    <th className="border border-black p-2 text-left w-[15%]">Area</th>
                                    <th className="border border-black p-2 text-left w-[20%]">Aspect / Process</th>
                                    <th className="border border-black p-2 text-center w-[10%]">Date</th>
                                    <th className="border border-black p-2 text-center w-[10%]">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(printPlanData.matrix || []).map((row, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-2 font-bold">{row.auditor}</td>
                                        <td className="border border-black p-2 font-bold">{row.auditee}</td>
                                        <td className="border border-black p-2">{row.dept}</td>
                                        <td className="border border-black p-2">{row.area}</td>
                                        <td className="border border-black p-2">{row.aspect}</td>
                                        <td className="border border-black p-2 text-center font-mono">{row.date}</td>
                                        <td className="border border-black p-2 text-center font-mono">{row.time}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <table className="w-full border-none mt-24 text-sm page-break-inside-avoid">
                        <tbody>
                            <tr>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Lead Auditor Signature</td>
                                <td className="w-[10%] border-none"></td>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Management Rep Signature</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MODULE 5: AUDIT DASHBOARD
// ============================================================================
const AuditDashboard = ({ setView, session }) => {
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAudit, setSelectedAudit] = useState(null);

    useEffect(() => {
        const dbRef = scopedCollectionRef(session, 'auditFindings');

        const handleData = (snapshot) => {
            if (snapshot.exists()) {
                setAudits(safeArrayParse(snapshot.val()));
            } else {
                setAudits([]);
            }
            setLoading(false);
        };

        const handleError = (error) => {
            console.error("Dashboard Load Error:", error);
            setLoading(false);
        };

        const unsubscribe = onValue(dbRef, handleData, handleError);

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, [session]);

    const stats = useMemo(() => {
        return {
            open: audits.filter(a => a.status === 'Reported').length,
            inProgress: audits.filter(a => a.status === 'Submitted for Verification').length,
            closed: audits.filter(a => a.status === 'Closed').length,
            total: audits.length
        };
    }, [audits]);

    const getStatusColor = (status) => {
        if (status === 'Reported') return 'text-red-400 bg-red-900/20 border-red-900/50';
        if (status === 'Submitted for Verification') return 'text-orange-400 bg-orange-900/20 border-orange-900/50';
        if (status === 'Closed') return 'text-emerald-400 bg-emerald-900/20 border-emerald-900/50';
        return 'text-slate-400';
    };

    const getStatusLabel = (status) => {
        if (status === 'Reported') return 'Open Finding';
        if (status === 'Submitted for Verification') return 'Verif. Pending';
        return status;
    };

    if (loading) return <div className="flex h-full items-center justify-center text-white"><div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mr-4"></div> Loading Dashboard...</div>;

    return (
        <div className="flex flex-col h-screen animate-in fade-in duration-300 relative print:hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-orange-400"><i className="fas fa-chart-pie mr-2"></i> Audit Dashboard</h2>
                    <p className="text-slate-400 text-sm">Real-time status of all organizational audits.</p>
                </div>
                <button onClick={() => setView('hub')} className="text-slate-400 hover:text-white bg-slate-900 w-10 h-10 rounded-xl flex items-center justify-center transition-colors border border-slate-800 shadow-lg"><i className="fas fa-times text-xl"></i></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll pb-20">
                <div className="max-w-7xl mx-auto space-y-8">

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-500 shadow-xl bg-slate-900/40 hover:-translate-y-1 transition-transform cursor-pointer">
                            <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2">Open Findings</div>
                            <div className="text-5xl font-black text-white">{stats.open}</div>
                            <div className="text-[9px] text-red-400 mt-3 font-bold tracking-widest bg-red-900/20 px-2 py-1 rounded inline-block border border-red-500/30">ACTION REQUIRED</div>
                        </div>
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-orange-500 shadow-xl bg-slate-900/40 hover:-translate-y-1 transition-transform cursor-pointer">
                            <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2">In Progress</div>
                            <div className="text-5xl font-black text-white">{stats.inProgress}</div>
                            <div className="text-[9px] text-orange-400 mt-3 font-bold tracking-widest bg-orange-900/20 px-2 py-1 rounded inline-block border border-orange-500/30">VERIFICATION PENDING</div>
                        </div>
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-emerald-500 shadow-xl bg-slate-900/40 hover:-translate-y-1 transition-transform cursor-pointer">
                            <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2">Closed</div>
                            <div className="text-5xl font-black text-white">{stats.closed}</div>
                            <div className="text-[9px] text-emerald-400 mt-3 font-bold tracking-widest bg-emerald-900/20 px-2 py-1 rounded inline-block border border-emerald-500/30">VERIFIED & DONE</div>
                        </div>
                        <div className="glass-panel p-6 rounded-3xl border-l-4 border-blue-500 shadow-xl bg-slate-900/40 hover:-translate-y-1 transition-transform cursor-pointer">
                            <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2">Total Audits</div>
                            <div className="text-5xl font-black text-white">{stats.total}</div>
                            <div className="text-[9px] text-blue-400 mt-3 font-bold tracking-widest bg-blue-900/20 px-2 py-1 rounded inline-block border border-blue-500/30">ALL TIME</div>
                        </div>
                    </div>

                    <div className="glass-panel rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
                        <div className="p-6 bg-slate-900/80 border-b border-slate-700 flex justify-between items-center backdrop-blur-md">
                            <h3 className="font-bold text-white text-lg flex items-center gap-2"><i className="fas fa-list text-blue-400"></i> Live Audit Records</h3>
                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Click row for details</span>
                        </div>
                        <div className="overflow-x-auto custom-scroll">
                            <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap min-w-[900px]">
                                <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                    <tr><th className="p-5 pl-6">Ref ID</th><th className="p-5">Status</th><th className="p-5">Date</th><th className="p-5">Department</th><th className="p-5">Auditor</th><th className="p-5">Auditee</th><th className="p-5 pr-6 text-center">Findings</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                                    {audits.map((audit, i) => (
                                        <tr key={i} onClick={() => setSelectedAudit(audit)} className="hover:bg-slate-800/60 cursor-pointer transition-colors group">
                                            <td className="p-5 pl-6 font-mono text-xs text-blue-400 font-bold">{audit.docId}</td>
                                            <td className="p-5"><span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${getStatusColor(audit.status)}`}>{getStatusLabel(audit.status)}</span></td>
                                            <td className="p-5 text-xs font-mono">{(audit.auditDate || new Date().toISOString()).split('T')[0]}</td>
                                            <td className="p-5 font-bold text-white">{audit.taskDetails?.dept}</td>
                                            <td className="p-5 text-sm">{audit.auditor}</td>
                                            <td className="p-5 text-slate-400 italic text-sm">{audit.taskDetails?.auditee}</td>
                                            <td className="p-5 pr-6 text-center"><span className="bg-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-800 shadow-inner group-hover:border-blue-500/50 transition-colors">{audit.findings?.length || 0}</span></td>
                                        </tr>
                                    ))}
                                    {audits.length === 0 && <tr><td colSpan="7" className="p-16 text-center text-slate-500 italic text-lg">No audit records found in database.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* DETAIL MODAL OVERLAY */}
            {selectedAudit && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/5 rounded-full blur-[100px] pointer-events-none"></div>

                        <div className="p-8 border-b border-slate-700 flex justify-between items-start relative z-10 bg-slate-800/50">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Audit Details</h2>
                                <p className="text-sm text-emerald-400 font-mono bg-emerald-900/20 px-3 py-1 rounded-lg border border-emerald-500/30 inline-block font-bold">Ref: {selectedAudit.docId}</p>
                            </div>
                            <button onClick={() => setSelectedAudit(null)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-lg"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Site</label><span className="text-sm text-white font-bold">{selectedAudit.taskDetails?.siteId}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Date</label><span className="text-sm text-white font-bold font-mono">{(selectedAudit.auditDate || '').split('T')[0]}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Auditor</label><span className="text-sm text-white font-bold">{selectedAudit.auditor}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Auditee</label><span className="text-sm text-amber-400 font-bold">{selectedAudit.taskDetails?.auditee}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Department</label><span className="text-sm text-white font-bold">{selectedAudit.taskDetails?.dept}</span></div>
                                <div><label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Area</label><span className="text-sm text-white font-bold">{selectedAudit.taskDetails?.area}</span></div>
                                <div className="col-span-2"><label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Scope / Standard</label><span className="text-sm text-white font-bold">{selectedAudit.taskDetails?.scope} / {selectedAudit.taskDetails?.criteria || selectedAudit.taskDetails?.standard}</span></div>
                            </div>

                            <h3 className="text-blue-400 font-bold uppercase text-xs tracking-widest mb-4 border-b border-slate-700 pb-2 flex items-center gap-2"><i className="fas fa-list-check"></i> Audit Findings ({(selectedAudit.findings || []).length})</h3>

                            <div className="space-y-6">
                                {(selectedAudit.findings || []).map((f, i) => (
                                    <div key={i} className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700/50">
                                            <div className="flex gap-3 items-center">
                                                <span className="text-xs font-mono font-bold text-red-400 bg-red-900/20 px-2.5 py-1 rounded-lg border border-red-500/30 font-bold shadow-sm">{f.id}</span>
                                                <span className={`text-[10px] font-bold text-white uppercase tracking-widest px-2.5 py-1 rounded-lg border shadow-sm ${getTypeClass(f.type)}`}>{f.type}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">Clause: <span className="text-white">{f.clause}</span></span>
                                        </div>
                                        <p className="text-sm text-slate-200 mb-6 border-l-4 border-slate-600 pl-4 py-1 bg-slate-800/30 rounded-r-lg leading-relaxed">"{f.desc}"</p>

                                        {f.response && f.response.status === 'Completed' ? (
                                            <div className="mt-4 pt-5 border-t border-slate-700 bg-slate-950 p-6 rounded-xl shadow-inner relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <i className="fas fa-reply text-orange-400"></i>
                                                    <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Auditee Corrective Action Plan</span>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-6">
                                                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                                                        <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5">Root Cause:</span>
                                                        <span className="font-medium text-white">{f.response.rootCause}</span>
                                                    </div>
                                                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                                                        <span className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5">CAPA:</span>
                                                        <span className="font-medium text-white">{f.response.capa}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-4 mt-2 border-t border-slate-800">
                                                    {f.response.evidenceFileName ? <a href={f.response.evidenceFile} download={f.response.evidenceFileName} className="text-[10px] uppercase font-bold tracking-widest bg-emerald-900/30 text-emerald-400 px-4 py-2.5 rounded-lg border border-emerald-900 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-2 shadow-sm"><i className="fas fa-download"></i> View Evidence</a> : <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 italic bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">No Evidence Provided</span>}
                                                    <div className="text-right flex gap-6">
                                                        <div><span className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-0.5">Owner</span><span className="text-white font-bold text-sm">{f.response.owner}</span></div>
                                                        <div><span className="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-0.5">Target</span><span className="font-mono text-white text-sm bg-slate-900 px-2 py-1 rounded border border-slate-800 shadow-inner">{f.response.targetDate}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : <div className="text-xs text-slate-500 italic bg-slate-950 p-4 rounded-xl text-center border border-dashed border-slate-700">No response submitted by auditee yet.</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className={`p-6 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md rounded-b-3xl flex justify-between items-center flex-shrink-0`}>
                            <div><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block mb-1">Current Audit Status</span><span className={`text-sm font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border shadow-sm inline-block ${selectedAudit.status === 'Closed' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30' : 'bg-orange-900/20 text-orange-400 border-orange-500/30'}`}>{getStatusLabel(selectedAudit.status)}</span></div>
                            {selectedAudit.closureDate && <div className="text-right"><span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block mb-1">Closed On</span><span className="text-sm text-white font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 shadow-inner inline-block">{selectedAudit.closureDate.split('T')[0]}</span></div>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MODULE 6: AUDIT CALENDAR
// ============================================================================
const AuditCalendar = ({ setView, session }) => {
    const [loading, setLoading] = useState(true);
    const [plans, setPlans] = useState([]);
    const [findings, setFindings] = useState([]);

    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const [calYear, setCalYear] = useState(new Date().getFullYear());
    const [calSiteFilter, setCalSiteFilter] = useState('All');
    const [sites, setSites] = useState([]);

    useEffect(() => {
        const load = async () => {
            try {
                const val = await readOrgChildren(rtdb, session.orgId, ['sites', 'auditPlans', 'auditFindings']);
                if (val.sites) {
                    const parsedSites = Object.keys(val.sites).map(key => {
                        const sVal = val.sites[key];
                        return typeof sVal === 'object' ? { code: sVal.code || key, name: sVal.name || sVal.code || key, ...sVal } : { code: sVal, name: sVal };
                    });
                    setSites(parsedSites);
                }
                if (val.auditPlans) {
                    setPlans(safeArrayParse(val.auditPlans));
                }
                if (val.auditFindings) {
                    setFindings(safeArrayParse(val.auditFindings));
                }
            } catch (e) {
                console.error("Load error:", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [session.orgId]);

    const events = useMemo(() => {
        const evList = [];
        plans.forEach(plan => {
            if (calSiteFilter !== 'All' && plan.siteId !== calSiteFilter) return;
            (plan.matrix || []).forEach(m => {
                if (m.date) {
                    evList.push({ date: m.date, type: 'scheduled', label: `Scheduled: ${m.dept}`, ref: plan.docId });
                }
            });
        });
        findings.forEach(f => {
            if (calSiteFilter !== 'All' && f.taskDetails?.siteId !== calSiteFilter) return;
            if (f.auditDate) {
                evList.push({ date: f.auditDate.split('T')[0], type: 'assigned', label: `Executed`, ref: f.docId });
            }
            if (f.submissionDate) {
                evList.push({ date: f.submissionDate.split('T')[0], type: 'replied', label: `Auditee Replied`, ref: f.docId });
            }
            if (f.closureDate) {
                evList.push({ date: f.closureDate.split('T')[0], type: 'closed', label: `Protocol Closed`, ref: f.docId });
            }
        });
        return evList;
    }, [plans, findings, calSiteFilter]);

    if (loading) return <div className="flex h-full items-center justify-center text-white"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mr-4"></div> Loading Calendar...</div>;

    return (
        <div className="flex flex-col h-screen animate-in fade-in duration-300 relative print:hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-indigo-400"><i className="fas fa-calendar-days mr-2"></i> Audit Calendar</h2>
                    <p className="text-slate-400 text-sm">Visual timeline of audit schedules and milestones.</p>
                </div>
                <button onClick={() => setView('hub')} className="text-slate-400 hover:text-white bg-slate-900 w-10 h-10 rounded-xl flex items-center justify-center transition-colors border border-slate-800 shadow-lg"><i className="fas fa-times text-xl"></i></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll pb-20">
                <div className="max-w-7xl mx-auto space-y-6">

                    <div className="flex justify-between items-center bg-slate-900 p-6 rounded-3xl border border-slate-700 shadow-xl">
                        <div className="flex items-center gap-4">
                            <label className="text-xs uppercase font-bold text-slate-400 tracking-widest">Site View:</label>
                            <select className="bg-slate-950 p-3 rounded-xl w-64 border border-slate-800 text-sm font-bold text-indigo-400 outline-none focus:border-indigo-500 shadow-inner transition-colors cursor-pointer" value={calSiteFilter} onChange={e => setCalSiteFilter(e.target.value)}>
                                <option value="All">All Sites</option>
                                {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-950 rounded-xl p-1.5 border border-slate-800 shadow-inner">
                            <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else { setCalMonth(m => m - 1) } }} className="px-4 py-2 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"><i className="fas fa-chevron-left"></i></button>
                            <span className="font-bold w-40 text-center text-white text-sm tracking-wide">{["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][calMonth]} {calYear}</span>
                            <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else { setCalMonth(m => m + 1) } }} className="px-4 py-2 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"><i className="fas fa-chevron-right"></i></button>
                        </div>
                    </div>

                    <div className="flex gap-6 mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 justify-center shadow-inner">
                        <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-blue-500 border border-blue-400 mr-2 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span> Scheduled</span>
                        <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-orange-500 border border-orange-400 mr-2 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span> Assigned</span>
                        <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-300 mr-2 shadow-[0_0_8px_rgba(250,204,21,0.6)]"></span> Replied</span>
                        <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-400 mr-2 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span> Closed</span>
                    </div>

                    <div className="glass-panel p-8 rounded-3xl shadow-2xl border border-slate-700 bg-slate-900/40">
                        <div className="grid grid-cols-7 border-t border-l border-slate-700 rounded-2xl overflow-hidden bg-slate-900 shadow-2xl">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="p-4 text-center text-xs font-bold text-slate-400 uppercase tracking-widest border-r border-b border-slate-700 bg-slate-950 shadow-inner">{day}</div>
                            ))}
                            {(() => {
                                const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                                const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
                                const boxes = [];

                                for (let i = 0; i < firstDayIndex; i++) {
                                    boxes.push(<div key={`empty-${i}`} className="p-2 border-r border-b border-slate-800 bg-slate-950/50 min-h-[140px] shadow-inner"></div>);
                                }

                                for (let d = 1; d <= daysInMonth; d++) {
                                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                    const dayEvents = events.filter(e => e.date === dateStr);

                                    boxes.push(
                                        <div key={d} className="p-3 border-r border-b border-slate-800 bg-slate-900 hover:bg-slate-800/80 transition-colors min-h-[140px] flex flex-col group">
                                            <span className={`font-bold block text-right mb-3 text-sm transition-colors ${new Date().toISOString().split('T')[0] === dateStr ? 'text-indigo-400 bg-indigo-900/20 rounded-lg px-2 inline-block ml-auto border border-indigo-500/30' : 'text-slate-500 group-hover:text-slate-300'}`}>{d}</span>
                                            <div className="flex-1 space-y-2 overflow-y-auto custom-scroll pr-1">
                                                {dayEvents.map((ev, i) => {
                                                    let bg = 'bg-slate-800 border-slate-600 text-slate-300';
                                                    if (ev.type === 'scheduled') bg = 'bg-blue-900/40 border-blue-500/50 text-blue-300';
                                                    if (ev.type === 'assigned') bg = 'bg-orange-900/40 border-orange-500/50 text-orange-300';
                                                    if (ev.type === 'replied') bg = 'bg-yellow-900/40 border-yellow-500/50 text-yellow-300';
                                                    if (ev.type === 'closed') bg = 'bg-emerald-900/40 border-emerald-500/50 text-emerald-300';

                                                    return (
                                                        <div key={i} className={`text-[9px] font-bold p-2 rounded-lg leading-tight border shadow-sm truncate transition-transform hover:scale-105 cursor-default ${bg}`} title={`${ev.label} - ${ev.ref}`}>
                                                            <div className="uppercase mb-0.5 tracking-wider">{ev.label}</div>
                                                            <div className="font-mono opacity-80 text-[8px]">{ev.ref}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }
                                return boxes;
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// MASTER HUB & APP ROUTER
// ============================================================================
export default function Audit() {
    const navigate = useNavigate();
    const [view, setView] = useState('hub');
    const authState = (() => {
        const sess = readStoredSession();
        if (!sess || !canAuthenticateStatus(sess.status)) {
            return { session: null, redirectTo: '/', alertMessage: '' };
        }

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(sess.role);
        const hasModuleAccess = isGlobalAdmin || isSiteAdmin || hasAccessibleModule(sess.accessibleModules, 'Internal Audit');

        if (!hasModuleAccess) {
            return {
                session: null,
                redirectTo: '/dashboard',
                alertMessage: 'Security Alert: You do not have permission to access the Internal Audit module.'
            };
        }

        return { session: sess, redirectTo: '', alertMessage: '' };
    })();

    const { session, redirectTo, alertMessage } = authState;

    useEffect(() => {
        if (!redirectTo) {
            return;
        }

        if (alertMessage) {
            alert(alertMessage);
        }

        navigate(redirectTo);
    }, [alertMessage, navigate, redirectTo]);

    if (!session) return <div className="flex h-screen items-center justify-center text-white bg-slate-950 font-['Space_Grotesk']"><div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-4"></div> Loading Audit System...</div>;

    let ViewComponent;
    switch (view) {
        case 'scheduler': ViewComponent = <AuditScheduler setView={setView} session={session} />; break;
        case 'auditor': ViewComponent = <AuditorWorkplace setView={setView} session={session} />; break;
        case 'auditee': ViewComponent = <AuditeeWorkplace setView={setView} session={session} />; break;
        case 'reports': ViewComponent = <AuditReports setView={setView} session={session} />; break;
        case 'dashboard': ViewComponent = <AuditDashboard setView={setView} session={session} />; break;
        case 'calendar': ViewComponent = <AuditCalendar setView={setView} session={session} />; break;
        default:
            ViewComponent = (
                <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden animate-in fade-in duration-500 relative">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

                    <div className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 flex-shrink-0 relative z-10">
                        <div className="flex items-center gap-4">
                            <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors"><i className="fas fa-arrow-left"></i> Hub</button>
                            <div className="h-6 w-px bg-slate-800 mx-2"></div>
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-clipboard-check"></i></div>
                            <h1 className="font-bold text-lg tracking-wide hidden md:block">Internal Audit Hub</h1>
                        </div>
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-slate-950 px-4 py-2 rounded-xl text-emerald-400 border border-slate-800 shadow-inner">Org: {session.orgId}</span>
                    </div>

                    <div className="flex-1 p-8 flex items-center justify-center overflow-y-auto custom-scroll relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-[1200px]">

                            <div onClick={() => setView('scheduler')} className="glass-panel rounded-3xl h-56 flex flex-col justify-center items-center cursor-pointer text-center relative overflow-hidden group border border-slate-800 hover:border-blue-500/50 transition-all hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.4)]">
                                <div className="absolute top-0 w-full h-1.5 bg-blue-500"></div>
                                <div className="text-5xl text-blue-500 mb-6 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"><i className="fas fa-calendar-alt"></i></div>
                                <div><h3 className="text-xl font-bold text-white mb-2">Audit Scheduler</h3><p className="text-xs text-slate-400 px-6">Plan annual audits & assign auditors</p></div>
                            </div>

                            <div onClick={() => setView('auditor')} className="glass-panel rounded-3xl h-56 flex flex-col justify-center items-center cursor-pointer text-center relative overflow-hidden group border border-slate-800 hover:border-emerald-500/50 transition-all hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.4)]">
                                <div className="absolute top-0 w-full h-1.5 bg-emerald-500"></div>
                                <div className="text-5xl text-emerald-500 mb-6 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"><i className="fas fa-clipboard-list"></i></div>
                                <div><h3 className="text-xl font-bold text-white mb-2">Auditor Workplace</h3><p className="text-xs text-slate-400 px-6">Execute audits & record findings</p></div>
                            </div>

                            <div onClick={() => setView('auditee')} className="glass-panel rounded-3xl h-56 flex flex-col justify-center items-center cursor-pointer text-center relative overflow-hidden group border border-slate-800 hover:border-amber-500/50 transition-all hover:shadow-[0_10px_40px_-10px_rgba(245,158,11,0.4)]">
                                <div className="absolute top-0 w-full h-1.5 bg-amber-500"></div>
                                <div className="text-5xl text-amber-500 mb-6 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"><i className="fas fa-user-edit"></i></div>
                                <div><h3 className="text-xl font-bold text-white mb-2">Auditee Workplace</h3><p className="text-xs text-slate-400 px-6">Submit corrections & evidence</p></div>
                            </div>

                            <div onClick={() => setView('reports')} className="glass-panel rounded-3xl h-56 flex flex-col justify-center items-center cursor-pointer text-center relative overflow-hidden group border border-slate-800 hover:border-purple-500/50 transition-all hover:shadow-[0_10px_40px_-10px_rgba(168,85,247,0.4)]">
                                <div className="absolute top-0 w-full h-1.5 bg-purple-500"></div>
                                <div className="text-5xl text-purple-500 mb-6 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"><i className="fas fa-file-contract"></i></div>
                                <div><h3 className="text-xl font-bold text-white mb-2">Audit Reports</h3><p className="text-xs text-slate-400 px-6">Verify closure & generate PDFs</p></div>
                            </div>

                            <div onClick={() => setView('calendar')} className="glass-panel rounded-3xl h-56 flex flex-col justify-center items-center cursor-pointer text-center relative overflow-hidden group border border-slate-800 hover:border-indigo-500/50 transition-all hover:shadow-[0_10px_40px_-10px_rgba(99,102,241,0.4)]">
                                <div className="absolute top-0 w-full h-1.5 bg-indigo-500"></div>
                                <div className="text-5xl text-indigo-500 mb-6 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"><i className="fas fa-calendar-days"></i></div>
                                <div><h3 className="text-xl font-bold text-white mb-2">Audit Calendar</h3><p className="text-xs text-slate-400 px-6">Visual lifecycle timeline</p></div>
                            </div>

                            <div onClick={() => setView('dashboard')} className="glass-panel rounded-3xl h-56 flex flex-col justify-center items-center cursor-pointer text-center relative overflow-hidden group border border-slate-800 hover:border-orange-500/50 transition-all hover:shadow-[0_10px_40px_-10px_rgba(249,115,22,0.4)]">
                                <div className="absolute top-0 w-full h-1.5 bg-orange-500"></div>
                                <div className="text-5xl text-orange-500 mb-6 drop-shadow-lg group-hover:scale-110 transition-transform duration-300"><i className="fas fa-chart-pie"></i></div>
                                <div><h3 className="text-xl font-bold text-white mb-2">Dashboard</h3><p className="text-xs text-slate-400 px-6">Analytics & Trends</p></div>
                            </div>

                        </div>
                    </div>
                </div>
            );
    }

    return <div className="font-['Space_Grotesk']">{ViewComponent}</div>;
}
