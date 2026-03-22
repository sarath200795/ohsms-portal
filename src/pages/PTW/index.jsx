// src/pages/PTW/index.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { rtdb } from '../../config/firebase';
import { safeArr, safeArrayParse } from '../../utils/helpers';

// Import Child Components
import PtwDashboard from './components/PtwDashboard';
import PtwRegistry from './components/PtwRegistry';
import PermitBuilder from './components/PermitBuilder';

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
        
        const hasAccess = ['Global Owner', 'Global Manager', 'Admin'].includes(sess.role) || safeArr(sess.accessibleModules).includes('PTW');
        if (!hasAccess) {
            alert("Permission denied.");
            return navigate('/dashboard');
        }
        
        setSession(sess);

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
                if (sitesSnap.exists()) setSites(Object.keys(sitesSnap.val()).map(k => ({ code: sitesSnap.val()[k].code || k, name: sitesSnap.val()[k].name || k })));
                if (contractorsSnap.exists()) setContractors(safeArrayParse(contractorsSnap.val()));
                if (usersSnap.exists()) setUsers(safeArrayParse(usersSnap.val()));
            } catch (error) {
                console.error("Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTargetedData();
    }, [navigate]);

    const filteredPermits = useMemo(() => {
        let filtered = permits;
        if (session && session.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(session.role)) {
            const allowedSites = [session.assignedSite, ...safeArr(session.accessibleSites)];
            filtered = filtered.filter(p => allowedSites.includes(p.siteId));
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => (p.id && p.id.toLowerCase().includes(q)) || (p.workDescription && p.workDescription.toLowerCase().includes(q)));
        }
        return filtered.sort((a, b) => new Date(b.createdAt || b.validFromDate) - new Date(a.createdAt || a.validFromDate));
    }, [permits, session, searchQuery]);

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-emerald-400 font-['Space_Grotesk'] tracking-widest uppercase">Loading PTW Engine...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-clipboard-check"></i></div>
                    <h1 className="text-xl font-bold text-white uppercase tracking-wide">Permit To Work</h1>
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
                    
                    {/* DELEGATING UI TO CHILD COMPONENTS */}
                    {activeTab === 'registry' && (
                        <>
                            <PtwDashboard permits={filteredPermits} />
                            <PtwRegistry permits={filteredPermits} />
                        </>
                    )}

                    {activeTab === 'builder' && (
                        <PermitBuilder onCancel={() => setActiveTab('registry')} />
                    )}

                </div>
            </main>
        </div>
    );
}