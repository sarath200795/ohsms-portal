import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import useStore from '../../store/useStore';
import { safeArr } from '../../utils/helpers';

import PtwDashboard from './components/PtwDashboard';
import PtwRegistry from './components/PtwRegistry';
import PermitBuilder from './components/PermitBuilder';
import PermitViewer from './components/PermitViewer'; // IMPORT THE NEW VIEWER

export default function PTW() {
    const navigate = useNavigate();
    const { session, initializeSession } = useStore();
    const [resolvedSession, setResolvedSession] = useState(session);

    const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'builder', 'viewer'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPermit, setSelectedPermit] = useState(null); // STATE FOR THE VIEWER

    useEffect(() => {
        if (session?.orgId) {
            setResolvedSession(session);
            return;
        }

        const raw = sessionStorage.getItem('isoSession');
        if (!raw) {
            navigate('/');
            return;
        }

        const storedSession = JSON.parse(raw);
        const hasAccess = ['Global Owner', 'Global Manager', 'Owner', 'Admin'].includes(storedSession.role) ||
            safeArr(storedSession.accessibleModules).includes('PTW') ||
            safeArr(storedSession.accessibleModules).includes('OHS Tools');

        if (!hasAccess) {
            alert('You do not have permission to access the PTW module.');
            navigate('/dashboard');
            return;
        }

        initializeSession(storedSession);
        setResolvedSession(storedSession);
    }, [session, initializeSession, navigate]);

    const { data, loading, error } = useFirebaseData(resolvedSession?.orgId, ['ptwRecords', 'sites', 'contractors']);

    const permits = data.ptwRecords || [];
    const sites = data.sites || [];
    const contractors = data.contractors || [];

    const filteredPermits = useMemo(() => {
        let filtered = permits;
        if (resolvedSession && resolvedSession.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(resolvedSession.role)) {
            const allowedSites = [resolvedSession.assignedSite, ...safeArr(resolvedSession.accessibleSites)];
            filtered = filtered.filter(p => allowedSites.includes(p.siteId));
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => (p.id && p.id.toLowerCase().includes(q)) || (p.workDescription && p.workDescription.toLowerCase().includes(q)));
        }
        return filtered.sort((a, b) => new Date(b.createdAt || b.validFromDate) - new Date(a.createdAt || a.validFromDate));
    }, [permits, resolvedSession, searchQuery]);

    const handleViewPermit = (permit) => {
        setSelectedPermit(permit);
        setActiveTab('viewer');
    };

    if (!resolvedSession) {
        return <div className="h-screen flex items-center justify-center bg-slate-950 text-emerald-400 font-['Space_Grotesk'] tracking-widest uppercase"><i className="fas fa-circle-notch fa-spin mr-3"></i> Verifying PTW Access...</div>;
    }

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-emerald-400 font-['Space_Grotesk'] tracking-widest uppercase"><i className="fas fa-circle-notch fa-spin mr-3"></i> Loading PTW Engine...</div>;

    if (error) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-200 font-['Space_Grotesk'] p-6">
                <div className="max-w-md w-full bg-slate-900/80 border border-red-500/30 rounded-3xl p-8 text-center">
                    <div className="text-red-400 text-3xl mb-4"><i className="fas fa-triangle-exclamation"></i></div>
                    <h2 className="text-xl font-bold text-white mb-2">PTW Could Not Load</h2>
                    <p className="text-sm text-slate-400 mb-6">{error.message || 'The Permit To Work module could not fetch its data.'}</p>
                    <button onClick={() => navigate('/dashboard')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-widest">
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <style dangerouslySetInnerHTML={{ __html: `.glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); }` }} />
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
                {activeTab === 'registry' && (
                    <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
                        <PtwDashboard permits={filteredPermits} />
                        {/* PASSING THE ONVIEW FUNCTION TO THE REGISTRY */}
                        <PtwRegistry permits={filteredPermits} onView={handleViewPermit} />
                    </div>
                )}

                {activeTab === 'builder' && (
                    <PermitBuilder session={resolvedSession} sites={sites} contractors={contractors} onCancel={() => setActiveTab('registry')} onSuccess={() => setActiveTab('registry')} />
                )}

                {/* SHOWING THE VIEWER WHEN A PERMIT IS CLICKED */}
                {activeTab === 'viewer' && selectedPermit && (
                    <PermitViewer permit={selectedPermit} session={resolvedSession} onCancel={() => { setSelectedPermit(null); setActiveTab('registry'); }} onUpdate={() => setActiveTab('registry')} />
                )}
            </main>
        </div>
    );
}
