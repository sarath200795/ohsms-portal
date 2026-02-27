import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, push, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';

const SCENARIOS = [
    {
        id: 1, title: 'Fire Emergency', icon: 'fa-fire', color: 'text-red-500', border: 'border-b-4 border-red-500',
        checklist: ["Activate manual call point / sound alarm.", "Evacuate via nearest safe exit.", "Check doors for heat before opening.", "Stay low if smoke is present.", "Proceed to Assembly Point.", "Perform head count/roll call."]
    },
    {
        id: 2, title: 'Chemical Spill', icon: 'fa-bottle-droplet', color: 'text-yellow-500', border: 'border-b-4 border-yellow-500',
        checklist: ["Isolate the area immediately.", "Identify chemical & consult MSDS.", "Don appropriate PPE.", "Use Spill Kit to contain.", "Dispose waste in haz-waste bins.", "Ventilate the area."]
    },
    {
        id: 3, title: 'Electrical Outage', icon: 'fa-bolt', color: 'text-amber-500', border: 'border-b-4 border-amber-500',
        checklist: ["Remain calm in work area.", "Lower MHE/Forklifts to floor.", "Check DG status.", "Ensure access control is functional.", "Contact Power Utility Provider."]
    },
    {
        id: 4, title: 'Severe Weather', icon: 'fa-cloud-bolt', color: 'text-blue-500', border: 'border-b-4 border-blue-500',
        checklist: ["Monitor weather alerts.", "Secure loose outdoor items.", "Close doors/windows securely.", "Move away from glass.", "Move to designated shelter."]
    },
    {
        id: 5, title: 'Armed Aggressor', icon: 'fa-person-rifle', color: 'text-red-900', border: 'border-b-4 border-red-900',
        checklist: ["Run: Evacuate if safe.", "Hide: Lock door, lights off, silence phones.", "Fight: Last resort only.", "Keep hands visible for Police.", "Lockdown site access."]
    },
    {
        id: 6, title: 'Earthquake', icon: 'fa-house-crack', color: 'text-purple-500', border: 'border-b-4 border-purple-500',
        checklist: ["DROP, COVER, HOLD ON.", "Stay away from glass/shelving.", "Evacuate AFTER shaking stops.", "Inspect building for damage."]
    },
    {
        id: 7, title: 'Medical Emergency', icon: 'fa-briefcase-medical', color: 'text-emerald-500', border: 'border-b-4 border-emerald-500',
        checklist: ["Assess scene safety.", "Do not move patient (unless danger).", "Call First Aider/Ambulance.", "Guide Ambulance to entrance.", "Protect patient privacy."]
    },
    {
        id: 8, title: 'Civil Threat', icon: 'fa-user-secret', color: 'text-indigo-500', border: 'border-b-4 border-indigo-500',
        checklist: ["Do not touch suspicious items.", "Cordon off area.", "Notify Security/Police.", "Do not use radios near item.", "Evacuate immediate area."]
    }
];

const EMERGENCY_TEAMS = [
    "Transportation Team", "Spill Response Team", "Fire Fighting Team", "Evacuation Team",
    "Medical Emergency Team", "Security", "Public Relation"
];

export default function MockDrill() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [selectedDrill, setSelectedDrill] = useState(null);
    const [history, setHistory] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [printData, setPrintData] = useState(null);

    // Form State
    const [form, setForm] = useState({
        siteId: '', eventType: 'Mock Drill', date: new Date().toISOString().split('T')[0], time: '',
        shift: 'Day', commander: '', evacTime: '', ertResponseTime: '', headCount: '', debrief: '', capa: []
    });
    const [checks, setChecks] = useState({});
    const [teamChecks, setTeamChecks] = useState({});
    const [actionLog, setActionLog] = useState([{ time: '', action: '', observation: '' }]);

    // --- CHECK AUTH & LOAD DATA ---
    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        setSession(sess);

        loadData(sess);
    }, [navigate]);

    const loadData = async (sess) => {
        setLoading(true);
        try {
            const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
            const snap = await get(dbRef);
            if (snap.exists()) {
                const val = snap.val();
                if (val.sites) setSites(Object.values(val.sites));
                if (val.users) setUsers(Object.values(val.users));
                if (val.mockDrills) {
                    setHistory(Object.entries(val.mockDrills)
                        .map(([k, v]) => ({ ...v, firebaseKey: k }))
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
                }
            }
        } catch (err) {
            console.error("Error loading data:", err);
        }
        setLoading(false);
    };

    const availableCommanders = useMemo(() => {
        if (!form.siteId) return [];
        return users.filter(u => u.role === 'Owner' || u.assignedSite === form.siteId || (u.accessibleSites && u.accessibleSites.includes(form.siteId)));
    }, [users, form.siteId]);

    const openDrill = (scenario) => {
        setSelectedDrill(scenario);
        setForm({
            ...form,
            siteId: session.assignedSite !== 'GLOBAL' ? session.assignedSite : '',
            eventType: 'Mock Drill',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            headCount: '', debrief: '', evacTime: '', ertResponseTime: '', capa: []
        });
        setChecks({});
        setTeamChecks({});
        setActionLog([{ time: '', action: '', observation: '' }]);
    };

    // ACTION LOG FUNCTIONS
    const addActionRow = () => setActionLog([...actionLog, { time: '', action: '', observation: '' }]);
    const removeActionRow = (i) => setActionLog(actionLog.filter((_, idx) => idx !== i));
    const updateActionRow = (i, field, value) => {
        const newLog = [...actionLog];
        newLog[i][field] = value;
        setActionLog(newLog);
    };

    // CAPA FUNCTIONS
    const addCapa = () => setForm({ ...form, capa: [...form.capa, { action: '', owner: '', due: '', status: 'Open' }] });
    const updateCapa = (idx, field, val) => {
        const newCapa = [...form.capa];
        newCapa[idx][field] = val;
        setForm({ ...form, capa: newCapa });
    };
    const removeCapa = (idx) => setForm({ ...form, capa: form.capa.filter((_, i) => i !== idx) });

    const handleSubmit = async () => {
        if (!form.siteId) return alert("Please select a Site ID.");
        if (!form.commander) return alert("Please select an Incident Commander.");

        const teamsAlertedCount = Object.values(teamChecks).filter(Boolean).length;
        if (teamsAlertedCount < EMERGENCY_TEAMS.length) {
            if (!window.confirm("Not all Emergency Teams have been marked as alerted. Proceed anyway?")) return;
        }

        const completedCount = Object.values(checks).filter(Boolean).length;
        const totalCount = selectedDrill.checklist.length;
        const score = Math.round((completedCount / totalCount) * 100);

        const prefix = form.eventType === 'Mock Drill' ? 'MD' : 'ER';
        const srNo = Math.floor(10000 + Math.random() * 90000);
        const docId = `${session.orgId}-${form.siteId}-${prefix}-${srNo}`;

        // STRICT SANITIZATION: Remove any empty action logs or undefined data
        const cleanActionLog = actionLog.filter(l => l.action && l.action.trim() !== '');
        const cleanCapa = (form.capa || []).filter(c => c.action && c.action.trim() !== '');

        const rawRecord = {
            ...form,
            docId: docId,
            scenario: selectedDrill.title,
            score: score,
            teamsAlerted: teamChecks || {},
            checklistStatus: checks || {},
            actionLog: cleanActionLog,
            capa: cleanCapa,
            timestamp: new Date().toISOString(),
            loggedBy: session.user
        };

        // Final safety parse to remove hidden undefined values
        const newRecord = JSON.parse(JSON.stringify(rawRecord));

        try {
            await push(ref(rtdb, `organizations/${session.orgId}/mockDrills`), newRecord);
            setHistory([newRecord, ...history]);
            setSelectedDrill(null);
            alert(`${form.eventType} Report Submitted! ID: ${docId}`);
        } catch (e) {
            alert("Failed to submit report: " + e.message);
        }
    };

    const deleteRecord = async (record, index) => {
        if (window.confirm("Are you sure you want to delete this record?")) {
            try {
                if (record.firebaseKey) {
                    await remove(ref(rtdb, `organizations/${session.orgId}/mockDrills/${record.firebaseKey}`));
                }
                const newHistory = history.filter((_, i) => i !== index);
                setHistory(newHistory);
            } catch (e) {
                alert("Delete failed: " + e.message);
            }
        }
    };

    const generatePDF = (record) => {
        const scenarioDef = SCENARIOS.find(s => s.title === record.scenario);
        const fullRecord = { ...record, scenarioDef: scenarioDef };
        setPrintData(fullRecord);
        setTimeout(() => window.print(), 800);
    };

    // Cleanup Print state
    useEffect(() => {
        const handleAfterPrint = () => setPrintData(null);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const toggleCheck = (id, setFn) => setFn(prev => ({ ...prev, [id]: !prev[id] }));

    if (loading) return (
        <div className="flex h-screen items-center justify-center text-white bg-slate-950 flex-col font-['Space_Grotesk']">
            <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Resources...</h2>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden">

            {/* HEADER */}
            <div className="app-ui h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 no-print flex-shrink-0 z-20">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-600 to-rose-600 flex items-center justify-center text-white font-bold shadow-lg shadow-pink-900/50">
                        <i className="fas fa-person-running"></i>
                    </div>
                    <h1 className="font-bold text-lg hidden md:block">Emergency Response Coordinator</h1>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest bg-slate-800 px-3 py-1.5 rounded-lg text-slate-400 border border-slate-700">
                    User: {session?.user}
                </div>
            </div>

            <div className="app-ui flex-1 overflow-y-auto p-8 custom-scroll no-print relative z-10">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white"><i className="fas fa-clipboard-list text-pink-500"></i> Select Scenario</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                        {SCENARIOS.map(s => (
                            <div key={s.id} onClick={() => openDrill(s)} className={`glass-panel p-6 rounded-2xl cursor-pointer relative group bg-slate-900/40 hover:bg-slate-800/80 border border-slate-800 transition-all ${s.border}`}>
                                <div className={`w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center text-xl mb-4 ${s.color} shadow-inner group-hover:scale-110 transition-transform`}><i className={`fas ${s.icon}`}></i></div>
                                <h3 className="font-bold text-lg mb-1 text-white">{s.title}</h3>
                                <p className="text-xs text-slate-400 font-medium">Initiate Protocol <i className="fas fa-arrow-right ml-1 opacity-0 group-hover:opacity-100 transition-opacity"></i></p>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-slate-800 pt-8">
                        <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs mb-4">Recent Logs</h3>
                        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-800">
                                    <tr>
                                        <th className="p-5 pl-6">Type</th>
                                        <th className="p-5">Doc ID</th>
                                        <th className="p-5">Scenario</th>
                                        <th className="p-5">Date</th>
                                        <th className="p-5">Commander</th>
                                        <th className="p-5">Score</th>
                                        <th className="p-5">CAPA</th>
                                        <th className="p-5 pr-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {history.map((h, i) => (
                                        <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                            <td className="p-5 pl-6">
                                                <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border ${h.eventType === 'Real Emergency' ? 'bg-red-900/30 text-red-400 border-red-500/30' : 'bg-blue-900/20 text-blue-400 border-blue-500/30'}`}>
                                                    {h.eventType || 'Mock Drill'}
                                                </span>
                                            </td>
                                            <td className="p-5 font-mono text-xs text-slate-400 font-bold">{h.docId || 'PENDING'}</td>
                                            <td className="p-5 font-bold text-white">{h.scenario}</td>
                                            <td className="p-5 font-mono text-xs">{h.date}</td>
                                            <td className="p-5 font-medium">{h.commander}</td>
                                            <td className="p-5"><span className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm ${h.score === 100 ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-yellow-950 text-yellow-400 border border-yellow-900'}`}>{h.score}%</span></td>
                                            <td className="p-5"><span className="bg-slate-800/80 text-slate-300 font-bold px-3 py-1 rounded-lg text-[10px] border border-slate-700">{h.capa ? h.capa.length : 0} Items</span></td>
                                            <td className="p-5 pr-6 text-right flex justify-end gap-3">
                                                <button onClick={() => generatePDF(h)} className="text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-600 px-3 py-1.5 rounded-lg border border-blue-500/30 transition-colors" title="Download Report"><i className="fas fa-file-pdf"></i></button>
                                                {session.role === 'Owner' && <button onClick={() => deleteRecord(h, i)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors" title="Delete"><i className="fas fa-trash"></i></button>}
                                            </td>
                                        </tr>
                                    ))}
                                    {history.length === 0 && <tr><td colSpan="8" className="p-10 text-center italic text-slate-500">No response records found in database.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* DRILL MODAL (ACTIVE DRILL) */}
            {selectedDrill && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 no-print animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-slate-900 w-full max-w-5xl rounded-3xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">

                        <div className={`p-6 border-b flex justify-between items-center rounded-t-3xl ${form.eventType === 'Real Emergency' ? 'bg-red-950/40 border-red-900' : 'bg-slate-800/50 border-slate-700'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center text-2xl shadow-inner ${selectedDrill.color} ${form.eventType === 'Real Emergency' ? 'animate-pulse' : ''}`}>
                                    <i className={`fas ${selectedDrill.icon}`}></i>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-white">{selectedDrill.title}</h2>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Protocol Initiation</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 shadow-inner">
                                    <button onClick={() => setForm({ ...form, eventType: 'Mock Drill' })} className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${form.eventType === 'Mock Drill' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Mock Drill</button>
                                    <button onClick={() => setForm({ ...form, eventType: 'Real Emergency' })} className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${form.eventType === 'Real Emergency' ? 'bg-red-600 text-white shadow-lg shadow-red-900/50' : 'text-slate-500 hover:text-white'}`}>Real Emergency</button>
                                </div>
                                <button onClick={() => setSelectedDrill(null)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-10 h-10 rounded-xl flex items-center justify-center transition-colors"><i className="fas fa-times text-xl"></i></button>
                            </div>
                        </div>

                        <div className="p-8 overflow-y-auto custom-scroll space-y-8 flex-1">

                            {/* Context */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                <div><label className="text-[10px] uppercase text-slate-500 font-bold block mb-2 tracking-widest ml-1">Site ID</label><select className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500" value={form.siteId} onChange={e => setForm({ ...form, siteId: e.target.value })}><option value="">Select Site...</option>{sites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}</select></div>
                                <div><label className="text-[10px] uppercase text-slate-500 font-bold block mb-2 tracking-widest ml-1">Commander</label><select className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500" value={form.commander} onChange={e => setForm({ ...form, commander: e.target.value })} disabled={!form.siteId}><option value="">Select...</option>{availableCommanders.map(u => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)}</select></div>
                                <div><label className="text-[10px] uppercase text-slate-500 font-bold block mb-2 tracking-widest ml-1">Date</label><input type="date" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500 font-mono" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                                <div><label className="text-[10px] uppercase text-slate-500 font-bold block mb-2 tracking-widest ml-1">Time</label><input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500 font-mono" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
                                <div className="col-span-1 md:col-start-2"><label className="text-[10px] uppercase text-pink-400 font-bold block mb-2 tracking-widest ml-1">Evac Time (min)</label><input type="number" className="w-full bg-slate-950 border border-pink-900/50 rounded-xl p-3 text-sm text-white outline-none focus:border-pink-500 text-center font-bold" value={form.evacTime} onChange={e => setForm({ ...form, evacTime: e.target.value })} /></div>
                                <div className="col-span-1"><label className="text-[10px] uppercase text-blue-400 font-bold block mb-2 tracking-widest ml-1">ERT Response (min)</label><input type="number" className="w-full bg-slate-950 border border-blue-900/50 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500 text-center font-bold" value={form.ertResponseTime} onChange={e => setForm({ ...form, ertResponseTime: e.target.value })} /></div>
                            </div>

                            {/* Teams & Checklist */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                    <h3 className="font-bold text-orange-400 text-xs mb-4 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-users-viewfinder"></i> Emergency Teams</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {EMERGENCY_TEAMS.map((team, idx) => (
                                            <label key={idx} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${teamChecks[idx] ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}>
                                                <div className="relative flex items-center">
                                                    <input type="checkbox" className="peer hidden" checked={!!teamChecks[idx]} onChange={() => toggleCheck(idx, setTeamChecks)} />
                                                    <div className="w-5 h-5 rounded border border-slate-600 bg-slate-900 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 flex items-center justify-center transition-colors">
                                                        {teamChecks[idx] && <i className="fas fa-check text-[10px] text-white"></i>}
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${teamChecks[idx] ? 'text-emerald-400' : 'text-slate-400'}`}>{team}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                    <h3 className="font-bold text-blue-400 text-xs mb-4 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-list-check"></i> Procedural Checklist</h3>
                                    <div className="space-y-2">
                                        {selectedDrill.checklist.map((item, idx) => (
                                            <label key={idx} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checks[idx] ? 'bg-blue-900/10 border-blue-500/30' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}>
                                                <div className="relative flex items-center mt-0.5">
                                                    <input type="checkbox" className="peer hidden" checked={!!checks[idx]} onChange={() => toggleCheck(idx, setChecks)} />
                                                    <div className="w-5 h-5 rounded border border-slate-600 bg-slate-900 peer-checked:bg-blue-500 peer-checked:border-blue-500 flex items-center justify-center transition-colors">
                                                        {checks[idx] && <i className="fas fa-check text-[10px] text-white"></i>}
                                                    </div>
                                                </div>
                                                <span className={`text-sm font-medium ${checks[idx] ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{item}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Action Log */}
                            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2"><i className="fas fa-stopwatch"></i> Chronological Action Log</h4>
                                <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-950 mb-4">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-900 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                            <tr><th className="p-3 pl-4 w-32">Time</th><th className="p-3 w-1/2">Action Taken</th><th className="p-3">Observation</th><th className="w-10"></th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {actionLog.map((row, i) => (
                                                <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                                    <td className="p-2 pl-4"><input type="time" value={row.time} onChange={e => updateActionRow(i, 'time', e.target.value)} className="w-full bg-transparent border-none outline-none text-white font-mono text-xs" /></td>
                                                    <td className="p-2"><input value={row.action} onChange={e => updateActionRow(i, 'action', e.target.value)} className="w-full bg-transparent border-none outline-none text-white font-medium text-sm" placeholder="Describe the event..." /></td>
                                                    <td className="p-2"><input value={row.observation} onChange={e => updateActionRow(i, 'observation', e.target.value)} className="w-full bg-transparent border-none outline-none text-slate-400 text-sm" placeholder="Notes..." /></td>
                                                    <td className="p-2 text-center"><button onClick={() => removeActionRow(i)} className="text-red-500 hover:text-white bg-red-500/10 hover:bg-red-600 w-7 h-7 rounded-lg transition-colors flex items-center justify-center"><i className="fas fa-times"></i></button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button onClick={addActionRow} className="bg-emerald-900/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"><i className="fas fa-plus"></i> Add Entry</button>
                            </div>

                            {/* Debrief */}
                            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                <h3 className="font-bold text-purple-400 text-xs uppercase tracking-widest mb-4 flex items-center gap-2"><i className="fas fa-bullhorn"></i> Post-Event Debrief & CAPA</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                                    <div className="col-span-1"><label className="text-[10px] uppercase text-slate-500 font-bold block mb-2 tracking-widest ml-1">Head Count</label><input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-purple-500 font-mono" value={form.headCount} onChange={e => setForm({ ...form, headCount: e.target.value })} placeholder="e.g. 45" /></div>
                                    <div className="col-span-3"><label className="text-[10px] uppercase text-slate-500 font-bold block mb-2 tracking-widest ml-1">Debrief Notes</label><textarea rows="2" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white outline-none focus:border-purple-500 resize-none custom-scroll" value={form.debrief} onChange={e => setForm({ ...form, debrief: e.target.value })} placeholder="Record observations, failures, and discussion points..."></textarea></div>
                                </div>

                                {/* CAPA SECTION */}
                                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800">
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Improvement Actions (CAPA)</label>
                                        <button onClick={addCapa} className="bg-purple-900/30 text-purple-400 hover:bg-purple-600 hover:text-white px-3 py-1.5 rounded-lg border border-purple-500/30 text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus mr-1"></i> Add Action</button>
                                    </div>
                                    <div className="space-y-3">
                                        {form.capa.map((c, i) => (
                                            <div key={i} className="flex gap-3 items-center bg-slate-900 p-2 rounded-lg border border-slate-700">
                                                <input value={c.action} onChange={e => updateCapa(i, 'action', e.target.value)} placeholder="Action Description..." className="flex-1 bg-transparent border-none outline-none text-sm text-white px-2" />
                                                <select value={c.owner} onChange={e => updateCapa(i, 'owner', e.target.value)} className="w-48 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500">
                                                    <option value="">Assign Owner...</option>
                                                    {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                                </select>
                                                <input type="date" value={c.due} onChange={e => updateCapa(i, 'due', e.target.value)} className="w-36 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-mono" />
                                                <button onClick={() => removeCapa(i)} className="text-red-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-600 transition-colors"><i className="fas fa-times"></i></button>
                                            </div>
                                        ))}
                                        {form.capa.length === 0 && <div className="text-center text-xs text-slate-600 italic py-4 border-2 border-dashed border-slate-800 rounded-xl">No corrective actions logged.</div>}
                                    </div>
                                </div>
                            </div>

                        </div>
                        <div className="p-6 border-t border-slate-800 flex justify-between items-center bg-slate-900 rounded-b-3xl flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Protocol Integrity</div>
                                <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-white font-bold text-xs font-mono">
                                    <span className="text-emerald-400">{Object.values(checks).filter(Boolean).length}</span> / {selectedDrill.checklist.length}
                                </div>
                            </div>
                            <button onClick={handleSubmit} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-10 rounded-xl shadow-lg shadow-blue-900/50 transition-transform active:scale-95 uppercase tracking-widest text-sm flex items-center gap-2">
                                <i className="fas fa-cloud-arrow-up"></i> Submit Final Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- PRINT OVERLAY --- */}
            {printData && (
                <div className="print-overlay p-8 bg-white text-black min-h-screen">
                    <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                        <div>
                            <div className="text-sm text-gray-500 font-bold mb-1 uppercase tracking-widest">ISO 45001 OHSMS - Document Control</div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">{printData.eventType || 'Mock Drill'} Report</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold font-mono">Document ID: {printData.docId}</p>
                            <p className="text-sm font-bold mt-1 uppercase">Date: {printData.date}</p>
                        </div>
                    </div>

                    <div className="mb-6 border border-black p-4 bg-gray-50">
                        <table className="w-full text-sm border-none">
                            <tbody>
                                <tr>
                                    <td className="w-[15%] font-bold py-1 border-b border-gray-300">Scenario:</td>
                                    <td colSpan="3" className="text-lg font-bold py-1 border-b border-gray-300">{printData.scenario}</td>
                                </tr>
                                <tr>
                                    <td className="w-[15%] font-bold py-2 border-b border-gray-300">Site / Location:</td>
                                    <td className="w-[35%] py-2 border-b border-gray-300">{printData.siteId}</td>
                                    <td className="w-[15%] font-bold py-2 pl-4 border-b border-gray-300">Time:</td>
                                    <td className="w-[35%] py-2 border-b border-gray-300 font-mono">{printData.time}</td>
                                </tr>
                                <tr>
                                    <td className="font-bold py-2 border-none">Commander:</td>
                                    <td colSpan="3" className="py-2 border-none font-bold text-base">{printData.commander}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Execution Metrics</h2>
                    <table className="w-full text-sm border-collapse border border-black mb-6">
                        <tbody>
                            <tr>
                                <td className="font-bold border border-black p-2 bg-gray-100 w-[20%]">Evacuation Time:</td>
                                <td className="border border-black p-2 font-mono">{printData.evacTime ? `${printData.evacTime} mins` : '-'}</td>
                                <td className="font-bold border border-black p-2 bg-gray-100 w-[20%]">ERT Response:</td>
                                <td className="border border-black p-2 font-mono">{printData.ertResponseTime ? `${printData.ertResponseTime} mins` : '-'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Teams Activated</h2>
                    <table className="w-full text-sm border-none mb-6">
                        <tbody>
                            <tr>
                                {EMERGENCY_TEAMS.map((t, i) => (
                                    <td key={i} className="w-[25%] p-2 border-none">
                                        <span className="font-bold mr-2 text-lg">{printData.teamsAlerted && printData.teamsAlerted[i] ? '☑' : '☐'}</span> {t}
                                    </td>
                                )).reduce((result, item, index) => {
                                    if (index % 4 === 0) result.push([]);
                                    result[result.length - 1].push(item);
                                    return result;
                                }, []).map((row, i) => <tr key={i}>{row}</tr>)}
                            </tr>
                        </tbody>
                    </table>

                    <div className="page-break-inside-avoid mb-6">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3. Procedural Execution Checklist</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 w-[15%] text-center">Status</th>
                                    <th className="border border-black p-2 text-left">Protocol Item</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.scenarioDef ? printData.scenarioDef.checklist.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="border border-black p-2 text-center font-bold font-mono">{printData.checklistStatus && printData.checklistStatus[idx] ? 'PASS' : 'FAIL'}</td>
                                        <td className="border border-black p-2">{item}</td>
                                    </tr>
                                )) : <tr><td colSpan="2" className="p-4 italic">No checklist data found.</td></tr>}
                                <tr>
                                    <td colSpan="2" className="text-right font-bold p-2 border border-black bg-gray-100">Overall Protocol Score: {printData.score}%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="page-break"></div>

                    <div className="mb-6">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">4. Chronological Action Log</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 w-[15%] text-left">Time</th>
                                    <th className="border border-black p-2 w-[40%] text-left">Action Taken</th>
                                    <th className="border border-black p-2 text-left">Observation / Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.actionLog && printData.actionLog.length > 0 ? printData.actionLog.map((r, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-2 font-mono">{r.time}</td>
                                        <td className="border border-black p-2 font-bold">{r.action}</td>
                                        <td className="border border-black p-2">{r.observation}</td>
                                    </tr>
                                )) : <tr><td colSpan="3" className="border border-black p-4 italic text-center">No action logs recorded.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 page-break-inside-avoid">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">5. Debrief & CAPA Plan</h2>
                        <div className="border border-black p-4 mb-4 bg-gray-50 text-sm">
                            <strong>Headcount Recorded:</strong> <span className="font-mono ml-2">{printData.headCount || 'Not Documented'}</span><br /><br />
                            <strong>Debrief Notes:</strong><br />
                            <div className="whitespace-pre-wrap mt-2">{printData.debrief || 'None recorded.'}</div>
                        </div>

                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 text-left">Action Required (CAPA)</th>
                                    <th className="border border-black p-2 text-left w-[25%]">Owner</th>
                                    <th className="border border-black p-2 w-[15%] text-center">Due Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.capa && printData.capa.length > 0 ? printData.capa.map((c, i) => (
                                    <tr key={i}>
                                        <td className="border border-black p-2 font-medium">{c.action}</td>
                                        <td className="border border-black p-2 font-bold">{c.owner}</td>
                                        <td className="border border-black p-2 text-center font-mono">{c.due}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="3" className="border border-black p-4 text-center italic">No CAPA items required.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <table className="w-full border-none mt-20 text-sm page-break-inside-avoid">
                        <tbody>
                            <tr>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Incident Commander Signature</td>
                                <td className="w-[10%] border-none"></td>
                                <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">EHS Manager Signature</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
                </div>
            )}

        </div>
    );
}