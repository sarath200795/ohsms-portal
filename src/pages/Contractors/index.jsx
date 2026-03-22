import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import useStore from '../../store/useStore';

// Child Components
import ContractorRegistry from './components/ContractorRegistry';
import ContractorBuilder from './components/ContractorBuilder';
import ContractorViewer from './components/ContractorViewer';

export default function Contractors() {
    const navigate = useNavigate();
    const { session } = useStore();
    
    const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'builder', 'viewer'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedContractor, setSelectedContractor] = useState(null);

    const { data, loading } = useFirebaseData(session?.orgId, ['contractors', 'sites']);

    // Bulletproof array fallbacks
    const contractors = Array.isArray(data?.contractors) ? data.contractors : [];
    const sites = Array.isArray(data?.sites) ? data.sites : [];

    const filteredContractors = useMemo(() => {
        let filtered = contractors;
        
        // RBAC Filter
        if (session && session.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(session.role)) {
            const allowedSites = [session.assignedSite, ...(Array.isArray(session.accessibleSites) ? session.accessibleSites : [])];
            filtered = filtered.filter(c => {
                const cSites = Array.isArray(c.allocatedSites) ? c.allocatedSites : [];
                return cSites.some(site => allowedSites.includes(site));
            });
        }
        
        // Search Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(c => 
                (c.companyName && c.companyName.toLowerCase().includes(q)) || 
                (c.vendorCode && c.vendorCode.toLowerCase().includes(q))
            );
        }
        return filtered;
    }, [contractors, session, searchQuery]);

    const handleView = (contractor) => {
        setSelectedContractor(contractor);
        setActiveTab('viewer');
    };

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-950 text-indigo-400 font-['Space_Grotesk'] tracking-widest uppercase"><i className="fas fa-circle-notch fa-spin mr-3"></i> Loading Vendors...</div>;

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <style dangerouslySetInnerHTML={{ __html: `.glass-panel { background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(16px); }` }} />
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"><i className="fas fa-arrow-left"></i> Hub</button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg"><i className="fas fa-hard-hat"></i></div>
                    <h1 className="text-xl font-bold text-white uppercase tracking-wide">Contractor Management</h1>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" placeholder="Search Vendors..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-indigo-500 w-64 shadow-inner" />
                    </div>
                    <button onClick={() => setActiveTab('builder')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg transition-transform active:scale-95 text-xs flex items-center gap-2">
                        <i className="fas fa-plus"></i> Onboard Vendor
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 w-full">
                {activeTab === 'registry' && (
                    <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
                        <ContractorRegistry contractors={filteredContractors} onView={handleView} />
                    </div>
                )}

                {activeTab === 'builder' && (
                    <ContractorBuilder session={session} sites={sites} onCancel={() => setActiveTab('registry')} onSuccess={() => setActiveTab('registry')} />
                )}

                {activeTab === 'viewer' && selectedContractor && (
                    <ContractorViewer 
                        contractor={selectedContractor} 
                        session={session}
                        onCancel={() => { setSelectedContractor(null); setActiveTab('registry'); }} 
                    />
                )}
            </main>
        </div>
    );
}