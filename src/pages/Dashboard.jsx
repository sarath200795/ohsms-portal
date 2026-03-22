import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { rtdb } from '../config/firebase';

// --- UTILITY IMPORTS (PHASE 1) ---
import { safeArr, safeArrayParse } from '../utils/helpers';
import { ALL_MODULES } from '../utils/constants';

export default function Dashboard() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    // High-Level Metrics State
    const [permits, setPermits] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [contractors, setContractors] = useState([]);
    const [capa, setCapa] = useState([]);

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) return navigate('/');
        const sess = JSON.parse(s);
        setSession(sess);

        // --- PHASE 2: TARGETED DASHBOARD FETCHING ---
        // Only pull the 4 main metric categories needed for the high-level overview cards
        const fetchDashboardMetrics = async () => {
            try {
                const orgRef = `organizations/${sess.orgId}`;

                const [ptwSnap, incidentsSnap, contractorsSnap, capaSnap] = await Promise.all([
                    get(ref(rtdb, `${orgRef}/ptwRecords`)),
                    get(ref(rtdb, `${orgRef}/incidents`)),
                    get(ref(rtdb, `${orgRef}/contractors`)),
                    get(ref(rtdb, `${orgRef}/capa`))
                ]);

                if (ptwSnap.exists()) setPermits(safeArrayParse(ptwSnap.val()));
                if (incidentsSnap.exists()) setIncidents(safeArrayParse(incidentsSnap.val()));
                if (contractorsSnap.exists()) setContractors(safeArrayParse(contractorsSnap.val()));
                if (capaSnap.exists()) setCapa(safeArrayParse(capaSnap.val()));

            } catch (error) {
                console.error("Dashboard Metrics Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardMetrics();
    }, [navigate]);

    // Data Calculation Logic
    const activePermits = permits.filter(p => p.status !== 'Closed' && p.status !== 'Cancelled');
    const openIncidents = incidents.filter(i => i.status !== 'Closed');
    const openCapa = capa.filter(c => c.status !== 'Closed');
    const totalWorkforce = contractors.reduce((acc, c) => acc + safeArr(c.workers).length, 0);

    const handleNavigation = (moduleName) => {
        // Quick map of readable names to URL paths
        const routeMap = {
            'PTW': '/ptw',
            'Incidents': '/incidents',
            'Contractor Management': '/contractors',
            'Risk Assessments': '/risk-assessments',
            'LOTO': '/loto',
            'Audits': '/audits',
            'CAPA': '/capa'
        };
        const path = routeMap[moduleName] || '/dashboard';
        navigate(path);
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-blue-400 font-['Space_Grotesk'] uppercase tracking-widest"><i className="fas fa-circle-notch fa-spin mr-3 text-2xl"></i> Initializing Main Hub...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i className="fas fa-layer-group"></i>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white uppercase tracking-wide leading-tight">OHSMS Hub</h1>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Org ID: {session.orgId}</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-white leading-tight">{session.name}</div>
                        <div className="text-[10px] text-blue-400 uppercase tracking-widest">{session.role} | {session.assignedSite}</div>
                    </div>
                    <button onClick={() => { sessionStorage.clear(); navigate('/'); }} className="bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-sm border border-slate-700">
                        <i className="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500 space-y-8">

                    {/* TOP LEVEL METRICS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl border-l-4 border-l-emerald-500 relative overflow-hidden group">
                            <i className="fas fa-clipboard-check absolute -right-4 -bottom-4 text-6xl text-slate-800 opacity-20 group-hover:scale-110 transition-transform"></i>
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Active Permits</h3>
                            <div className="text-4xl font-black text-emerald-400">{activePermits.length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl border-l-4 border-l-orange-500 relative overflow-hidden group">
                            <i className="fas fa-briefcase-medical absolute -right-4 -bottom-4 text-6xl text-slate-800 opacity-20 group-hover:scale-110 transition-transform"></i>
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Open Incidents</h3>
                            <div className="text-4xl font-black text-orange-400">{openIncidents.length}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl border-l-4 border-l-indigo-500 relative overflow-hidden group">
                            <i className="fas fa-hard-hat absolute -right-4 -bottom-4 text-6xl text-slate-800 opacity-20 group-hover:scale-110 transition-transform"></i>
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Total Workforce</h3>
                            <div className="text-4xl font-black text-indigo-400">{totalWorkforce}</div>
                        </div>
                        <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-xl border-l-4 border-l-purple-500 relative overflow-hidden group">
                            <i className="fas fa-tasks absolute -right-4 -bottom-4 text-6xl text-slate-800 opacity-20 group-hover:scale-110 transition-transform"></i>
                            <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Pending Actions (CAPA)</h3>
                            <div className="text-4xl font-black text-purple-400">{openCapa.length}</div>
                        </div>
                    </div>

                    {/* MODULE NAVIGATION GRID */}
                    <div>
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><i className="fas fa-th-large"></i> System Modules</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {ALL_MODULES.map(module => {
                                // Determine if user has access to this tile
                                const hasAccess = ['Global Owner', 'Global Manager', 'Admin'].includes(session.role) || safeArr(session.accessibleModules).includes(module);

                                return (
                                    <button
                                        key={module}
                                        onClick={() => hasAccess ? handleNavigation(module) : alert("Access Denied")}
                                        className={`p-6 rounded-2xl border text-left transition-all relative overflow-hidden group ${hasAccess
                                            ? 'bg-slate-900/50 border-slate-700 hover:border-blue-500 hover:bg-slate-800 hover:shadow-lg hover:shadow-blue-900/20 cursor-pointer'
                                            : 'bg-slate-950/50 border-slate-800 opacity-50 cursor-not-allowed'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${hasAccess ? 'bg-slate-800 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors' : 'bg-slate-900 text-slate-600'}`}>
                                                <i className={`fas fa-${getIconForModule(module)}`}></i>
                                            </div>
                                            {!hasAccess && <i className="fas fa-lock text-slate-600 text-xs"></i>}
                                        </div>
                                        <h3 className={`font-bold leading-tight ${hasAccess ? 'text-slate-200' : 'text-slate-500'}`}>{module}</h3>
                                    </button>
                                );
                            })}

                            {/* Special Tile for Admin Access Settings */}
                            {['Global Owner', 'Global Manager', 'Admin'].includes(session.role) && (
                                <button onClick={() => navigate('/users')} className="p-6 rounded-2xl border border-indigo-500/30 bg-indigo-900/10 hover:bg-indigo-900/30 text-left transition-all cursor-pointer">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-lg mb-4 shadow-lg">
                                        <i className="fas fa-users-cog"></i>
                                    </div>
                                    <h3 className="font-bold text-indigo-300 leading-tight">Access & Permissions</h3>
                                    <p className="text-[10px] text-indigo-400/70 mt-1 uppercase tracking-widest">Admin Control Panel</p>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

// Helper to assign icons to tiles
function getIconForModule(moduleName) {
    const icons = {
        "Incidents": "briefcase-medical",
        "Risk Assessments": "exclamation-triangle",
        "Consultation & Participation": "comments",
        "Audits": "clipboard-check",
        "Standards": "book",
        "CAPA": "tasks",
        "Training": "chalkboard-teacher",
        "Improvement": "chart-line",
        "PTW": "clipboard-list",
        "LOTO": "lock",
        "Health Dashboard": "heartbeat",
        "Mock Drills": "running",
        "Emergency Equipment": "fire-extinguisher",
        "Inspections": "search",
        "Contractor Management": "hard-hat",
        "Management of Change": "sync-alt"
    };
    return icons[moduleName] || "folder";
}