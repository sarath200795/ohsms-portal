import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, onValue } from 'firebase/database';
import { rtdb } from '../config/firebase';

const KPICard = ({ title, value, subtext, color, icon }) => (
    <div className={`glass-panel p-6 rounded-xl border-l-4 ${color} relative overflow-hidden transition-transform hover:-translate-y-1`}>
        <div className="flex justify-between items-start z-10 relative">
            <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-white">{value}</h3>
                <p className="text-[10px] text-slate-500 mt-2">{subtext}</p>
            </div>
            <div className={`text-2xl opacity-20 p-2 rounded-lg bg-white/5`}>{icon}</div>
        </div>
    </div>
);

export default function Analytics() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [incidents, setIncidents] = useState([]);
    const [manHours, setManHours] = useState([]);

    const [filterStart, setFilterStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [filterEnd, setFilterEnd] = useState(new Date().toISOString().split('T')[0]);

    const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
    const [permHours, setPermHours] = useState(0);
    const [contHours, setContHours] = useState(0);

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) { navigate('/'); return; }
        const sess = JSON.parse(s);
        setSession(sess);

        const dbRef = ref(rtdb, `organizations/${sess.orgId}`);
        const unsubscribe = onValue(dbRef, (snap) => {
            if (snap.exists()) {
                const val = snap.val();
                setIncidents(val.incidents ? Object.values(val.incidents) : []);
                setManHours(val.manHours ? Object.values(val.manHours) : []);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [navigate]);

    const stats = useMemo(() => {
        const fIncidents = incidents.filter(i => i.date >= filterStart && i.date <= filterEnd);
        const fManHours = manHours.filter(m => m.date >= filterStart && m.date <= filterEnd);

        const totalHours = fManHours.reduce((acc, curr) => acc + parseFloat(curr.perm || 0) + parseFloat(curr.cont || 0), 0) || 1;
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
            totalHours,
            permPercent: Math.round((totalPerm / totalHours) * 100) || 0,
            contPercent: Math.round((totalCont / totalHours) * 100) || 0,
            counts
        };
    }, [incidents, manHours, filterStart, filterEnd]);

    const handleLogHours = async () => {
        if (permHours <= 0 && contHours <= 0) return alert("Enter valid hours");
        try {
            await push(ref(rtdb, `organizations/${session.orgId}/manHours`), {
                date: logDate,
                perm: parseFloat(permHours),
                cont: parseFloat(contHours),
                loggedBy: session.user,
                timestamp: new Date().toISOString()
            });
            alert("Hours Logged Successfully!");
            setPermHours(0); setContHours(0);
        } catch (e) { alert("Error saving data"); }
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white font-bold animate-pulse">LOADING ANALYTICS...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden">
            <style dangerouslySetInnerHTML={{
                __html: `
                .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.05); }
                input { background: #0f172a; border: 1px solid #334155; color: white; padding: 10px; border-radius: 8px; width: 100%; outline: none; }
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}} />

            <header className="h-16 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between px-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors"><i className="fas fa-arrow-left mr-2"></i> Back to Hub</button>
                    <h1 className="font-bold text-lg uppercase tracking-tight ml-4">Safety Analytics</h1>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll">
                <div className="max-w-7xl mx-auto space-y-8">

                    {/* Filters */}
                    <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 border-slate-700">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400"><i className="fas fa-filter"></i></div>
                            <h3 className="font-bold text-white">Date Range Filter</h3>
                        </div>
                        <div className="flex gap-4">
                            <div><label className="text-[10px] text-slate-500 block mb-1">FROM</label><input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} /></div>
                            <div><label className="text-[10px] text-slate-500 block mb-1">TO</label><input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} /></div>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KPICard title="NMR" value={stats.nmr} subtext="Near Miss / 200k Hrs" color="border-yellow-500" icon={<i className="fas fa-bolt"></i>} />
                        <KPICard title="FAIR" value={stats.fair} subtext="First Aid / 200k Hrs" color="border-blue-500" icon={<i className="fas fa-kit-medical"></i>} />
                        <KPICard title="LTIR" value={stats.ltir} subtext="Lost Time / 200k Hrs" color="border-red-500" icon={<i className="fas fa-ambulance"></i>} />
                        <KPICard title="RIR" value={stats.rir} subtext="Recordables / 200k Hrs" color="border-orange-500" icon={<i className="fas fa-clipboard-check"></i>} />
                    </div>

                    {/* Exposure & Incident Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="glass-panel p-8 rounded-3xl">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-6 tracking-widest text-white">Incident Breakdown</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                                    <span>Near Misses</span><span className="font-bold text-yellow-400">{stats.counts.nm}</span>
                                </div>
                                <div className="flex justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                                    <span>First Aid Injuries</span><span className="font-bold text-blue-400">{stats.counts.fa}</span>
                                </div>
                                <div className="flex justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                                    <span>Lost Time Injuries (LTI)</span><span className="font-bold text-red-400">{stats.counts.lti}</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-8 rounded-3xl flex flex-col justify-center items-center">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-6 self-start tracking-widest text-white">Exposure Hours</h4>
                            <span className="text-6xl font-bold text-white mb-2">{Math.round(stats.totalHours).toLocaleString()}</span>
                            <p className="text-xs text-slate-500 uppercase tracking-widest">Total Man-Hours Logged</p>
                            <div className="w-full mt-8 space-y-4">
                                <div className="flex justify-between text-[10px] uppercase"><span>Staff</span><span>{stats.permPercent}%</span></div>
                                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden"><div className="bg-blue-500 h-full" style={{ width: `${stats.permPercent}%` }}></div></div>
                                <div className="flex justify-between text-[10px] uppercase"><span>Contractor</span><span>{stats.contPercent}%</span></div>
                                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden"><div className="bg-purple-500 h-full" style={{ width: `${stats.contPercent}%` }}></div></div>
                            </div>
                        </div>
                    </div>

                    {/* Man-Hour Logger */}
                    <div className="glass-panel p-8 rounded-3xl border-t-4 border-purple-500">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-3 text-white"><i className="fas fa-clock text-purple-400"></i> Exposure Logging</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                            <div><label className="text-[10px] block mb-2 uppercase text-slate-500 font-bold">Log Date</label><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} /></div>
                            <div><label className="text-[10px] block mb-2 uppercase text-slate-500 font-bold">Permanent Hrs</label><input type="number" value={permHours} onChange={e => setPermHours(e.target.value)} /></div>
                            <div><label className="text-[10px] block mb-2 uppercase text-slate-500 font-bold">Contractor Hrs</label><input type="number" value={contHours} onChange={e => setContHours(e.target.value)} /></div>
                            <button onClick={handleLogHours} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95">Record Hours</button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}