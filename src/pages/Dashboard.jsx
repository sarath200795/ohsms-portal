import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../config/firebase';

const NavCard = ({ module, onClick }) => (
    <div onClick={onClick} className="glass-panel p-6 rounded-2xl relative overflow-hidden group h-40 flex flex-col justify-between border border-slate-800 hover:border-blue-500/50 transition-all">
        <div className="card-glow"></div>

        <div className="relative z-10 flex justify-between items-start">
            <div className={`w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-lg shadow-lg ${module.color}`}>
                <i className={`fas ${module.icon}`}></i>
            </div>

            <div className="flex flex-col items-end gap-1">
                {module.admin && (
                    <span className="text-[9px] font-bold uppercase bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-600">
                        Admin
                    </span>
                )}
            </div>
        </div>

        <div className="relative z-10">
            <h3 className="text-base font-bold text-white mb-0.5 group-hover:text-blue-400 transition-colors">{module.label}</h3>
            <p className="text-[10px] text-slate-400">{module.desc}</p>
        </div>
    </div>
);

export default function Dashboard() {
    const [session, setSession] = useState(null);
    const [sites, setSites] = useState([]);
    const [selectedSite, setSelectedSite] = useState('GLOBAL');
    const [loading, setLoading] = useState(true);

    const navigate = useNavigate();

    const MODULES = [
        { id: 'dashboard', label: 'Dashboard', desc: 'KPIs & Stats', icon: 'fa-chart-pie', color: 'text-purple-400', path: '/dashboard' },
        { id: 'incidents', label: 'Incidents', desc: 'Report Hazards', icon: 'fa-triangle-exclamation', color: 'text-orange-400', path: '/incidents' },
        { id: 'risk', label: 'Risk Assessment', desc: 'HIRA & JSA', icon: 'fa-shield-virus', color: 'text-red-400', path: '/risk' },
        { id: 'consultation', label: 'Participation', desc: 'Committees & MOM', icon: 'fa-comments', color: 'text-teal-400', path: '/consultation' },
        { id: 'audit', label: 'Internal Audit', desc: 'Compliance Checks', icon: 'fa-clipboard-check', color: 'text-emerald-400', path: '/audit' },
        { id: 'capa', label: 'CAPA Manager', desc: 'Global Actions', icon: 'fa-list-check', color: 'text-cyan-400', path: '/capa' },
        { id: 'training', label: 'Training', desc: 'LMS & Competency', icon: 'fa-graduation-cap', color: 'text-yellow-400', path: '/training' },
        { id: 'improvement', label: 'Improvement', desc: 'Kaizen & JDI', icon: 'fa-chart-line', color: 'text-blue-400', path: '/improvement' },
        { id: 'mock-drill', label: 'Record Emergency', desc: 'Drills & Real Events', icon: 'fa-person-running', color: 'text-pink-400', path: '/mock-drill' },
        { id: 'ohs-tools', label: 'OHS Tools', desc: 'PTW, LOTO & Legal', icon: 'fa-toolbox', color: 'text-fuchsia-400', path: '/ohs-tools' },
        { id: 'users', label: 'Users', desc: 'Manage Access', icon: 'fa-users-gear', color: 'text-slate-300', admin: true, path: '/users' },
        { id: 'sites', label: 'Sites', desc: 'Manage Locations', icon: 'fa-building-shield', color: 'text-slate-300', admin: true, path: '/sites' },
    ];

    useEffect(() => {
        const raw = sessionStorage.getItem('isoSession');
        if (!raw) return navigate('/');

        try {
            const sess = JSON.parse(raw);
            setSession(sess);

            if (sess.assignedSite && sess.assignedSite !== 'GLOBAL') {
                setSelectedSite(sess.assignedSite);
            }

            const sitesRef = ref(rtdb, `organizations/${sess.orgId}/sites`);
            onValue(sitesRef, (snap) => {
                if (snap.exists()) {
                    setSites(Object.values(snap.val()));
                }
                setLoading(false);
            });

        } catch (e) { navigate('/'); }
    }, [navigate]);

    const handleLogout = async () => {
        try { await signOut(auth); } catch (e) { console.log(e); }
        sessionStorage.clear();
        navigate('/');
    };

    const handleNav = (module) => {
        if (module.admin && session?.role !== 'Owner') {
            alert("Access Denied: Only Owner can access this module.");
            return;
        }
        navigate(module.path);
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white font-['Space_Grotesk']"><div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div></div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 relative overflow-hidden font-['Space_Grotesk'] text-white">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>

            <header className="h-16 px-6 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-white/5 relative">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i className="fas fa-shield-halved"></i>
                    </div>
                    <h1 className="text-base font-bold text-white hidden md:block">ISO 45001 Hub</h1>

                    <div className="flex items-center gap-2 text-xs font-bold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white transition-all ml-2">
                        <i className="fas fa-location-dot text-emerald-400"></i>
                        <select
                            value={selectedSite}
                            onChange={(e) => setSelectedSite(e.target.value)}
                            className="bg-transparent border-none text-white outline-none cursor-pointer"
                        >
                            {/* FIX: Added bg-slate-900 to options so they are readable */}
                            <option value="GLOBAL" className="bg-slate-900 text-white">Global Organization View</option>
                            {sites.map(s => (
                                <option key={s.code} value={s.code} className="bg-slate-900 text-white">{s.name} ({s.code})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                        <p className="text-xs font-bold text-white">{session.email}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{session.role}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300 border border-slate-700 uppercase">
                        {session.email?.charAt(0) || 'U'}
                    </div>
                    <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors ml-2">
                        <i className="fas fa-power-off text-lg"></i>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto w-full relative z-10">
                <main className="p-8 max-w-7xl mx-auto w-full">
                    <div className="mb-8 animate-in fade-in duration-500">
                        <h2 className="text-3xl font-bold text-white mb-2">Enterprise Modules</h2>
                        <p className="text-slate-400 text-sm">Context: <span className="text-emerald-400 font-bold px-2 py-0.5 bg-emerald-400/10 rounded border border-emerald-400/20">{selectedSite === 'GLOBAL' ? 'Global Organization' : selectedSite}</span></p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-in slide-in-from-bottom-8 duration-700">
                        {MODULES.map(module => (
                            <NavCard
                                key={module.id}
                                module={module}
                                onClick={() => handleNav(module)}
                            />
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
}