import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, push, onValue } from 'firebase/database';
import { rtdb } from '../config/firebase';

const KPICard = ({ title, value, subtext, color, icon }) => (
    <div className={`glass-panel p-6 rounded-xl border-l-4 ${color} relative overflow-hidden transition-transform hover:-translate-y-1 shadow-lg`}>
        <div className="flex justify-between items-start z-10 relative">
            <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-3xl font-black text-white">{value}</h3>
                <p className="text-[10px] text-slate-500 mt-2 font-medium">{subtext}</p>
            </div>
            <div className={`text-2xl opacity-20 p-3 rounded-xl bg-white/5`}>{icon}</div>
        </div>
    </div>
);

export default function Analytics() {
    const navigate = useNavigate();
    const location = useLocation();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    // Core Data
    const [sites, setSites] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [manHours, setManHours] = useState([]);

    // Security & Filtering
    const [permissions, setPermissions] = useState({ viewOnly: false, canEditCreate: false });
    const [siteFilter, setSiteFilter] = useState('All');
    const [filterStart, setFilterStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [filterEnd, setFilterEnd] = useState(new Date().toISOString().split('T')[0]);

    // Exposure Logging Form
    const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
    const [logSite, setLogSite] = useState('');
    const [permHours, setPermHours] = useState(0);
    const [contHours, setContHours] = useState(0);

    useEffect(() => {
        try {
            const s = sessionStorage.getItem('isoSession');
            if (!s) { navigate('/'); return; }
            const sess = JSON.parse(s);

            const cleanRole = String(sess.role || '').trim();

            // 1. STRICT MODULE GUARD
            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(cleanRole);
            const isSiteAdmin = ['Site Owner', 'Site Manager'].includes(cleanRole);

            const hasModuleAccess = isGlobalAdmin || isSiteAdmin || (sess.accessibleModules || []).some(m => {
                const lowerM = String(m).toLowerCase();
                return lowerM.includes('analytic') || lowerM.includes('dashboard');
            });

            if (!hasModuleAccess) {
                alert("Security Alert: You do not have permission to access the Analytics module.");
                navigate('/dashboard');
                return;
            }

            setSession(sess);

            // 2. STRICT RBAC MATRIX
            const canEditCr = ['Global Owner', 'Global Manager', 'Owner', 'Admin', 'Site Owner', 'Site Manager', 'User'].includes(cleanRole);
            setPermissions({ viewOnly: !canEditCr, canEditCreate: canEditCr });

            // 3. SYNCHRONIZED SITE PERSISTENCE
            const params = new URLSearchParams(location.search);
            let ctxSite = params.get('site') || sessionStorage.getItem('isoCurrentSite') || 'All';

            if (!isGlobalAdmin && ctxSite === 'All') {
                ctxSite = (sess.assignedSite && sess.assignedSite !== 'GLOBAL') ? sess.assignedSite : (sess.accessibleSites?.[0] || '');
            }

            setSiteFilter(ctxSite);
            setLogSite(ctxSite !== 'All' ? ctxSite : ''); // Auto-fill log form if specific site is selected
            sessionStorage.setItem('isoCurrentSite', ctxSite === 'All' ? 'GLOBAL' : ctxSite);

            // 4. FETCH DATA
            const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
            const unsubscribe = onValue(dbRef, (snap) => {
                if (snap.exists()) {
                    const val = snap.val();
                    if (val.sites) {
                        setSites(Object.keys(val.sites).map(k => ({ code: val.sites[k].code || k, name: val.sites[k].name || k })));
                    }
                    setIncidents(val.incidents ? Object.values(val.incidents) : []);
                    setManHours(val.manHours ? Object.values(val.manHours) : []);
                }
                setLoading(false);
            });
            return () => unsubscribe();
        } catch (e) {
            console.error("Initialization Error", e);
            setLoading(false);
        }
    }, [navigate, location]);

    // ==========================================
    // STRICT SITE & ROLE AUTHORIZATION LOGIC
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
        const val = e.target.value;
        setSiteFilter(val);
        setLogSite(val !== 'All' ? val : '');
        sessionStorage.setItem('isoCurrentSite', val === 'All' ? 'GLOBAL' : val);
    };

    const canViewRecord = (siteId) => isGlobalUser || siteId === 'Global' || siteId === 'GLOBAL' || allowedSiteCodes.has(siteId);

    // ==========================================
    // DATA CRUNCHING & FILTERING
    // ==========================================
    const stats = useMemo(() => {
        // Filter by Date AND Row-Level Site Security
        const fIncidents = incidents.filter(i => {
            if (i.date < filterStart || i.date > filterEnd) return false;

            const iSite = i.siteId || 'Global';
            if (!canViewRecord(iSite)) return false; // Hard RLS Block
            if (siteFilter !== 'All' && iSite !== siteFilter) return false;

            return true;
        });

        const fManHours = manHours.filter(m => {
            if (m.date < filterStart || m.date > filterEnd) return false;

            const mSite = m.siteId || 'Global'; // Legacy data fallback
            if (!canViewRecord(mSite)) return false; // Hard RLS Block
            if (siteFilter !== 'All' && mSite !== siteFilter) return false;

            return true;
        });

        const totalHours = fManHours.reduce((acc, curr) => acc + parseFloat(curr.perm || 0) + parseFloat(curr.cont || 0), 0) || 1; // Prevent division by zero
        const calcRate = (count) => ((count * 200000) / totalHours).toFixed(2);

        const counts = {
            nm: fIncidents.filter(i => i.type === 'Near Miss').length,
            fa: fIncidents.filter(i => i.type === 'First Aid injury').length,
            lti: fIncidents.filter(i => i.type === 'Lost Time injury').length,
            rec: fIncidents.filter(i => ['Lost Time injury', 'Reportable Injury'].includes(i.type)).length
        };

        const totalPerm = fManHours.reduce((acc, curr) => acc + parseFloat(curr.perm || 0), 0);
        const totalCont = fManHours.reduce((acc, curr) => acc + parseFloat(curr.cont || 0), 0);

        return {
            nmr: calcRate(counts.nm),
            fair: calcRate(counts.fa),
            ltir: calcRate(counts.lti),
            rir: calcRate(counts.rec),
            totalHours: totalHours === 1 && fManHours.length === 0 ? 0 : totalHours, // Correction for UI display
            permPercent: Math.round((totalPerm / (totalHours === 1 && fManHours.length === 0 ? 1 : totalHours)) * 100) || 0,
            contPercent: Math.round((totalCont / (totalHours === 1 && fManHours.length === 0 ? 1 : totalHours)) * 100) || 0,
            counts
        };
    }, [incidents, manHours, filterStart, filterEnd, siteFilter, canViewRecord]);


    const handleLogHours = async () => {
        if (!permissions.canEditCreate) return alert("Security Error: You do not have permission to log exposure hours.");
        if (!logSite) return alert("Please select a specific Facility/Site to log hours against.");
        if (!isGlobalUser && !allowedSiteCodes.has(logSite)) return alert("Security Error: You are not authorized to log hours for this site.");
        if (permHours <= 0 && contHours <= 0) return alert("Please enter valid working hours.");

        try {
            await push(ref(rtdb, `organizations/${session.orgId}/manHours`), {
                siteId: logSite,
                date: logDate,
                perm: parseFloat(permHours),
                cont: parseFloat(contHours),
                loggedBy: session.name || session.email || session.user,
                timestamp: new Date().toISOString()
            });
            alert("Exposure Hours Logged Successfully!");
            setPermHours(0);
            setContHours(0);
        } catch (e) {
            alert("Error saving data: " + e.message);
        }
    };

    if (loading || !session) return (
        <div className="h-screen flex items-center justify-center bg-slate-950 text-white flex-col gap-4 font-['Space_Grotesk']">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
            <h2 className="text-sm font-bold tracking-widest uppercase text-slate-400">Loading Analytics Engine...</h2>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden relative">
            <style dangerouslySetInnerHTML={{
                __html: `
                .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); }
                input, select { background: #0f172a; border: 1px solid #334155; color: white; padding: 10px; border-radius: 8px; width: 100%; outline: none; transition: 0.2s; }
                input:focus, select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}} />

            <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-20 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-900/50">
                        <i className="fas fa-chart-line"></i>
                    </div>
                    <h1 className="font-bold text-lg uppercase tracking-tight hidden md:block">Safety Analytics & Dashboards</h1>

                    <div className="ml-4 flex gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">{session?.role}</span>
                        {permissions.viewOnly && <span className="text-[10px] uppercase font-bold tracking-widest bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20"><i className="fas fa-eye mr-1"></i> Read Only</span>}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10">
                <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">

                    {/* Master Filters */}
                    <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 border-slate-700 shadow-xl">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-inner"><i className="fas fa-filter text-xl"></i></div>
                            <div>
                                <h3 className="font-bold text-white text-lg">Report Filters</h3>
                                <p className="text-xs text-slate-400">Isolate metrics by location and time.</p>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto items-end">
                            <div className="w-full md:w-48">
                                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-widest">Target Facility</label>
                                <select value={siteFilter} onChange={handleSiteFilterChange} className="font-bold shadow-inner">
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">Global Organization</option>}
                                    {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="w-full md:w-40">
                                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-widest">Date From</label>
                                <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="font-mono text-sm shadow-inner" />
                            </div>
                            <div className="w-full md:w-40">
                                <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-widest">Date To</label>
                                <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="font-mono text-sm shadow-inner" />
                            </div>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KPICard title="NMR" value={stats.nmr} subtext="Near Misses / 200k Hrs" color="border-yellow-500" icon={<i className="fas fa-bolt text-yellow-400"></i>} />
                        <KPICard title="FAIR" value={stats.fair} subtext="First Aids / 200k Hrs" color="border-blue-500" icon={<i className="fas fa-kit-medical text-blue-400"></i>} />
                        <KPICard title="LTIR" value={stats.ltir} subtext="Lost Time / 200k Hrs" color="border-red-500" icon={<i className="fas fa-ambulance text-red-400"></i>} />
                        <KPICard title="RIR" value={stats.rir} subtext="Recordables / 200k Hrs" color="border-orange-500" icon={<i className="fas fa-clipboard-check text-orange-400"></i>} />
                    </div>

                    {/* Exposure & Incident Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="glass-panel p-8 rounded-3xl shadow-xl">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-6 tracking-widest text-white border-b border-slate-800 pb-3 flex items-center gap-2"><i className="fas fa-chart-pie text-indigo-400"></i> Incident Breakdown</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors shadow-inner">
                                    <span className="font-medium">Near Misses / Observations</span><span className="font-black text-yellow-400 text-lg">{stats.counts.nm}</span>
                                </div>
                                <div className="flex justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors shadow-inner">
                                    <span className="font-medium">First Aid Injuries</span><span className="font-black text-blue-400 text-lg">{stats.counts.fa}</span>
                                </div>
                                <div className="flex justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors shadow-inner">
                                    <span className="font-medium">Lost Time Injuries (LTI)</span><span className="font-black text-red-400 text-lg">{stats.counts.lti}</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-8 rounded-3xl flex flex-col justify-center items-center shadow-xl">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-6 self-start tracking-widest text-white border-b border-slate-800 w-full pb-3 flex items-center gap-2"><i className="fas fa-users text-purple-400"></i> Exposure Hours</h4>
                            <span className="text-7xl font-black text-white mb-2 tracking-tighter">{Math.round(stats.totalHours).toLocaleString()}</span>
                            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Total Man-Hours Logged</p>

                            <div className="w-full mt-10 space-y-5 bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                                <div>
                                    <div className="flex justify-between text-[10px] uppercase font-bold mb-2">
                                        <span className="text-slate-400">Direct Staff</span><span className="text-blue-400">{stats.permPercent}%</span>
                                    </div>
                                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800"><div className="bg-blue-500 h-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" style={{ width: `${stats.permPercent}%` }}></div></div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] uppercase font-bold mb-2">
                                        <span className="text-slate-400">Contractors</span><span className="text-purple-400">{stats.contPercent}%</span>
                                    </div>
                                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800"><div className="bg-purple-500 h-full shadow-[0_0_10px_rgba(168,85,247,0.8)]" style={{ width: `${stats.contPercent}%` }}></div></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Man-Hour Logger (Hidden for Read-Only Users) */}
                    {permissions.canEditCreate && (
                        <div className="glass-panel p-8 rounded-3xl border-t-4 border-purple-500 shadow-2xl relative overflow-hidden">
                            <div className="absolute right-0 bottom-0 w-64 h-64 bg-purple-600/10 rounded-full blur-[80px] pointer-events-none"></div>
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-3 text-white"><i className="fas fa-clock text-purple-400"></i> Local Exposure Logging</h3>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end relative z-10">
                                <div className="md:col-span-1">
                                    <label className="text-[10px] block mb-2 uppercase text-slate-400 font-bold tracking-widest">Facility</label>
                                    <select value={logSite} onChange={e => setLogSite(e.target.value)} className="shadow-inner text-sm font-bold border-purple-900/50 focus:border-purple-500">
                                        <option value="">Select Site...</option>
                                        {visibleSites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-1">
                                    <label className="text-[10px] block mb-2 uppercase text-slate-400 font-bold tracking-widest">Log Date</label>
                                    <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="shadow-inner font-mono text-sm" />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="text-[10px] block mb-2 uppercase text-slate-400 font-bold tracking-widest">Permanent Hrs</label>
                                    <input type="number" min="0" value={permHours} onChange={e => setPermHours(e.target.value)} className="shadow-inner font-mono text-sm" placeholder="0" />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="text-[10px] block mb-2 uppercase text-slate-400 font-bold tracking-widest">Contractor Hrs</label>
                                    <input type="number" min="0" value={contHours} onChange={e => setContHours(e.target.value)} className="shadow-inner font-mono text-sm" placeholder="0" />
                                </div>
                                <div className="md:col-span-1">
                                    <button onClick={handleLogHours} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-transform active:scale-95 shadow-lg shadow-purple-900/50 uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                                        <i className="fas fa-save"></i> Record
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}