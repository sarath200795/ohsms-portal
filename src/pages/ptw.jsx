import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, set, update } from 'firebase/database';
import { rtdb } from '../config/firebase';

// --- NEW UTILITY IMPORTS (PHASE 1) ---
import { safeArr, safeArrayParse } from '../utils/helpers';
import { PERMIT_TYPES, getTypeConfig, CHECKLIST_ITEMS, COMMON_PPE, WAH_EQUIP_OPTIONS } from '../utils/constants';

export default function PTW() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    // Core Data States
    const [permits, setPermits] = useState([]);
    const [sites, setSites] = useState([]);
    const [contractors, setContractors] = useState([]);
    const [users, setUsers] = useState([]);

    // UI States
    const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'builder'
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) return navigate('/');
        const sess = JSON.parse(s);

        // RBAC Verification
        const hasAccess = ['Global Owner', 'Global Manager', 'Admin'].includes(sess.role) ||
            safeArr(sess.accessibleModules).includes('PTW');
        if (!hasAccess) {
            alert("You do not have permission to access the PTW module.");
            return navigate('/dashboard');
        }

        setSession(sess);

        // --- NEW TARGETED FETCHING (PHASE 2) ---
        // Downloads ONLY what PTW needs, parallelized for maximum speed
        const fetchTargetedData = async () => {
            try {
                const orgRef = `organizations/${sess.orgId}`;
                const [ptwSnap, sitesSnap, contractorsSnap, usersSnap] = await Promise.all([
                    get(ref(rtdb, `${orgRef}/ptwRecords`)),
                    get(ref(rtdb, `${orgRef}/sites`)),
                    get(ref(rtdb, `${orgRef}/contractors`)),
                    get(ref(rtdb, `${orgRef}/users`))
                ]);

                if (ptwSnap.exists()) setPermits(safeArrayParse(ptwSnap.val()));
                if (sitesSnap.exists()) {
                    setSites(Object.keys(sitesSnap.val()).map(k => ({ code: sitesSnap.val()[k].code || k, name: sitesSnap.val()[k].name || k })));
                }
                if (contractorsSnap.exists()) setContractors(safeArrayParse(contractorsSnap.val()));
                if (usersSnap.exists()) setUsers(safeArrayParse(usersSnap.val()));

            } catch (error) {
                console.error("PTW Data Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTargetedData();
    }, [navigate]);

    // --- RBAC Filter Engine ---
    const filteredPermits = useMemo(() => {
        let filtered = permits;

        // 1. Filter by Site Access
        if (session && session.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(session.role)) {
            const allowedSites = [session.assignedSite, ...safeArr(session.accessibleSites)];
            filtered = filtered.filter(p => allowedSites.includes(p.siteId));
        }

        // 2. Filter by Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p =>
                (p.id && p.id.toLowerCase().includes(q)) ||
                (p.workDescription && p.workDescription.toLowerCase().includes(q)) ||
                (p.contractorName && p.contractorName.toLowerCase().includes(q))
            );
        }

        // Sort newest first
        return filtered.sort((a, b) => new Date(b.createdAt || b.validFromDate) - new Date(a.createdAt || a.validFromDate));
    }, [permits, session, searchQuery]);


    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-emerald-400 font-['Space_Grotesk'] uppercase tracking-widest"><i className="fas fa-circle-notch fa-spin mr-3 text-2xl"></i> Loading PTW Engine...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i className="fas fa-clipboard-check"></i>
                    </div>
                    <h1 className="text-xl font-bold text-white uppercase tracking-wide">Permit To Work (PTW)</h1>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" placeholder="Search Permits..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-emerald-500 w-64 shadow-inner" />
                    </div>
                    <button onClick={() => setActiveTab('builder')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-emerald-900/50 transition-transform active:scale-95 text-xs flex items-center gap-2">
                        <i className="fas fa-plus"></i> Create Permit
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
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Total Permits</h3>
                                    <div className="text-3xl font-black text-white">{filteredPermits.length}</div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-emerald-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Active / Open</h3>
                                    <div className="text-3xl font-black text-emerald-400">{filteredPermits.filter(p => p.status !== 'Closed' && p.status !== 'Cancelled').length}</div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-orange-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Pending Approval</h3>
                                    <div className="text-3xl font-black text-orange-400">{filteredPermits.filter(p => p.status === 'Pending').length}</div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-red-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">High Risk (Hot/CSE)</h3>
                                    <div className="text-3xl font-black text-red-400">{filteredPermits.filter(p => ['HOT', 'CSE'].includes(p.permitType)).length}</div>
                                </div>
                            </div>

                            {/* PTW REGISTRY TABLE */}
                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-white uppercase tracking-widest"><i className="fas fa-list text-emerald-500 mr-2"></i> Active Permit Registry</h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                                            <tr>
                                                <th className="p-5 pl-8">Permit ID & Type</th>
                                                <th className="p-5">Location / Site</th>
                                                <th className="p-5">Contractor / Agency</th>
                                                <th className="p-5">Validity</th>
                                                <th className="p-5">Status</th>
                                                <th className="p-5 pr-8 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                                            {filteredPermits.map(p => {
                                                const tConfig = getTypeConfig(p.permitType || p.typeId);
                                                return (
                                                    <tr key={p.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                        <td className="p-5 pl-8">
                                                            <div className="font-bold text-white font-mono">{p.id || p.firebaseKey}</div>
                                                            <div className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${tConfig.color}`}>{tConfig.label}</div>
                                                        </td>
                                                        <td className="p-5">
                                                            <div className="font-bold text-slate-300">{p.location}</div>
                                                            <div className="text-[10px] text-slate-500 font-mono mt-1">{p.siteId}</div>
                                                        </td>
                                                        <td className="p-5">
                                                            <div className="font-bold text-slate-300">{p.contractorName || 'Internal Team'}</div>
                                                        </td>
                                                        <td className="p-5 font-mono text-xs">
                                                            {p.validFromDate ? p.validFromDate.split('T')[0] : 'N/A'}
                                                        </td>
                                                        <td className="p-5">
                                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${p.status === 'Closed' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' :
                                                                    p.status === 'Pending' ? 'bg-orange-900/30 text-orange-400 border-orange-500/30' :
                                                                        'bg-blue-900/30 text-blue-400 border-blue-500/30'
                                                                }`}>{p.status}</span>
                                                        </td>
                                                        <td className="p-5 pr-8 text-right">
                                                            <button className="bg-slate-800 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow">View / Audit</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {filteredPermits.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No permits found matching your criteria.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* PERMIT BUILDER (Placeholder for your form logic) */}
                    {activeTab === 'builder' && (
                        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl p-10 text-center">
                            <i className="fas fa-tools text-6xl text-slate-600 mb-4"></i>
                            <h2 className="text-2xl font-bold text-white">Permit Builder Interface</h2>
                            <p className="text-slate-400 mt-2">Your form logic utilizing <span className="text-emerald-400 font-mono">PERMIT_TYPES</span> and <span className="text-emerald-400 font-mono">CHECKLIST_ITEMS</span> goes here.</p>
                            <button onClick={() => setActiveTab('registry')} className="mt-6 text-emerald-400 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors border-b border-emerald-500/50 pb-1">Return to Registry</button>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}