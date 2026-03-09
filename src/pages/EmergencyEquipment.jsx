import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, get, push, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';

const TYPES = ['Fire Extinguisher', 'First Aid Kit', 'AED / Defibrillator', 'Eye Wash Station', 'Spill Kit', 'Evacuation Chair'];
const STATUSES = ['Active', 'Needs Inspection', 'Out of Service', 'Missing'];

export default function EmergencyEquipment() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [equipment, setEquipment] = useState([]);
    const [sites, setSites] = useState([]);
    const [loading, setLoading] = useState(true);

    const [view, setView] = useState('list'); // 'list' | 'form' | 'inspect'
    const [siteFilter, setSiteFilter] = useState('All');

    const [formData, setFormData] = useState({
        id: '', siteId: '', type: 'Fire Extinguisher', location: '', serialNumber: '',
        lastInspection: new Date().toISOString().split('T')[0], nextInspection: '', status: 'Active', notes: ''
    });

    const [inspectData, setInspectData] = useState(null);

    // 1. Fetch Session & Data on Load
    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        setSession(sess);

        const params = new URLSearchParams(location.search);
        let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';

        const isGlobal = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);
        if (!isGlobal && ctxSite === 'All') {
            ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
        }

        setSiteFilter(ctxSite);
        setFormData(prev => ({ ...prev, siteId: ctxSite !== 'All' ? ctxSite : '' }));

        const fetchData = async () => {
            try {
                const snap = await get(ref(rtdb, `organizations/${sess.orgId}`));
                if (snap.exists()) {
                    const data = snap.val();
                    if (data.emergencyEquipment) {
                        setEquipment(Object.entries(data.emergencyEquipment).map(([k, v]) => ({ firebaseKey: k, ...v })));
                    } else {
                        setEquipment([]);
                    }
                    if (data.sites) {
                        setSites(Object.keys(data.sites).map(key => ({ code: data.sites[key].code || key, name: data.sites[key].name || key })));
                    }
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchData();
    }, [navigate, location, view]);

    // 2. Permissions & Filtering
    const isGlobalUser = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const canEdit = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'HSE Rep'].includes(session?.role);

    const visibleEquipment = useMemo(() => {
        return equipment.filter(e => {
            if (!isGlobalUser && session?.assignedSite !== 'GLOBAL' && e.siteId !== session?.assignedSite && !(session?.accessibleSites || []).includes(e.siteId)) return false;
            if (siteFilter !== 'All' && e.siteId !== siteFilter) return false;
            return true;
        });
    }, [equipment, siteFilter, isGlobalUser, session]);

    const stats = useMemo(() => {
        const today = new Date();
        const thirtyDaysFromNow = new Date(today.setDate(today.getDate() + 30));

        let total = visibleEquipment.length;
        let expiringSoon = 0;
        let actionNeeded = 0;

        visibleEquipment.forEach(e => {
            if (e.status === 'Out of Service' || e.status === 'Missing' || e.status === 'Needs Inspection') actionNeeded++;
            else if (e.nextInspection && new Date(e.nextInspection) <= thirtyDaysFromNow) expiringSoon++;
        });

        return { total, expiringSoon, actionNeeded };
    }, [visibleEquipment]);

    // 3. Handlers
    const handleSave = async () => {
        if (!formData.type || !formData.location || !formData.siteId) return alert("Type, Location, and Site are required.");

        try {
            const payload = { ...formData, updatedBy: session.name || session.email, lastUpdated: new Date().toISOString() };
            if (formData.firebaseKey) {
                await update(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment/${formData.firebaseKey}`), payload);
            } else {
                await push(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment`), payload);
            }
            setView('list');
        } catch (e) { alert("Save failed: " + e.message); }
    };

    const handleLogInspection = async () => {
        try {
            const payload = {
                lastInspection: inspectData.date,
                nextInspection: inspectData.nextDate,
                status: inspectData.status,
                notes: inspectData.notes ? `${inspectData.notes} (Inspected by ${session.name})` : `Routine inspection by ${session.name}`,
                updatedBy: session.name,
                lastUpdated: new Date().toISOString()
            };
            await update(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment/${inspectData.firebaseKey}`), payload);
            setView('list');
        } catch (e) { alert("Inspection logging failed: " + e.message); }
    };

    const handleDelete = async (key) => {
        if (!canEdit) return alert("Permission denied.");
        if (window.confirm("Remove this equipment from the registry?")) {
            await remove(ref(rtdb, `organizations/${session.orgId}/emergencyEquipment/${key}`));
            setEquipment(equipment.filter(e => e.firebaseKey !== key));
        }
    };

    const getStatusBadge = (status, nextDate) => {
        if (status === 'Out of Service' || status === 'Missing') return <span className="bg-red-900/30 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest">{status}</span>;

        if (nextDate) {
            const daysLeft = Math.ceil((new Date(nextDate) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysLeft < 0) return <span className="bg-red-900/30 text-red-400 border border-red-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest animate-pulse">EXPIRED</span>;
            if (daysLeft <= 30) return <span className="bg-orange-900/30 text-orange-400 border border-orange-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest">DUE IN {daysLeft}d</span>;
        }
        return <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest">Active</span>;
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-400 animate-pulse font-['Space_Grotesk'] tracking-widest text-xs uppercase"><div className="w-8 h-8 border-2 border-slate-800 border-t-orange-500 rounded-full animate-spin mr-3"></div> Loading Registry...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/ohs-tools?site=${siteFilter}`)} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Tools</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-red-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-fire-extinguisher"></i></div>
                    <h1 className="text-base font-bold text-white hidden md:block uppercase tracking-wide">Emergency Equipment</h1>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-6xl mx-auto animate-in fade-in duration-500 space-y-6 pb-20">

                    {/* Top Metrics */}
                    {view === 'list' && (
                        <>
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">Facility Registry</h2>
                                    <p className="text-sm text-slate-400">Inspection tracking for life-safety apparatus.</p>
                                </div>
                                <div className="flex gap-4 items-center">
                                    <div className="bg-slate-900 border border-slate-700 p-1.5 rounded-xl shadow-inner flex items-center gap-2">
                                        <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); sessionStorage.setItem('isoCurrentSite', e.target.value); }} className="bg-slate-950 text-white text-xs font-bold px-4 py-2 rounded-lg outline-none">
                                            {(isGlobalUser || sites.length > 1) && <option value="All">All Authorized Sites</option>}
                                            {sites.filter(s => isGlobalUser || s.code === session?.assignedSite || (session?.accessibleSites || []).includes(s.code)).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    {canEdit && <button onClick={() => { setFormData({ id: '', siteId: siteFilter === 'All' ? '' : siteFilter, type: 'Fire Extinguisher', location: '', serialNumber: '', lastInspection: new Date().toISOString().split('T')[0], nextInspection: '', status: 'Active', notes: '' }); setView('form'); }} className="bg-gradient-to-tr from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-transform active:scale-95"><i className="fas fa-plus"></i> Add Equipment</button>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-lg flex items-center justify-between border-l-4 border-l-blue-500">
                                    <div><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Total Registered</p><h3 className="text-3xl font-black text-white">{stats.total}</h3></div>
                                    <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 text-xl"><i className="fas fa-clipboard-list"></i></div>
                                </div>
                                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-lg flex items-center justify-between border-l-4 border-l-orange-500">
                                    <div><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Due &lt; 30 Days</p><h3 className="text-3xl font-black text-orange-400">{stats.expiringSoon}</h3></div>
                                    <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-400 text-xl"><i className="fas fa-clock"></i></div>
                                </div>
                                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-lg flex items-center justify-between border-l-4 border-l-red-500">
                                    <div><p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Action Required</p><h3 className="text-3xl font-black text-red-500">{stats.actionNeeded}</h3></div>
                                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 text-xl"><i className="fas fa-exclamation-triangle"></i></div>
                                </div>
                            </div>

                            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                        <tr><th className="p-4 pl-6">Equipment & Site</th><th className="p-4">Location</th><th className="p-4">Last Checked</th><th className="p-4">Status / Next Due</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                        {visibleEquipment.map(e => (
                                            <tr key={e.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-4 pl-6">
                                                    <div className="font-bold text-white flex items-center gap-2">
                                                        {e.type === 'Fire Extinguisher' && <i className="fas fa-fire-extinguisher text-red-400"></i>}
                                                        {e.type === 'First Aid Kit' && <i className="fas fa-medkit text-emerald-400"></i>}
                                                        {e.type === 'AED / Defibrillator' && <i className="fas fa-heartbeat text-red-500"></i>}
                                                        {e.type === 'Eye Wash Station' && <i className="fas fa-eye text-blue-400"></i>}
                                                        {e.type === 'Spill Kit' && <i className="fas fa-fill-drip text-yellow-400"></i>}
                                                        {e.type === 'Evacuation Chair' && <i className="fas fa-wheelchair text-purple-400"></i>}
                                                        {e.type}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5">ID: {e.serialNumber || 'N/A'} | Site: <span className="font-bold text-blue-400">{e.siteId}</span></div>
                                                </td>
                                                <td className="p-4 font-bold text-slate-400">{e.location}</td>
                                                <td className="p-4 font-mono text-xs">{e.lastInspection || 'Unknown'}</td>
                                                <td className="p-4">{getStatusBadge(e.status, e.nextInspection)}</td>
                                                <td className="p-4 pr-6 text-right">
                                                    {canEdit && (
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => { setInspectData({ firebaseKey: e.firebaseKey, type: e.type, location: e.location, date: new Date().toISOString().split('T')[0], nextDate: '', status: 'Active', notes: '' }); setView('inspect'); }} className="bg-emerald-900/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-400 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-check-double mr-1"></i> Inspect</button>
                                                            <button onClick={() => { setFormData(e); setView('form'); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-edit"></i></button>
                                                            <button onClick={() => handleDelete(e.firebaseKey)} className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {visibleEquipment.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-slate-500 italic border-t border-slate-800">No equipment registered for this site filter.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* Registration Form */}
                    {view === 'form' && (
                        <div className="max-w-3xl mx-auto bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl">
                            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                                <h3 className="text-xl font-bold text-white"><i className="fas fa-clipboard-list text-orange-500 mr-2"></i> {formData.firebaseKey ? 'Edit Equipment' : 'Register New Equipment'}</h3>
                                <button onClick={() => setView('list')} className="text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Equipment Type</label>
                                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500">
                                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Site</label>
                                    <select value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500">
                                        <option value="">Select Site...</option>
                                        {sites.filter(s => isGlobalUser || s.code === session?.assignedSite || (session?.accessibleSites || []).includes(s.code)).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Exact Location</label>
                                    <input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Ground Floor Kitchen, Next to Exit A" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Serial / Asset ID (Optional)</label>
                                    <input value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} placeholder="e.g. FE-1042" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Current Status</label>
                                    <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500">
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Date of Last Inspection</label>
                                    <input type="date" value={formData.lastInspection} onChange={e => setFormData({ ...formData, lastInspection: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500 font-mono" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Next Inspection Due Date</label>
                                    <input type="date" value={formData.nextInspection} onChange={e => setFormData({ ...formData, nextInspection: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500 font-mono" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Additional Notes</label>
                                    <textarea rows="2" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Any specific details..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500 resize-none"></textarea>
                                </div>
                            </div>

                            <div className="flex justify-end gap-4 pt-4 border-t border-slate-800">
                                <button onClick={() => setView('list')} className="px-6 py-3 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition">Cancel</button>
                                <button onClick={handleSave} className="px-8 py-3 rounded-xl font-bold bg-orange-600 text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500 transition flex items-center gap-2"><i className="fas fa-save"></i> Save Record</button>
                            </div>
                        </div>
                    )}

                    {/* Quick Inspection Form */}
                    {view === 'inspect' && inspectData && (
                        <div className="max-w-xl mx-auto bg-slate-900/80 p-8 rounded-3xl border border-emerald-500/30 shadow-2xl animate-in zoom-in-95 duration-300">
                            <h3 className="text-2xl font-bold text-emerald-400 mb-2 text-center"><i className="fas fa-clipboard-check mr-2"></i> Log Inspection</h3>
                            <p className="text-center text-slate-400 text-sm mb-8 font-bold">{inspectData.type} @ {inspectData.location}</p>

                            <div className="space-y-6 mb-8">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Inspection Date</label>
                                    <input type="date" value={inspectData.date} onChange={e => setInspectData({ ...inspectData, date: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-emerald-500 font-mono font-bold" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Equipment Status</label>
                                    <select value={inspectData.status} onChange={e => setInspectData({ ...inspectData, status: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-emerald-500 font-bold">
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-emerald-400 block mb-2">Next Due Date (Crucial)</label>
                                    <input type="date" value={inspectData.nextDate} onChange={e => setInspectData({ ...inspectData, nextDate: e.target.value })} className="w-full bg-emerald-950/20 border border-emerald-500/50 rounded-xl p-4 text-emerald-300 outline-none focus:border-emerald-400 font-mono font-bold" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Inspector Notes</label>
                                    <textarea rows="3" value={inspectData.notes} onChange={e => setInspectData({ ...inspectData, notes: e.target.value })} placeholder="e.g. Pressure gauge in green, pin intact..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-emerald-500 resize-none"></textarea>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button onClick={() => setView('list')} className="flex-1 py-4 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition uppercase tracking-widest text-xs">Cancel</button>
                                <button onClick={handleLogInspection} className="flex-[2] py-4 rounded-xl font-bold bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 transition uppercase tracking-widest text-xs flex justify-center items-center gap-2"><i className="fas fa-check-double"></i> Submit Inspection</button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}