import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { rtdb } from '../config/firebase';

// --- UTILITY IMPORTS (PHASE 1) ---
import { safeArr, safeArrayParse } from '../utils/helpers';

export default function Incidents() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    // Core Data States
    const [incidents, setIncidents] = useState([]);
    const [sites, setSites] = useState([]);
    const [users, setUsers] = useState([]);
    const [contractors, setContractors] = useState([]);

    // UI States
    const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'report'
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) return navigate('/');
        const sess = JSON.parse(s);

        // RBAC Verification
        const hasAccess = ['Global Owner', 'Global Manager', 'Admin'].includes(sess.role) ||
            safeArr(sess.accessibleModules).includes('Incidents');
        if (!hasAccess) {
            alert("You do not have permission to access the Incidents module.");
            return navigate('/dashboard');
        }

        setSession(sess);

        // --- PHASE 2: TARGETED FETCHING ---
        // Downloads ONLY what the Incident module needs, parallelized
        const fetchTargetedData = async () => {
            try {
                const orgRef = `organizations/${sess.orgId}`;
                const [incidentsSnap, sitesSnap, usersSnap, contractorsSnap] = await Promise.all([
                    get(ref(rtdb, `${orgRef}/incidents`)),
                    get(ref(rtdb, `${orgRef}/sites`)),
                    get(ref(rtdb, `${orgRef}/users`)),
                    get(ref(rtdb, `${orgRef}/contractors`))
                ]);

                if (incidentsSnap.exists()) setIncidents(safeArrayParse(incidentsSnap.val()));
                if (sitesSnap.exists()) {
                    setSites(Object.keys(sitesSnap.val()).map(k => ({ code: sitesSnap.val()[k].code || k, name: sitesSnap.val()[k].name || k })));
                }
                if (usersSnap.exists()) setUsers(safeArrayParse(usersSnap.val()));
                if (contractorsSnap.exists()) setContractors(safeArrayParse(contractorsSnap.val()));

            } catch (error) {
                console.error("Incident Data Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTargetedData();
    }, [navigate]);

    // --- RBAC Filter Engine ---
    const filteredIncidents = useMemo(() => {
        let filtered = incidents;

        // 1. Filter by Site Access
        if (session && session.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(session.role)) {
            const allowedSites = [session.assignedSite, ...safeArr(session.accessibleSites)];
            filtered = filtered.filter(i => allowedSites.includes(i.siteId));
        }

        // 2. Filter by Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(i =>
                (i.title && i.title.toLowerCase().includes(q)) ||
                (i.id && i.id.toLowerCase().includes(q)) ||
                (i.type && i.type.toLowerCase().includes(q))
            );
        }

        // Sort newest first
        return filtered.sort((a, b) => new Date(b.date || b.incidentDate) - new Date(a.date || a.incidentDate));
    }, [incidents, session, searchQuery]);


    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-red-400 font-['Space_Grotesk'] uppercase tracking-widest"><i className="fas fa-circle-notch fa-spin mr-3 text-2xl"></i> Loading Incident Database...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-red-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-500 to-rose-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i className="fas fa-briefcase-medical"></i>
                    </div>
                    <h1 className="text-xl font-bold text-white uppercase tracking-wide">Incident Management</h1>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" placeholder="Search Incidents..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-red-500 w-64 shadow-inner" />
                    </div>
                    <button onClick={() => setActiveTab('report')} className="bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-red-900/50 transition-transform active:scale-95 text-xs flex items-center gap-2">
                        <i className="fas fa-plus"></i> Report Incident
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500">

                    {/* DASHBOARD STATS */}
                    {activeTab === 'registry' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-blue-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Total Logged</h3>
                                    <div className="text-3xl font-black text-white">{filteredIncidents.length}</div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-orange-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Open Investigations</h3>
                                    <div className="text-3xl font-black text-orange-400">{filteredIncidents.filter(i => i.status !== 'Closed').length}</div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-red-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Lost Time Injuries (LTI)</h3>
                                    <div className="text-3xl font-black text-red-400">{filteredIncidents.filter(i => i.type === 'LTI' || i.incidentType === 'LTI').length}</div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-yellow-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Near Misses</h3>
                                    <div className="text-3xl font-black text-yellow-400">{filteredIncidents.filter(i => i.type === 'Near Miss' || i.incidentType === 'Near Miss').length}</div>
                                </div>
                            </div>

                            {/* INCIDENT REGISTRY TABLE */}
                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-white uppercase tracking-widest"><i className="fas fa-list text-red-500 mr-2"></i> Master Incident Log</h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                                            <tr>
                                                <th className="p-5 pl-8">Incident Details</th>
                                                <th className="p-5">Classification</th>
                                                <th className="p-5">Location / Site</th>
                                                <th className="p-5">Date & Time</th>
                                                <th className="p-5">Status</th>
                                                <th className="p-5 pr-8 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                                            {filteredIncidents.map(inc => (
                                                <tr key={inc.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                    <td className="p-5 pl-8">
                                                        <div className="font-bold text-white">{inc.title || 'Untitled Incident'}</div>
                                                        <div className="text-[10px] font-mono text-slate-500 mt-1">{inc.id || inc.firebaseKey}</div>
                                                    </td>
                                                    <td className="p-5">
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${['LTI', 'Fatality'].includes(inc.type) ? 'bg-red-900/30 text-red-400 border-red-500/30' :
                                                                inc.type === 'Near Miss' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' :
                                                                    'bg-orange-900/30 text-orange-400 border-orange-500/30'
                                                            }`}>{inc.type || inc.incidentType || 'Unclassified'}</span>
                                                    </td>
                                                    <td className="p-5">
                                                        <div className="font-bold text-slate-300">{inc.siteId}</div>
                                                    </td>
                                                    <td className="p-5 font-mono text-xs">
                                                        {inc.date || inc.incidentDate || 'Unknown'}
                                                    </td>
                                                    <td className="p-5">
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${inc.status === 'Closed' ? 'text-emerald-400' : 'text-orange-400'}`}>
                                                            {inc.status || 'Open'}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 pr-8 text-right">
                                                        <button className="bg-slate-800 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow">Investigate</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {filteredIncidents.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No incidents match your search criteria.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* REPORT BUILDER (Placeholder) */}
                    {activeTab === 'report' && (
                        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl p-10 text-center">
                            <i className="fas fa-file-medical text-6xl text-slate-600 mb-4"></i>
                            <h2 className="text-2xl font-bold text-white">Incident Reporting Interface</h2>
                            <p className="text-slate-400 mt-2">Your form logic for immediate reporting and root cause analysis goes here.</p>
                            <button onClick={() => setActiveTab('registry')} className="mt-6 text-red-400 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors border-b border-red-500/50 pb-1">Return to Registry</button>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}