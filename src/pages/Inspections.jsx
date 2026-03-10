import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, push, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';

const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Bi-Annually', 'Annually'];
const STATUSES = ['Draft', 'Active', 'Inactive'];

// --- DATE MATH UTILITIES ---
const calculateNextDueDate = (lastDateStr, frequency, createdDateStr) => {
    const baseDate = lastDateStr ? new Date(lastDateStr) : new Date(createdDateStr || Date.now());
    if (isNaN(baseDate.getTime())) return new Date(); // Fallback

    const nextDate = new Date(baseDate);
    switch (frequency) {
        case 'Daily': nextDate.setDate(nextDate.getDate() + 1); break;
        case 'Weekly': nextDate.setDate(nextDate.getDate() + 7); break;
        case 'Monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
        case 'Quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
        case 'Bi-Annually': nextDate.setMonth(nextDate.getMonth() + 6); break;
        case 'Annually': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
        default: nextDate.setMonth(nextDate.getMonth() + 1); // Default Monthly
    }
    return nextDate;
};

export default function Inspections() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('calendar'); // 'calendar' | 'builder' | 'execute' | 'history'

    const [templates, setTemplates] = useState([]);
    const [records, setRecords] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [siteFilter, setSiteFilter] = useState('All');

    // Calendar State
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Builder State
    const [editTemplate, setEditTemplate] = useState(null);

    // Execution State
    const [executingTask, setExecutingTask] = useState(null); // The scheduled task we are doing
    const [inspectionForm, setInspectionForm] = useState({}); // Stores answers & observations

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';
        const isGlobal = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        if (!isGlobal && ctxSite === 'All') ctxSite = sess.assignedSite;

        setSiteFilter(ctxSite);

        const fetchData = async () => {
            try {
                const snap = await get(ref(rtdb, `organizations/${sess.orgId}`));
                if (snap.exists()) {
                    const data = snap.val();
                    if (data.inspectionTemplates) setTemplates(Object.entries(data.inspectionTemplates).map(([k, v]) => ({ firebaseKey: k, ...v })));
                    if (data.inspectionRecords) setRecords(Object.entries(data.inspectionRecords).map(([k, v]) => ({ firebaseKey: k, ...v })));
                    if (data.sites) setSites(Object.keys(data.sites).map(key => ({ code: data.sites[key].code || key, name: data.sites[key].name || key })));
                    if (data.users) setUsers(Object.entries(data.users).map(([k, v]) => ({ id: k, ...v })).filter(u => u.status !== 'Inactive'));
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [navigate, location, view]);

    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager'].includes(session?.role);

    // --- SCHEDULING ENGINE ---
    // Calculates what is due based on templates and past records
    const scheduledTasks = useMemo(() => {
        const tasks = [];
        templates.filter(t => t.status === 'Active' && (siteFilter === 'All' || t.siteId === siteFilter || t.siteId === 'GLOBAL')).forEach(t => {
            // Find most recent completed record for this template
            const pastRecords = records.filter(r => r.templateId === t.firebaseKey).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
            const lastRecord = pastRecords[0];

            const nextDue = calculateNextDueDate(lastRecord?.completedAt, t.frequency, t.createdAt);

            tasks.push({
                templateId: t.firebaseKey,
                title: t.title,
                siteId: t.siteId,
                frequency: t.frequency,
                dueDate: nextDue,
                dueString: nextDue.toISOString().split('T')[0],
                lastCompleted: lastRecord ? lastRecord.completedAt : 'Never',
                template: t
            });
        });
        return tasks.sort((a, b) => a.dueDate - b.dueDate);
    }, [templates, records, siteFilter]);

    // --- CALENDAR LOGIC ---
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const renderCalendar = () => {
        let days = [];
        for (let i = 0; i < firstDayOfMonth; i++) days.push(<div key={`empty-${i}`} className="p-2 border border-slate-800/50 bg-slate-900/20 min-h-[100px]"></div>);

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const tasksToday = scheduledTasks.filter(t => t.dueString === dateStr);
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            days.push(
                <div key={day} className={`p-2 border border-slate-700 min-h-[100px] flex flex-col ${isToday ? 'bg-blue-900/20' : 'bg-slate-900/60'}`}>
                    <div className={`text-right text-xs font-bold mb-1 ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>{day}</div>
                    <div className="flex-1 space-y-1 overflow-y-auto custom-scroll pr-1">
                        {tasksToday.map((t, idx) => {
                            const isOverdue = new Date(t.dueString) < new Date(new Date().toISOString().split('T')[0]);
                            return (
                                <div key={idx} onClick={() => startInspection(t)} className={`text-[9px] p-1.5 rounded cursor-pointer truncate font-bold shadow-sm transition-transform hover:scale-105 ${isOverdue ? 'bg-red-500 text-white' : 'bg-lime-500 text-slate-950'}`} title={t.title}>
                                    {t.title}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
        return days;
    };

    // --- TEMPLATE BUILDER HANDLERS ---
    const saveTemplate = async () => {
        if (!editTemplate.title || !editTemplate.siteId) return alert("Title and Site are required.");
        if (editTemplate.fields.length === 0) return alert("Please add at least one inspection question.");

        try {
            const payload = { ...editTemplate, updatedBy: session.name, updatedAt: new Date().toISOString() };
            if (!payload.createdAt) payload.createdAt = new Date().toISOString();

            if (editTemplate.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/inspectionTemplates/${editTemplate.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/inspectionTemplates`), payload);
            }
            alert("Inspection Template Saved!");
            setView('calendar');
        } catch (e) { alert("Save failed: " + e.message); }
    };

    // --- EXECUTION HANDLERS ---
    const startInspection = (task) => {
        setExecutingTask(task);
        // Initialize form state mapping
        const initForm = {};
        task.template.fields.forEach(f => {
            initForm[f.id] = { answer: '', observation: '', raiseCapa: false, capaOwner: '', capaDue: '' };
        });
        setInspectionForm(initForm);
        setView('execute');
    };

    const submitInspection = async () => {
        try {
            const completedAt = new Date().toISOString();

            // 1. Extract Observations to create CAPAs
            const generatedCapas = [];
            executingTask.template.fields.forEach(f => {
                const response = inspectionForm[f.id];
                if (response.raiseCapa && response.observation) {
                    generatedCapas.push({
                        act: `[Inspection: ${executingTask.title}] ${f.label} - ${response.observation}`,
                        siteId: executingTask.siteId,
                        own: response.capaOwner || 'Unassigned',
                        due: response.capaDue || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        status: 'Open',
                        source: 'Inspection'
                    });
                }
            });

            // 2. Save Inspection Record
            const recordPayload = {
                templateId: executingTask.templateId,
                templateTitle: executingTask.title,
                siteId: executingTask.siteId,
                inspector: session.name,
                completedAt: completedAt,
                responses: inspectionForm
            };
            await push(ref(rtdb, `organizations/${session.orgId}/inspectionRecords`), recordPayload);

            // 3. Save CAPAs (if any) to a central node or embed them. We will embed them in the main "capaRegister" if it exists, or local.
            // For simplicity in this module, we push to a generalized CAPA node or standard incidents.
            if (generatedCapas.length > 0) {
                // Here we simulate pushing to the central CAPA DB you use in Incident/Risk.
                // Assuming you have an 'independentCapas' node or similar.
                const capaPromises = generatedCapas.map(c => push(ref(rtdb, `organizations/${session.orgId}/standaloneCapas`), c));
                await Promise.all(capaPromises);
                alert(`Inspection Completed! ${generatedCapas.length} Corrective Actions (CAPAs) were automatically generated.`);
            } else {
                alert("Inspection Completed Successfully!");
            }

            setView('calendar');
        } catch (e) {
            alert("Failed to submit inspection: " + e.message);
        }
    };


    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase"><div className="w-8 h-8 border-2 border-slate-800 border-t-lime-500 rounded-full animate-spin mr-3"></div> Loading Engine...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-lime-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-lime-500 to-emerald-600 flex items-center justify-center text-slate-950 font-bold shadow-lg"><i className="fas fa-clipboard-check"></i></div>
                    <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Inspection Manager</h1>
                </div>
                <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-inner">
                    <button onClick={() => setView('calendar')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'calendar' ? 'bg-lime-500 text-slate-950 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-calendar-alt mr-1"></i> Schedule</button>
                    <button onClick={() => setView('history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'history' ? 'bg-lime-500 text-slate-950 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-history mr-1"></i> History</button>
                    {canEdit && <button onClick={() => { setEditTemplate({ id: '', title: '', desc: '', siteId: siteFilter === 'All' ? '' : siteFilter, frequency: 'Monthly', status: 'Draft', fields: [] }); setView('builder'); }} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${view === 'builder' ? 'bg-lime-500 text-slate-950 shadow-lg' : 'text-lime-400 hover:text-lime-300 hover:bg-slate-800'}`}><i className="fas fa-tools mr-1"></i> Form Builder</button>}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">

                    {/* --- CALENDAR VIEW --- */}
                    {view === 'calendar' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <h2 className="text-3xl font-bold text-white mb-1">Inspection Schedule</h2>
                                    <p className="text-sm text-slate-400">Auto-generated due dates based on form frequency.</p>
                                </div>
                                <div className="flex gap-4 items-center">
                                    <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-900 border border-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl outline-none">
                                        {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                        {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl p-1 shadow-inner">
                                        <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 flex items-center justify-center"><i className="fas fa-chevron-left"></i></button>
                                        <span className="font-bold text-white uppercase tracking-widest text-sm w-32 text-center">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                                        <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 flex items-center justify-center"><i className="fas fa-chevron-right"></i></button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
                                <div className="grid grid-cols-7 bg-slate-950 border-b border-slate-800">
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                        <div key={d} className="p-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">{d}</div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 auto-rows-fr">
                                    {renderCalendar()}
                                </div>
                            </div>

                            {/* Overdue/Upcoming Quick List */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                                <div className="bg-slate-900/50 rounded-2xl border border-red-500/30 p-6 shadow-lg">
                                    <h3 className="text-red-400 font-bold uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><i className="fas fa-exclamation-circle"></i> Overdue / Action Required</h3>
                                    <div className="space-y-2">
                                        {scheduledTasks.filter(t => new Date(t.dueString) < new Date(new Date().toISOString().split('T')[0])).map((t, i) => (
                                            <div key={i} className="flex justify-between items-center bg-red-950/20 border border-red-900/50 p-3 rounded-xl">
                                                <div>
                                                    <div className="font-bold text-slate-200 text-sm">{t.title}</div>
                                                    <div className="text-[10px] text-red-400">Due: {t.dueString} • Site: {t.siteId}</div>
                                                </div>
                                                <button onClick={() => startInspection(t)} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition">Start</button>
                                            </div>
                                        ))}
                                        {scheduledTasks.filter(t => new Date(t.dueString) < new Date(new Date().toISOString().split('T')[0])).length === 0 && <p className="text-slate-500 text-xs italic">No overdue inspections.</p>}
                                    </div>
                                </div>
                                <div className="bg-slate-900/50 rounded-2xl border border-lime-500/30 p-6 shadow-lg">
                                    <h3 className="text-lime-400 font-bold uppercase tracking-widest text-xs mb-4 flex items-center gap-2"><i className="fas fa-clock"></i> Upcoming (Next 7 Days)</h3>
                                    <div className="space-y-2">
                                        {scheduledTasks.filter(t => {
                                            const due = new Date(t.dueString);
                                            const today = new Date(new Date().toISOString().split('T')[0]);
                                            const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
                                            return due >= today && due <= nextWeek;
                                        }).map((t, i) => (
                                            <div key={i} className="flex justify-between items-center bg-lime-950/20 border border-lime-900/50 p-3 rounded-xl">
                                                <div>
                                                    <div className="font-bold text-slate-200 text-sm">{t.title}</div>
                                                    <div className="text-[10px] text-lime-400">Due: {t.dueString} • Site: {t.siteId}</div>
                                                </div>
                                                <button onClick={() => startInspection(t)} className="bg-lime-600 hover:bg-lime-500 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition">Start Early</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- TEMPLATE BUILDER VIEW --- */}
                    {view === 'builder' && editTemplate && (
                        <div className="max-w-4xl mx-auto bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl animate-in zoom-in-95 duration-300">
                            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                                <h2 className="text-2xl font-bold text-lime-400 flex items-center gap-3"><i className="fas fa-tools"></i> {editTemplate.firebaseKey ? 'Edit Form Template' : 'New Inspection Form'}</h2>
                                <button onClick={() => setView('calendar')} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-8">
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Form Title</label>
                                    <input value={editTemplate.title} onChange={e => setEditTemplate({ ...editTemplate, title: e.target.value })} placeholder="e.g. Daily Forklift Pre-Use Check" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500 font-bold" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Description / Instructions</label>
                                    <textarea value={editTemplate.desc} onChange={e => setEditTemplate({ ...editTemplate, desc: e.target.value })} placeholder="Instructions for the inspector..." rows="2" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500 resize-none text-sm"></textarea>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Target Site</label>
                                    <select value={editTemplate.siteId} onChange={e => setEditTemplate({ ...editTemplate, siteId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500">
                                        <option value="">Select Site...</option>
                                        <option value="GLOBAL">GLOBAL (All Sites)</option>
                                        {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Inspection Frequency</label>
                                    <select value={editTemplate.frequency} onChange={e => setEditTemplate({ ...editTemplate, frequency: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-lime-500">
                                        {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Form Status</label>
                                    <select value={editTemplate.status} onChange={e => setEditTemplate({ ...editTemplate, status: e.target.value })} className={`w-full bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none font-bold ${editTemplate.status === 'Active' ? 'text-lime-400' : 'text-slate-400'}`}>
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-2">
                                    <h3 className="text-sm font-bold text-white uppercase tracking-widest"><i className="fas fa-list-ul text-blue-400 mr-2"></i> Form Questions</h3>
                                    <button onClick={() => setEditTemplate({ ...editTemplate, fields: [...editTemplate.fields, { id: Date.now().toString(), label: '', type: 'Pass/Fail' }] })} className="text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-500/30 font-bold uppercase transition-colors"><i className="fas fa-plus mr-1"></i> Add Question</button>
                                </div>

                                <div className="space-y-3">
                                    {editTemplate.fields.map((field, idx) => (
                                        <div key={field.id} className="flex gap-3 items-center bg-slate-900 p-3 rounded-xl border border-slate-700 group">
                                            <div className="text-slate-600 font-bold w-6 text-center">{idx + 1}.</div>
                                            <input value={field.label} onChange={e => { const n = [...editTemplate.fields]; n[idx].label = e.target.value; setEditTemplate({ ...editTemplate, fields: n }); }} placeholder="Enter check requirement (e.g. 'Are fire exits clear?')" className="flex-1 bg-transparent border-b border-slate-600 focus:border-lime-500 outline-none text-sm text-white px-2 py-1" />
                                            <select value={field.type} onChange={e => { const n = [...editTemplate.fields]; n[idx].type = e.target.value; setEditTemplate({ ...editTemplate, fields: n }); }} className="w-32 bg-slate-950 border border-slate-700 rounded-lg text-xs p-2 text-slate-300 outline-none">
                                                <option>Pass/Fail</option>
                                                <option>Text Input</option>
                                                <option>Number</option>
                                            </select>
                                            <button onClick={() => { const n = editTemplate.fields.filter((_, i) => i !== idx); setEditTemplate({ ...editTemplate, fields: n }); }} className="w-8 h-8 rounded bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center"><i className="fas fa-trash"></i></button>
                                        </div>
                                    ))}
                                    {editTemplate.fields.length === 0 && <div className="text-center p-8 text-slate-500 italic border-2 border-dashed border-slate-700 rounded-xl">No questions added yet.</div>}
                                </div>
                            </div>

                            <div className="flex justify-end gap-4 pt-8 mt-4 border-t border-slate-800">
                                <button onClick={() => setView('calendar')} className="px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition">Cancel</button>
                                <button onClick={saveTemplate} className="px-10 py-3 bg-lime-500 text-slate-950 font-black uppercase tracking-widest rounded-xl hover:bg-lime-400 transition shadow-lg shadow-lime-500/20"><i className="fas fa-save mr-2"></i> Save Template</button>
                            </div>
                        </div>
                    )}

                    {/* --- EXECUTION VIEW (FILLING THE FORM) --- */}
                    {view === 'execute' && executingTask && (
                        <div className="max-w-4xl mx-auto bg-slate-900/80 p-6 md:p-10 rounded-3xl border border-blue-500/30 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
                            <div className="mb-8 border-b border-slate-800 pb-6 text-center">
                                <span className="bg-blue-900/30 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3 inline-block">Active Inspection</span>
                                <h2 className="text-3xl font-black text-white mb-2">{executingTask.title}</h2>
                                <p className="text-slate-400 text-sm">Site: <strong className="text-white">{executingTask.siteId}</strong> | Frequency: <strong className="text-white">{executingTask.frequency}</strong></p>
                                {executingTask.template.desc && <p className="mt-4 text-sm text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 italic">{executingTask.template.desc}</p>}
                            </div>

                            <div className="space-y-8 mb-10">
                                {executingTask.template.fields.map((f, idx) => (
                                    <div key={f.id} className="bg-slate-950/50 p-6 rounded-2xl border border-slate-700 shadow-inner">
                                        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-4">
                                            <h4 className="text-base font-bold text-white flex-1"><span className="text-blue-500 mr-2">{idx + 1}.</span> {f.label}</h4>

                                            {/* Answer Input based on Type */}
                                            <div className="flex-shrink-0">
                                                {f.type === 'Pass/Fail' && (
                                                    <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                                                        <button onClick={() => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], answer: 'Pass' } })} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${inspectionForm[f.id]?.answer === 'Pass' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><i className="fas fa-check mr-1"></i> Pass</button>
                                                        <div className="w-px bg-slate-700"></div>
                                                        <button onClick={() => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], answer: 'Fail' } })} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${inspectionForm[f.id]?.answer === 'Fail' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><i className="fas fa-times mr-1"></i> Fail</button>
                                                        <div className="w-px bg-slate-700"></div>
                                                        <button onClick={() => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], answer: 'N/A' } })} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${inspectionForm[f.id]?.answer === 'N/A' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>N/A</button>
                                                    </div>
                                                )}
                                                {f.type === 'Text Input' && (
                                                    <input value={inspectionForm[f.id]?.answer || ''} onChange={e => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], answer: e.target.value } })} placeholder="Enter details..." className="w-64 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500" />
                                                )}
                                                {f.type === 'Number' && (
                                                    <input type="number" value={inspectionForm[f.id]?.answer || ''} onChange={e => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], answer: e.target.value } })} placeholder="0.00" className="w-32 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500 text-center font-mono" />
                                                )}
                                            </div>
                                        </div>

                                        {/* Observation & CAPA Block (Auto-opens on Fail, or manual) */}
                                        {(inspectionForm[f.id]?.answer === 'Fail' || inspectionForm[f.id]?.observation !== undefined) && (
                                            <div className="mt-4 bg-orange-950/20 border border-orange-500/30 p-4 rounded-xl animate-in fade-in slide-in-from-top-2">
                                                <label className="text-[10px] uppercase font-bold text-orange-400 block mb-2"><i className="fas fa-exclamation-triangle mr-1"></i> Defect / Observation Notes</label>
                                                <textarea value={inspectionForm[f.id]?.observation || ''} onChange={e => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], observation: e.target.value } })} placeholder="Describe the issue found..." rows="2" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white outline-none focus:border-orange-500 resize-none mb-3"></textarea>

                                                <label className="flex items-center gap-2 cursor-pointer mb-3">
                                                    <input type="checkbox" checked={inspectionForm[f.id]?.raiseCapa || false} onChange={e => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], raiseCapa: e.target.checked } })} className="w-4 h-4 accent-orange-500" />
                                                    <span className="text-xs font-bold text-white">Raise Corrective Action (CAPA)</span>
                                                </label>

                                                {inspectionForm[f.id]?.raiseCapa && (
                                                    <div className="flex gap-4 p-3 bg-slate-900 rounded-lg border border-slate-700">
                                                        <div className="flex-1">
                                                            <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Assign To</label>
                                                            <UserSelect users={users} value={inspectionForm[f.id]?.capaOwner || ''} onChange={v => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], capaOwner: v } })} disabled={false} />
                                                        </div>
                                                        <div className="w-1/3">
                                                            <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Due Date</label>
                                                            <input type="date" value={inspectionForm[f.id]?.capaDue || ''} onChange={e => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], capaDue: e.target.value } })} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-orange-500 font-mono" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {inspectionForm[f.id]?.answer !== 'Fail' && inspectionForm[f.id]?.observation === undefined && (
                                            <button onClick={() => setInspectionForm({ ...inspectionForm, [f.id]: { ...inspectionForm[f.id], observation: '' } })} className="text-[10px] text-slate-500 hover:text-orange-400 font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus mr-1"></i> Add Note</button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end gap-4 pt-6 border-t border-slate-800">
                                <button onClick={() => setView('calendar')} className="px-8 py-4 bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-slate-700 transition">Discard</button>
                                <button onClick={submitInspection} className="px-10 py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition flex items-center gap-2"><i className="fas fa-check-double text-lg"></i> Sign & Submit Report</button>
                            </div>
                        </div>
                    )}

                    {/* --- HISTORY VIEW --- */}
                    {view === 'history' && (
                        <div className="max-w-6xl mx-auto space-y-6">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">Inspection Logs</h2>
                                    <p className="text-sm text-slate-400">Historical archive of completed audits.</p>
                                </div>
                            </div>

                            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                        <tr><th className="p-4 pl-6">Date</th><th className="p-4">Inspection Type</th><th className="p-4">Site</th><th className="p-4">Inspector</th><th className="p-4 text-center">Score / Issues</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {records.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).map(r => {
                                            const totalQs = Object.keys(r.responses || {}).length;
                                            const fails = Object.values(r.responses || {}).filter(res => res.answer === 'Fail').length;

                                            return (
                                                <tr key={r.firebaseKey} className="hover:bg-slate-800/40">
                                                    <td className="p-4 pl-6 font-mono text-xs">{new Date(r.completedAt).toLocaleString()}</td>
                                                    <td className="p-4 font-bold text-white">{r.templateTitle}</td>
                                                    <td className="p-4">{r.siteId}</td>
                                                    <td className="p-4 text-xs font-bold text-blue-400"><i className="fas fa-user-circle mr-1"></i> {r.inspector}</td>
                                                    <td className="p-4 text-center">
                                                        {fails > 0
                                                            ? <span className="bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1 rounded-lg text-xs font-bold">{fails} Issues</span>
                                                            : <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg text-xs font-bold">100% Pass</span>
                                                        }
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {records.length === 0 && <tr><td colSpan="5" className="p-8 text-center italic text-slate-500">No inspection history found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}