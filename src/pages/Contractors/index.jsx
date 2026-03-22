import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { rtdb } from '../../config/firebase';
import { safeArr, safeArrayParse } from '../../utils/helpers';
import ContractorRegistry from './components/ContractorRegistry';
import ContractorBuilder from './components/ContractorBuilder';

export default function Contractors() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [contractors, setContractors] = useState([]);
    const [sites, setSites] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('registry');

    useEffect(() => {
        const rawSession = sessionStorage.getItem('isoSession');
        if (!rawSession) {
            navigate('/');
            return;
        }

        const sess = JSON.parse(rawSession);
        const hasAccess = ['Global Owner', 'Global Manager', 'Admin'].includes(sess.role) ||
            safeArr(sess.accessibleModules).includes('Contractor Management');

        if (!hasAccess) {
            alert('You do not have permission to access Contractor Management.');
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        const fetchTargetedData = async () => {
            try {
                const orgRef = `organizations/${sess.orgId}`;
                const [contractorsSnap, sitesSnap] = await Promise.all([
                    get(ref(rtdb, `${orgRef}/contractors`)),
                    get(ref(rtdb, `${orgRef}/sites`))
                ]);

                if (contractorsSnap.exists()) {
                    setContractors(safeArrayParse(contractorsSnap.val()));
                }

                if (sitesSnap.exists()) {
                    setSites(
                        Object.keys(sitesSnap.val()).map((key) => ({
                            code: sitesSnap.val()[key].code || key,
                            name: sitesSnap.val()[key].name || key
                        }))
                    );
                }
            } catch (error) {
                console.error('Contractor Data Fetch Error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTargetedData();
    }, [navigate]);

    const filteredContractors = useMemo(() => {
        let filtered = contractors;

        if (session && session.assignedSite !== 'GLOBAL' && !['Global Owner', 'Admin'].includes(session.role)) {
            const allowedSites = [session.assignedSite, ...safeArr(session.accessibleSites)];
            filtered = filtered.filter((contractor) =>
                safeArr(contractor.allocatedSites).some((site) => allowedSites.includes(site))
            );
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((contractor) =>
                (contractor.companyName && contractor.companyName.toLowerCase().includes(query)) ||
                (contractor.vendorCode && contractor.vendorCode.toLowerCase().includes(query)) ||
                (contractor.serviceType && contractor.serviceType.toLowerCase().includes(query))
            );
        }

        return filtered;
    }, [contractors, searchQuery, session]);

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-950 text-indigo-400 font-['Space_Grotesk'] uppercase tracking-widest">
                <i className="fas fa-circle-notch fa-spin mr-3 text-2xl"></i>
                Loading Vendor Network...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-slate-200 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

            <header className="h-20 px-8 flex items-center justify-between z-20 backdrop-blur-sm bg-slate-900/50 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                    >
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
                        <input
                            type="text"
                            placeholder="Search Vendors..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-indigo-500 w-64 shadow-inner"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setActiveTab('onboard')}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-indigo-900/50 transition-transform active:scale-95 text-xs flex items-center gap-2"
                    >
                        <i className="fas fa-plus"></i> Onboard Vendor
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scroll relative z-10 w-full">
                <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
                    {activeTab === 'registry' && <ContractorRegistry contractors={filteredContractors} />}
                    {activeTab === 'onboard' && <ContractorBuilder sites={sites} onCancel={() => setActiveTab('registry')} />}
                </div>
            </main>
        </div>
    );
}
