import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function DeploymentsView({
    canEdit,
    contractors,
    deploymentCompanyFilter,
    quickUpdateWorkerDeployment,
    setDeploymentCompanyFilter,
    visibleSites = []
}) {
    return (
        <div className="space-y-6">
            <div className="flex justify-start mb-4">
                <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-xl border border-slate-800 shadow-inner">
                    <i className="fas fa-building text-slate-500 ml-2"></i>
                    <select value={deploymentCompanyFilter} onChange={(event) => setDeploymentCompanyFilter(event.target.value)} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg outline-none w-64 shadow-inner">
                        <option value="All">Filter by Company (All)</option>
                        {contractors.map((contractor) => <option key={contractor.firebaseKey} value={contractor.firebaseKey}>{contractor.companyName}</option>)}
                    </select>
                </div>
            </div>

            {contractors.filter((contractor) => deploymentCompanyFilter === 'All' || contractor.firebaseKey === deploymentCompanyFilter).map((contractor) => {
                const contractorWorkers = safeArr(contractor.workers);
                if (contractorWorkers.length === 0) return null;

                // Same fallback pattern as AddWorkerModal: prefer the
                // contractor's allocatedSites, but if none have been
                // granted yet (typical for a freshly-approved self-
                // registered vendor) fall back to the admin's full
                // visibleSites list so the per-worker dropdown still has
                // options the admin can pick.
                const allocated = safeArr(contractor.allocatedSites).filter(Boolean);
                const useAllocated = allocated.length > 0;
                const sitesForDropdown = useAllocated
                    ? allocated.map((code) => {
                        const meta = safeArr(visibleSites).find((s) => s.code === code);
                        return { code, name: meta?.name || code };
                    })
                    : safeArr(visibleSites).map((s) => ({ code: s.code, name: s.name || s.code }));

                return (
                    <div key={contractor.firebaseKey} className="bg-slate-900/50 rounded-2xl border border-slate-700 p-6 shadow-xl mb-6">
                        <div className="flex justify-between items-start mb-6 border-b border-slate-800 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">{contractor.companyName}</h3>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest mr-2">Authorized Sites:</span>
                                    {useAllocated
                                        ? allocated.map((site) => <span key={site} className="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded font-bold">{site}</span>)
                                        : <span className="text-[10px] text-amber-300 italic">No sites granted yet — picker shows all sites visible to you. Lock down via Users → Edit.</span>}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Total Deployed</div>
                                <div className="text-2xl font-mono font-bold text-white">{contractorWorkers.length}</div>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-950 shadow-inner custom-scroll">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900/90 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-700 tracking-widest">
                                    <tr>
                                        <th className="p-4 pl-6 w-1/3">Worker Details</th>
                                        <th className="p-4 w-1/4">Role / Competence</th>
                                        <th className="p-4 pr-6 w-1/3">Current Deployment Site</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {contractorWorkers.map((worker) => (
                                        <tr key={worker.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="p-4 pl-6 font-bold text-white">{worker.name}</td>
                                            <td className="p-4">
                                                <div className="text-xs text-slate-300">{worker.role}</div>
                                                <div className="text-[9px] text-slate-500 mt-1 uppercase tracking-widest truncate max-w-[200px]">{worker.competence}</div>
                                            </td>
                                            <td className="p-4 pr-6">
                                                <select value={worker.deployedSite || ''} onChange={(event) => quickUpdateWorkerDeployment(contractor.firebaseKey, worker.id, event.target.value)} disabled={!canEdit} className={`w-full bg-slate-900 border rounded-lg text-xs p-2 outline-none transition-colors font-bold shadow-inner ${worker.deployedSite ? 'border-emerald-500/50 text-emerald-400 focus:border-emerald-500' : 'border-red-500/50 text-red-400 focus:border-red-500'}`}>
                                                    <option value="">Unassigned / Pending</option>
                                                    {sitesForDropdown.map((site) => <option key={site.code} value={site.code}>{site.name} ({site.code})</option>)}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            {contractors.filter((contractor) => safeArr(contractor.workers).length > 0).length === 0 && (
                <div className="text-center p-12 bg-slate-900/50 rounded-2xl border border-slate-700 text-slate-500 italic">No contractor workers have been registered yet. Add workers to see deployments.</div>
            )}
        </div>
    );
}
