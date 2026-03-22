// src/pages/Incidents/index.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// Phase 4 Hook & Global Store
import { useFirebaseData } from '../../hooks/useFirebaseData';
import useStore from '../../store/useStore';
import { safeArr } from '../../utils/helpers';

// Child Components
import IncidentDashboard from './components/IncidentDashboard';
import IncidentRegistry from './components/IncidentRegistry';
import IncidentBuilder from './components/IncidentBuilder';

export default function Incidents() {
    const navigate = useNavigate();
    const { session } = useStore();
    
    // UI States
    const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'report'
    const [searchQuery, setSearchQuery] = useState('');

    // --- PHASE 4: THE MAGIC HOOK ---
    // Fetches exactly what we need, in parallel, and caches it!
    const { data, loading } = useFirebaseData(session?.orgId, ['incidents', 'sites', 'users', 'contractors']);

    const incidents = data.incidents || [];
    const sites = data.sites || [];
    const users = data.users || [];
    const contractors = data.contractors || [];

    // RBAC Filter Engine
    const filteredIncidents = useMemo(() => {
        let filtered = incidents;
        if (session && session.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(session.role)) {
            const allowedSites = [session.assignedSite, ...safeArr(session.accessibleSites)];
            filtered = filtered.filter(i => allowedSites.includes(i.siteId));
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(i => 
                (i.title && i.title.toLowerCase().includes(q)) || 
                (i.id && i.id.toLowerCase().includes(q)) ||
                (i.type && i.type.toLowerCase().includes(q))
            );
        }
        return filtered.sort((a, b) => new Date(b.date || b.incidentDate) - new Date(a.date || a.incidentDate));
    }, [incidents, session, searchQuery]);

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-red-400 font-['Space_Grotesk'] tracking-widest uppercase"><i className="fas fa-circle-notch fa-spin mr-3"></i> Loading Incident Database...</div>;

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
                {activeTab === 'registry' && (
                    <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
                        <IncidentDashboard incidents={filteredIncidents} />
                        <IncidentRegistry incidents={filteredIncidents} />
                    </div>
                )}

                {activeTab === 'report' && (
                    <IncidentBuilder 
                        session={session} 
                        sites={sites} 
                        users={users}
                        contractors={contractors}
                        onCancel={() => setActiveTab('registry')} 
                        onSuccess={() => setActiveTab('registry')} 
                    />
                )}
            </main>
        </div>
    );
}