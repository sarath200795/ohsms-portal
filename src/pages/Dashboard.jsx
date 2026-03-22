import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, rtdb } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import useStore from '../store/useStore';

const NavCard = ({ module, actions = [], onClick }) => {
    const topActions = actions.slice(0, 3);
    const extraCount = actions.length - 3;

    return (
        <div onClick={onClick} className="glass-panel p-6 rounded-3xl relative overflow-hidden group min-h-[12rem] flex flex-col border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-blue-900/20 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors duration-500"></div>

            <div className="relative z-10 flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-2xl shadow-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 ${module.color}`}>
                    <i className={`fas ${module.icon}`}></i>
                </div>
                {actions.length > 0 ? (
                    <div className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-lg animate-pulse border border-red-400">
                        {actions.length} Action{actions.length > 1 ? 's' : ''}
                    </div>
                ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-800/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0">
                        <i className="fas fa-arrow-right text-slate-400 text-xs"></i>
                    </div>
                )}
            </div>

            <div className="relative z-10 flex-1 flex flex-col justify-end">
                <h3 className="text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{module.label}</h3>
                {actions.length > 0 ? (
                    <div className="mt-3 space-y-1.5 border-t border-slate-700/50 pt-3">
                        {topActions.map((act, i) => (
                            <div key={i} className="text-[10px] text-slate-300 flex items-start gap-1.5 truncate group-hover:text-white transition-colors">
                                <i className="fas fa-circle text-[5px] mt-1.5 text-orange-400"></i>
                                <span className="truncate">{act.title}</span>
                            </div>
                        ))}
                        {extraCount > 0 && <div className="text-[9px] text-slate-500 italic mt-1 font-bold">+ {extraCount} more pending...</div>}
                    </div>
                ) : (
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-auto">{module.id}</p>
                )}
            </div>
        </div>
    );
};

export default function Dashboard() {
    const navigate = useNavigate();
    const { session, initializeSession, clearSession } = useStore();

    const [selectedSite, setSelectedSite] = useState('');
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isFabOpen, setIsFabOpen] = useState(false);

    // --- PHASE 2 TARGETED FETCHING STATE ---
    const [localOrgData, setLocalOrgData] = useState(null);
    const [localLoading, setLocalLoading] = useState(true);

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
        { id: 'Contractors', label: 'Contractor Safety', icon: 'fa-hard-hat', color: 'text-indigo-400', path: '/contractors' },
        { id: 'MOC', label: 'Mgmt of Change', icon: 'fa-code-branch', color: 'text-rose-400', path: '/moc' },
        { id: 'Inspections', label: 'Inspections', icon: 'fa-search-location', color: 'text-lime-400', path: '/inspections' },
        { id: 'Users', label: 'Users', icon: 'fa-users-gear', color: 'text-slate-300', path: '/users' },
        { id: 'Sites', label: 'Sites', icon: 'fa-building-shield', color: 'text-slate-300', path: '/sites' },
    ];

    useEffect(() => {
        const raw = sessionStorage.getItem('isoSession');
        if (!raw) return navigate('/');
        const sess = JSON.parse(raw);

        initializeSession(sess);

        const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(sess.role);

        let initialSite = sessionStorage.getItem('isoCurrentSite');
        if (!initialSite) initialSite = isGlobalAdmin ? 'GLOBAL' : sess.assignedSite;
        if (!isGlobalAdmin && initialSite === 'GLOBAL') initialSite = sess.assignedSite;

        setSelectedSite(initialSite || 'GLOBAL');
        sessionStorage.setItem('isoCurrentSite', initialSite || 'GLOBAL');

        // --- PHASE 2 TARGETED FETCHING ENGINE ---
        // Only pull the exact tables needed to calculate notifications and site lists
        const fetchDashboardData = async () => {
            try {
                const orgRef = `organizations/${sess.orgId}`;
                const [detailsSnap, sitesSnap, ptwSnap, incidentsSnap, requestsSnap] = await Promise.all([
                    get(ref(rtdb, `${orgRef}/details`)),
                    get(ref(rtdb, `${orgRef}/sites`)),
                    get(ref(rtdb, `${orgRef}/ptwRecords`)),
                    get(ref(rtdb, `${orgRef}/incidents`)),
                    get(ref(rtdb, `${orgRef}/permissionRequests`))
                ]);

                setLocalOrgData({
                    details: detailsSnap.exists() ? detailsSnap.val() : null,
                    sites: sitesSnap.exists() ? sitesSnap.val() : null,
                    ptwRecords: ptwSnap.exists() ? ptwSnap.val() : null,
                    incidents: incidentsSnap.exists() ? incidentsSnap.val() : null,
                    permissionRequests: requestsSnap.exists() ? requestsSnap.val() : null,
                });
            } catch (error) {
                console.error("Dashboard Fetch Error:", error);
            } finally {
                setLocalLoading(false);
            }
        };

        fetchDashboardData();
    }, [navigate, initializeSession]);

    const { orgName, sites, myActions, visibleModules } = useMemo(() => {
        let orgName = 'OHS Portal';
        let parsedSites = [];
        let actions = [];
        let vModules = [];

        if (session && localOrgData) {
            const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session.role);
            const myEmail = session.email?.toLowerCase().trim();
            const myName = session.name?.toLowerCase().trim();
            const checkUserMatch = (val) => val?.toLowerCase().trim() === myEmail || val?.toLowerCase().trim() === myName;

            if (localOrgData.details?.name) orgName = localOrgData.details.name;

            if (localOrgData.sites) {
                const allSites = Object.values(localOrgData.sites);
                if (isGlobalAdmin) {
                    parsedSites = allSites;
                } else {
                    const allowedCodes = new Set([session.assignedSite, ...(session.accessibleSites || [])]);
                    parsedSites = allSites.filter(s => allowedCodes.has(s.code));
                }
            }

            if (isGlobalAdmin) vModules = ALL_MODULES;
            else vModules = ALL_MODULES.filter(mod => session.accessibleModules?.includes(mod.id));

            if (localOrgData.ptwRecords) {
                Object.values(localOrgData.ptwRecords).forEach(p => {
                    const isPending = p.status === 'Pending Approval' || p.status === 'Pending Closure';
                    const isMyTurn = (p.engApproverEmail && checkUserMatch(p.engApproverEmail) && p.engStatus.includes('Pending')) ||
                        (p.prodApproverEmail && checkUserMatch(p.prodApproverEmail) && p.prodStatus.includes('Pending'));
                    if (isPending && isMyTurn) {
                        actions.push({ title: `Permit Auth: ${p.id}`, module: 'OHS Tools', path: `/ptw?site=${p.siteId}` });
                    }
                });
            }

            if (localOrgData.incidents) {
                Object.values(localOrgData.incidents).forEach(inc => {
                    const capas = inc.capa || (inc.investigation && inc.investigation.capa);
                    if (capas) {
                        Object.values(capas).forEach(act => {
                            if (act && act.status !== 'Closed' && checkUserMatch(act.owner || act.own)) {
                                actions.push({ title: act.action || act.act || act.desc, module: 'CAPA Manager', path: `/capa?site=${inc.siteId || 'All'}` });
                            }
                        });
                    }
                });
            }

            if (isGlobalAdmin && localOrgData.permissionRequests) {
                Object.values(localOrgData.permissionRequests).forEach(req => {
                    if (req.status === 'Pending') {
                        actions.push({ title: `Access Request: ${req.userName}`, module: 'Users', path: '/users' });
                    }
                });
            }
        }

        return { orgName, sites: parsedSites, myActions: actions, visibleModules: vModules };
    }, [localOrgData, session]);

    const handleLogout = async () => {
        await signOut(auth);
        sessionStorage.clear();
        clearSession();
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

    if (localLoading) return <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400 font-['Space_Grotesk'] tracking-widest text-xs uppercase animate-pulse"><div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin mb-4"></div>Loading Workspace...</div>;

    const firstName = session?.name?.split(' ')[0] || 'Team Member';
    const isGlobalAdmin = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(session?.role);
    const activeSiteName = selectedSite === 'GLOBAL' ? 'Global View (All Sites)' : (sites.find(s => s.code === selectedSite)?.name || selectedSite);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white font-['Space_Grotesk'] overflow-hidden relative">
            <style dangerouslySetInnerHTML={{
                __html: `
                .glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); }
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-track { background: #0f172a; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}} />

            {/* FLOATING ACTION BUTTON */}
            <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
                <div className={`flex flex-col gap-3 transition-all duration-300 origin-bottom ${isFabOpen ? 'scale-100 opacity-100 mb-2' : 'scale-0 opacity-0 h-0 pointer-events-none'}`}>
                    {visibleModules.find(m => m.id === 'Incidents') && (
                        <button onClick={() => { navigate('/incidents?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite)); setIsFabOpen(false); }} className="flex items-center gap-3 group">
                            <span className="bg-slate-800/90 backdrop-blur-sm text-slate-200 text-xs font-bold px-4 py-2 rounded-xl shadow-lg border border-slate-700 group-hover:text-white group-hover:border-orange-500 transition-colors">Report Incident</span>
                            <div className="w-12 h-12 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-900/50 hover:scale-110 transition-transform"><i className="fas fa-triangle-exclamation"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'Inspections') && (
                        <button onClick={() => { navigate('/inspections?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite)); setIsFabOpen(false); }} className="flex items-center gap-3 group">
                            <span className="bg-slate-800/90 backdrop-blur-sm text-slate-200 text-xs font-bold px-4 py-2 rounded-xl shadow-lg border border-slate-700 group-hover:text-white group-hover:border-lime-500 transition-colors">Start Inspection</span>
                            <div className="w-12 h-12 rounded-full bg-lime-600 text-white flex items-center justify-center shadow-lg shadow-lime-900/50 hover:scale-110 transition-transform"><i className="fas fa-search-location"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'OHS Tools') && (
                        <button onClick={() => { navigate('/ohs-tools?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite)); setIsFabOpen(false); }} className="flex items-center gap-3 group">
                            <span className="bg-slate-800/90 backdrop-blur-sm text-slate-200 text-xs font-bold px-4 py-2 rounded-xl shadow-lg border border-slate-700 group-hover:text-white group-hover:border-fuchsia-500 transition-colors">Safety Tools (PTW/LOTO)</span>
                            <div className="w-12 h-12 rounded-full bg-fuchsia-600 text-white flex items-center justify-center shadow-lg shadow-fuchsia-900/50 hover:scale-110 transition-transform"><i className="fas fa-toolbox"></i></div>
                        </button>
                    )}
                    {visibleModules.find(m => m.id === 'CAPA Manager') && (
                        <button onClick={() => { navigate('/capa?site=' + (selectedSite === 'GLOBAL' ? 'All' : selectedSite)); setIsFabOpen(false); }} className="flex items-center gap-3 group">
                            <span className="bg-slate-800/90 backdrop-blur-sm text-slate-200 text-xs font-bold px-4 py-2 rounded-xl shadow-lg border border-slate-700 group-hover:text-white group-hover:border-cyan-500 transition-colors">Action Register</span>
                            <div className="w-12 h-12 rounded-full bg-cyan-600 text-white flex items-center justify-center shadow-lg shadow-cyan-900/50 hover:scale-110 transition-transform"><i className="fas fa-list-check"></i></div>
                        </button>
                    )}
                </div>

                <button
                    onClick={() => setIsFabOpen(!isFabOpen)}
                    className={`w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center text-xl shadow-2xl shadow-blue-900/50 transition-transform duration-300 ${isFabOpen ? 'rotate-45 scale-110 bg-gradient-to-tr from-slate-700 to-slate-600' : 'hover:scale-110 animate-bounce-subtle'}`}>
                    <i className={`fas ${isFabOpen ? 'fa-plus' : 'fa-bolt'}`}></i>
                </button>
            </div>

            <header className="h-16 px-6 flex items-center justify-between backdrop-blur-md bg-slate-900/80 border-b border-slate-800 z-40">
                <div className="flex items-center gap-4">
                    {/* --- BRANDING BLOCK (HEADER) --- */}
                    <img
                        src="/we-ehs-logo.jpg"
                        alt="WE EHS"
                        className="w-10 h-10 rounded-lg shadow-lg shadow-blue-900/50 object-cover border border-slate-700"
                    />
                    <h1 className="text-base font-black hidden md:block tracking-widest text-white uppercase">
                        WE EHS SAFETY TOOL <span className="text-slate-500 font-medium tracking-normal ml-2 capitalize">| {orgName}</span>
                    </h1>

                    <div className="flex items-center gap-2 text-xs font-bold bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner ml-2">
                        <i className="fas fa-location-dot text-emerald-400"></i>
                        <select
                            value={selectedSite}
                            onChange={handleSiteChange}
                            className="bg-transparent border-none text-white outline-none cursor-pointer focus:ring-0 w-32 md:w-48 truncate"
                        >
                            {isGlobalAdmin && <option value="GLOBAL" className="bg-slate-800 text-white">Global View (All Sites)</option>}
                            {sites.map(s => <option key={s.code} value={s.code} className="bg-slate-800 text-white">{s.name} ({s.code})</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={() => setIsNotificationOpen(true)} className="relative w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 hover:bg-slate-700 transition-colors shadow-inner">
                        <i className="fas fa-bell text-slate-300"></i>
                        {myActions.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse border border-slate-900">{myActions.length}</span>}
                    </button>
                    <div className="text-right hidden md:block">
                        <p className="text-xs font-bold text-white">{session?.name || session?.email}</p>
                        <p className="text-[9px] text-blue-400 uppercase tracking-widest">{session?.role}</p>
                    </div>
                    <button onClick={handleLogout} className="w-9 h-9 rounded-full bg-red-900/20 flex items-center justify-center border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white transition-colors shadow-inner"><i className="fas fa-power-off"></i></button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative">
                <div className="max-w-7xl mx-auto pb-24">

                    <div className="mb-10 p-8 rounded-[2rem] bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 relative overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none"></div>

                        <div className="relative z-10">
                            <h2 className="text-4xl font-black text-white mb-4 tracking-tight">Welcome back, {firstName}.</h2>

                            <div className="flex flex-wrap items-center gap-3 md:gap-6 text-sm font-medium mb-6">
                                <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 px-4 py-2 rounded-xl">
                                    <i className="fas fa-building text-blue-400"></i>
                                    <span className="text-slate-400">Org: <strong className="text-white">{orgName}</strong></span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 px-4 py-2 rounded-xl">
                                    <i className="fas fa-map-marker-alt text-emerald-400"></i>
                                    <span className="text-slate-400">Site: <strong className="text-white">{activeSiteName}</strong></span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-slate-400 text-sm font-medium">
                                <span>You have access to <strong className="text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-600">{visibleModules.length}</strong> modules.</span>

                                {myActions.length > 0 ? (
                                    <button onClick={() => setIsNotificationOpen(true)} className="bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white transition-colors px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest border border-orange-500/30 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
                                        {myActions.length} Action{myActions.length > 1 ? 's' : ''} Required
                                    </button>
                                ) : (
                                    <span className="bg-emerald-900/30 text-emerald-400 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest border border-emerald-500/30 flex items-center gap-2">
                                        <i className="fas fa-check-circle"></i> All caught up
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {visibleModules.map(mod => {
                            const modActions = myActions.filter(a => a.module === mod.id);
                            return <NavCard key={mod.id} module={mod} actions={modActions} onClick={() => handleNavigation(mod)} />
                        })}
                    </div>

                    {visibleModules.length === 0 && (
                        <div className="text-center py-20 bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-3xl animate-in fade-in duration-500">
                            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                                <i className="fas fa-lock text-3xl text-slate-600"></i>
                            </div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest mb-2">No Modules Assigned</p>
                            <p className="text-sm text-slate-500 mb-6">Your account is active, but you don't have access to any tools yet.</p>
                            <button onClick={() => navigate('/users')} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-900/50 uppercase tracking-widest text-xs">
                                <i className="fas fa-hand-paper mr-2"></i> Request Access
                            </button>
                        </div>
                    )}
                </div>
            </main>

            {/* NOTIFICATION SIDEBAR */}
            {isNotificationOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" onClick={() => setIsNotificationOpen(false)}></div>
                    <div className="relative w-80 md:w-96 bg-slate-900 h-full border-l border-slate-700 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2"><i className="fas fa-inbox text-blue-400"></i> Action Center</h2>
                            <button onClick={() => setIsNotificationOpen(false)} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto custom-scroll space-y-4">
                            {myActions.map((act, i) => (
                                <div key={i} onClick={() => { setIsNotificationOpen(false); navigate(act.path); }} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl cursor-pointer hover:border-orange-500 transition-colors group shadow-lg">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">{act.module}</p>
                                        <i className="fas fa-arrow-right text-slate-600 group-hover:text-orange-500 transition-colors text-xs mt-1"></i>
                                    </div>
                                    <p className="text-sm font-bold text-white leading-snug">{act.title}</p>
                                </div>
                            ))}
                            {myActions.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 opacity-60">
                                    <i className="fas fa-mug-hot text-4xl mb-4"></i>
                                    <p className="text-sm font-bold uppercase tracking-widest">Inbox Zero</p>
                                    <p className="text-xs mt-1">No pending actions required.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}