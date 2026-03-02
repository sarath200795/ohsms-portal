import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, rtdb } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';

const NavCard = ({ module, onClick }) => (
    <div onClick={onClick} className="glass-panel p-6 rounded-2xl relative overflow-hidden group h-40 flex flex-col justify-between border border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer shadow-lg hover:shadow-blue-500/10">
        <div className="card-glow absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="relative z-10 flex justify-between items-start">
            <div className={`w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-lg shadow-lg ${module.color}`}>
                <i className={`fas ${module.icon}`}></i>
            </div>
        </div>
        <div className="relative z-10">
            <h3 className="text-base font-bold text-white mb-0.5 group-hover:text-blue-400 transition-colors">{module.label}</h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">{module.id}</p>
        </div>
    </div>
);

export default function Dashboard() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [sites, setSites] = useState([]);

    const [selectedSite, setSelectedSite] = useState('');

    const [loading, setLoading] = useState(true);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [myActions, setMyActions] = useState([]);

    const ALL_MODULES = [
        { id: 'Analytics', label: 'Analytics', icon: 'fa-chart-pie', color: 'text-purple-400', path: '/analytics' },
        { id: 'Incidents', label: 'Incidents', icon: 'fa-triangle-exclamation', color: 'text-orange-400', path: '/incidents' },
        { id: 'Risk Assessment', label: 'Risk Assessment', icon: 'fa-shield-virus', color: 'text-red-400', path: '/risk' },
        { id: 'Participation', label: 'Participation', icon: 'fa-comments', color: 'text-teal-400', path: '/consultation' },
        { id: 'Internal Audit', label: 'Internal Audit', icon: 'fa-clipboard-check', color: 'text-emerald-400', path: '/audit' },
        { id: 'CAPA Manager', label: 'CAPA Manager', icon: 'fa-list-check', color: 'text-cyan-400', path: '/capa' },
        { id: 'Training', label: 'Training', icon: 'fa-graduation-cap', color: 'text-yellow-400', path: '/training' },
        { id: 'Improvement', label: 'Improvement', icon: 'fa-chart-line', color: 'text-blue-400', path: '/improvement' },
        { id: 'Record Emergency', label: 'Record Emergency', icon: 'fa-person-running', color: 'text-pink-400', path: '/mock-drill' },
        { id: 'OHS Tools', label: 'OHS Tools', icon: 'fa-toolbox', color: 'text-fuchsia-400', path: '/ohs-tools' },
        { id: 'Users', label: 'Users', icon: 'fa-users-gear', color: 'text-slate-300', path: '/users' },
        { id: 'Sites', label: 'Sites', icon: 'fa-building-shield', color: 'text-slate-300', path: '/sites' },
    ];

    useEffect(() => {
        const raw = sessionStorage.getItem('isoSession');
        if (!raw) return navigate('/');

        let sess = JSON.parse(raw);
        setSession(sess);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);

        // ==========================================
        // SMART SITE PERSISTENCE LOGIC
        // ==========================================
        if (!selectedSite) {
            let initialSite = sessionStorage.getItem('isoCurrentSite');

            if (!initialSite) {
                initialSite = isGlobalAdmin ? 'GLOBAL' : sess.assignedSite;
            }

            if (!isGlobalAdmin && initialSite === 'GLOBAL') {
                initialSite = sess.assignedSite;
            }

            setSelectedSite(initialSite || 'GLOBAL');
            sessionStorage.setItem('isoCurrentSite', initialSite || 'GLOBAL');
        }

        const orgRef = ref(rtdb, `organizations/${sess.orgId}`);
        const unsubscribe = onValue(orgRef, (snap) => {
            if (snap.exists()) {
                const val = snap.val();

                // === LIVE PERMISSION SYNC ===
                if (val.users) {
                    const myLiveProfile = Object.values(val.users).find(u => u.email?.toLowerCase() === sess.email?.toLowerCase());
                    if (myLiveProfile) {
                        const updatedSession = {
                            ...sess,
                            role: myLiveProfile.role || 'User',
                            assignedSite: myLiveProfile.assignedSite || 'GLOBAL',
                            accessibleSites: myLiveProfile.accessibleSites || [],
                            accessibleModules: myLiveProfile.accessibleModules || []
                        };
                        sessionStorage.setItem('isoSession', JSON.stringify(updatedSession));
                        sess = updatedSession;
                        setSession(updatedSession);
                    }
                }

                if (val.sites) {
                    const allSites = Object.values(val.sites);
                    if (isGlobalAdmin) {
                        setSites(allSites);
                    } else {
                        const allowedCodes = new Set([sess.assignedSite, ...(sess.accessibleSites || [])]);
                        setSites(allSites.filter(s => allowedCodes.has(s.code)));
                    }
                }

                // Notification Center Logic
                let pending = [];
                const checkMail = (m) => m?.toLowerCase().trim() === sess.email?.toLowerCase().trim();

                if (val.ptwRecords) {
                    Object.values(val.ptwRecords).forEach(p => {
                        const isPending = p.status === 'Pending Approval' || p.status === 'Pending Closure';
                        const isMyTurn = (p.engApproverEmail && checkMail(p.engApproverEmail) && p.engStatus.includes('Pending')) ||
                            (p.prodApproverEmail && checkMail(p.prodApproverEmail) && p.prodStatus.includes('Pending'));
                        if (isPending && isMyTurn) {
                            pending.push({ title: `Permit Approval: ${p.id}`, module: 'OHS Tools', path: `/ptw?site=${p.siteId}` });
                        }
                    });
                }
                setMyActions(pending);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [navigate, selectedSite]);

    const visibleModules = useMemo(() => {
        if (!session) return [];
        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session.role);
        if (isGlobalAdmin) return ALL_MODULES;
        return ALL_MODULES.filter(mod => session.accessibleModules?.includes(mod.id));
    }, [session]);

    const handleLogout = async () => {
        await signOut(auth);
        sessionStorage.clear();
        navigate('/');
    };

    const handleSiteChange = (e) => {
        const newSite = e.target.value;
        setSelectedSite(newSite);
        sessionStorage.setItem('isoCurrentSite', newSite);
    };

    const handleNavigation = (mod) => {
        sessionStorage.setItem('isoCurrentSite', selectedSite);
        const paramSite = selectedSite === 'GLOBAL' ? 'All' : selectedSite;
        navigate(`${mod.path}?site=${paramSite}`);
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-white animate-spin">...</div>;

    const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden">
            <style dangerouslySetInnerHTML={{
                __html: `
                .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); }
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}} />
            <header className="h-16 px-6 flex items-center justify-between backdrop-blur-md bg-slate-900/50 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg"><i className="fas fa-shield-halved"></i></div>
                    <h1 className="text-base font-bold hidden md:block">ISO 45001 Portal</h1>

                    <div className="flex items-center gap-2 text-xs font-bold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                        <i className="fas fa-location-dot text-emerald-400"></i>
                        <select
                            value={selectedSite}
                            onChange={handleSiteChange}
                            className="bg-transparent border-none text-white outline-none cursor-pointer focus:ring-0"
                        >
                            {/* ADDED 'bg-slate-800' TO OPTIONS TO FIX VISIBILITY ISSUE */}
                            {isGlobalAdmin && <option value="GLOBAL" className="bg-slate-800 text-white">Global View (All Sites)</option>}
                            {sites.map(s => <option key={s.code} value={s.code} className="bg-slate-800 text-white">{s.name} ({s.code})</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={() => setIsNotificationOpen(true)} className="relative w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 hover:bg-slate-700">
                        <i className="fas fa-bell text-slate-300"></i>
                        {myActions.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{myActions.length}</span>}
                    </button>
                    <div className="text-right hidden md:block">
                        <p className="text-xs font-bold">{session.name || session.email}</p>
                        <p className="text-[9px] text-blue-400 uppercase tracking-tighter">{session.role}</p>
                    </div>
                    <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors"><i className="fas fa-power-off"></i></button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold">Enterprise Hub</h2>
                        <p className="text-slate-400 text-sm">Welcome back. You have access to {visibleModules.length} modules.</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {visibleModules.map(mod => (
                            <NavCard key={mod.id} module={mod} onClick={() => handleNavigation(mod)} />
                        ))}
                    </div>

                    {visibleModules.length === 0 && (
                        <div className="text-center py-20 bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-3xl">
                            <i className="fas fa-lock text-4xl text-slate-700 mb-4"></i>
                            <p className="text-slate-500 font-bold uppercase tracking-widest">No Modules Assigned</p>
                            <button onClick={() => navigate('/users')} className="mt-4 text-blue-400 text-sm underline">Request Access</button>
                        </div>
                    )}
                </div>
            </main>

            {isNotificationOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsNotificationOpen(false)}></div>
                    <div className="relative w-80 bg-slate-900 h-full border-l border-slate-800 p-6 shadow-2xl animate-in slide-in-from-right duration-300">
                        <h2 className="text-lg font-bold mb-6 flex justify-between items-center">
                            Action Center <button onClick={() => setIsNotificationOpen(false)}><i className="fas fa-times text-slate-500"></i></button>
                        </h2>
                        <div className="space-y-4">
                            {myActions.map((act, i) => (
                                <div key={i} onClick={() => { setIsNotificationOpen(false); navigate(act.path); }} className="p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-blue-500 transition-colors">
                                    <p className="text-xs font-bold text-blue-400 mb-1">{act.module}</p>
                                    <p className="text-sm text-white">{act.title}</p>
                                </div>
                            ))}
                            {myActions.length === 0 && <p className="text-center text-slate-500 text-sm mt-10">All caught up!</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}