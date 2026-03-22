import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, set, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase';

// --- NEW UTILITY IMPORTS (PHASE 1) ---
import { safeArr, safeArrayParse, getComplianceStatus, fileToBase64 } from '../utils/helpers';
import { SERVICE_TYPES, getMandatoryDocs } from '../utils/constants';

export default function Contractors() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    // Core Data States
    const [contractors, setContractors] = useState([]);
    const [sites, setSites] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // UI States
    const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'onboard'

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) return navigate('/');
        const sess = JSON.parse(s);

        // RBAC Verification
        const hasAccess = ['Global Owner', 'Global Manager', 'Admin'].includes(sess.role) ||
            safeArr(sess.accessibleModules).includes('Contractor Management');
        if (!hasAccess) {
            alert("You do not have permission to access Contractor Management.");
            return navigate('/dashboard');
        }

        setSession(sess);

        // --- NEW TARGETED FETCHING (PHASE 2) ---
        // Downloads ONLY what Contractor Management needs
        const fetchTargetedData = async () => {
            try {
                const orgRef = `organizations/${sess.orgId}`;
                const [contractorsSnap, sitesSnap] = await Promise.all([
                    get(ref(rtdb, `${orgRef}/contractors`)),
                    get(ref(rtdb, `${orgRef}/sites`))
                ]);

                if (contractorsSnap.exists()) setContractors(safeArrayParse(contractorsSnap.val()));
                if (sitesSnap.exists()) {
                    setSites(Object.keys(sitesSnap.val()).map(k => ({ code: sitesSnap.val()[k].code || k, name: sitesSnap.val()[k].name || k })));
                }

            } catch (error) {
                console.error("Contractor Data Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTargetedData();
    }, [navigate]);

    // --- RBAC Filter Engine ---
    const filteredContractors = useMemo(() => {
        let filtered = contractors;

        // 1. Filter by Site Access
        if (session && session.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(session.role)) {
            const allowedSites = [session.assignedSite, ...safeArr(session.accessibleSites)];
            filtered = filtered.filter(c => safeArr(c.allocatedSites).some(site => allowedSites.includes(site)));
        }

        // 2. Filter by Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(c =>
                (c.companyName && c.companyName.toLowerCase().includes(q)) ||
                (c.vendorCode && c.vendorCode.toLowerCase().includes(q)) ||
                (c.serviceType && c.serviceType.toLowerCase().includes(q))
            );
        }

        return filtered;
    }, [contractors, session, searchQuery]);


    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-indigo-400 font-['Space_Grotesk'] uppercase tracking-widest"><i className="fas fa-circle-notch fa-spin mr-3 text-2xl"></i> Loading Vendor Network...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i className="fas fa-hard-hat"></i>
                    </div>
                    <h1 className="text-xl font-bold text-white uppercase tracking-wide">Contractor Management</h1>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" placeholder="Search Vendors..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-indigo-500 w-64 shadow-inner" />
                    </div>
                    <button onClick={() => setActiveTab('onboard')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-indigo-900/50 transition-transform active:scale-95 text-xs flex items-center gap-2">
                        <i className="fas fa-plus"></i> Onboard Vendor
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500">

                    {/* DASHBOARD STATS */}
                    {activeTab === 'registry' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-indigo-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Approved Vendors</h3>
                                    <div className="text-3xl font-black text-white">{filteredContractors.length}</div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-emerald-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Total Workforce</h3>
                                    <div className="text-3xl font-black text-emerald-400">
                                        {filteredContractors.reduce((acc, c) => acc + safeArr(c.workers).length, 0)}
                                    </div>
                                </div>
                                <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-red-500">
                                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Compliance Alerts</h3>
                                    <div className="text-3xl font-black text-red-400">
                                        {filteredContractors.filter(c => getComplianceStatus(c.documents).pct < 100).length}
                                    </div>
                                </div>
                            </div>

                            {/* VENDOR REGISTRY TABLE */}
                            <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
                                <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-white uppercase tracking-widest"><i className="fas fa-building text-indigo-500 mr-2"></i> Master Vendor List</h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                                            <tr>
                                                <th className="p-5 pl-8">Company & ID</th>
                                                <th className="p-5">Service Category</th>
                                                <th className="p-5">Authorized Sites</th>
                                                <th className="p-5">Compliance Score</th>
                                                <th className="p-5">Workforce</th>
                                                <th className="p-5 pr-8 text-right">Profile</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                                            {filteredContractors.map(c => {
                                                const status = getComplianceStatus(c.documents);
                                                return (
                                                    <tr key={c.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                                        <td className="p-5 pl-8">
                                                            <div className="font-bold text-white">{c.companyName}</div>
                                                            <div className="text-[10px] text-indigo-400 font-mono mt-1 font-bold">{c.vendorCode}</div>
                                                        </td>
                                                        <td className="p-5 text-xs text-slate-400 font-bold">
                                                            {c.serviceType}
                                                        </td>
                                                        <td className="p-5 font-mono text-[10px] text-slate-500">
                                                            {safeArr(c.allocatedSites).join(', ')}
                                                        </td>
                                                        <td className="p-5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                                    <div className={`h-full ${status.pct === 100 ? 'bg-emerald-500' : status.pct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${status.pct}%` }}></div>
                                                                </div>
                                                                <span className={`text-[10px] font-bold ${status.pct === 100 ? 'text-emerald-400' : status.pct > 50 ? 'text-yellow-400' : 'text-red-400'}`}>{status.pct}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-5 font-bold text-slate-300">
                                                            <i className="fas fa-users text-slate-500 mr-2"></i>{safeArr(c.workers).length}
                                                        </td>
                                                        <td className="p-5 pr-8 text-right">
                                                            <button className="bg-slate-800 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow">Manage</button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {filteredContractors.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No vendors found matching your criteria.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* VENDOR ONBOARDING (Placeholder) */}
                    {activeTab === 'onboard' && (
                        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl p-10 text-center">
                            <i className="fas fa-file-signature text-6xl text-slate-600 mb-4"></i>
                            <h2 className="text-2xl font-bold text-white">Vendor Onboarding Interface</h2>
                            <p className="text-slate-400 mt-2">Your form logic utilizing <span className="text-indigo-400 font-mono">SERVICE_TYPES</span> goes here.</p>
                            <button onClick={() => setActiveTab('registry')} className="mt-6 text-indigo-400 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors border-b border-indigo-500/50 pb-1">Return to Registry</button>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}