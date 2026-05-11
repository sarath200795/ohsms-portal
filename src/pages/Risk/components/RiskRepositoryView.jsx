import React from 'react';
import { getRiskClass } from '../utils';

const getHazardMetrics = (assessment) => {
    let maxRisk = 0;
    let hazardCount = 0;

    (assessment.activities || []).forEach((activity) => {
        (activity.hazards || []).forEach((hazard) => {
            hazardCount += 1;
            if (hazard.r2 > maxRisk) maxRisk = hazard.r2;
        });
    });

    return { hazardCount, maxRisk };
};

export default function RiskRepositoryView({
    filterSite,
    regionFilter,
    regionOptions,
    filteredVisibleSites,
    onFilterRegionChange,
    onFilterSiteChange,
    filterStatus,
    onFilterStatusChange,
    isGlobalUser,
    onExport,
    totalGlobalHazards,
    highRiskCount,
    alarpCount,
    filteredRepo,
    onPrint,
    onOpenRecord,
    onDeleteRecord,
    canEditRecord,
    canDeleteRecord
}) {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
            <div className="flex justify-between items-end mb-4">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">HIRA Repository</h2>
                    <p className="text-sm text-slate-400">Master database of all facility risk assessments.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-slate-900 border border-slate-700 p-1.5 rounded-xl flex gap-2 shadow-inner">
                        <select value={regionFilter} onChange={onFilterRegionChange} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                            <option value="All">All Regions</option>
                            {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                        </select>
                        <select value={filterSite} onChange={onFilterSiteChange} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                            {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                            {filteredVisibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                        </select>
                        <select value={filterStatus} onChange={(e) => onFilterStatusChange(e.target.value)} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                            <option value="All">All Statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Active">Active / Approved</option>
                            <option value="Archived">Archived</option>
                        </select>
                    </div>
                    <button type="button" onClick={onExport} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors shadow flex items-center gap-2"><i className="fas fa-file-excel text-emerald-500"></i> Export</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-blue-500 shadow-xl">
                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">Total Hazards Identified</div>
                    <div className="text-4xl font-bold">{totalGlobalHazards}</div>
                </div>
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-500 shadow-xl">
                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">High Risk (Residual)</div>
                    <div className="text-4xl font-bold text-red-500">{highRiskCount}</div>
                </div>
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl">
                    <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">ALARP Cases</div>
                    <div className="text-4xl font-bold text-yellow-400">{alarpCount}</div>
                </div>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                        <tr>
                            <th className="p-5 pl-6">Doc ID</th>
                            <th className="p-5">Assessment Name</th>
                            <th className="p-5">Site</th>
                            <th className="p-5">Date</th>
                            <th className="p-5 text-center">Hazards</th>
                            <th className="p-5 text-center">Max Risk</th>
                            <th className="p-5 pr-6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                        {filteredRepo.map((assessment) => {
                            const { hazardCount, maxRisk } = getHazardMetrics(assessment);

                            return (
                                <tr key={assessment.firebaseKey} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-5 pl-6 font-mono text-xs text-blue-400 font-bold">{assessment.docId}</td>
                                    <td className="p-5 font-bold text-white text-base">{assessment.assessmentName || 'Unnamed Assessment'}</td>
                                    <td className="p-5 text-xs text-slate-300">{assessment.siteId}</td>
                                    <td className="p-5 text-xs font-mono text-slate-400">{assessment.date}</td>
                                    <td className="p-5 text-center"><span className="bg-slate-800/80 text-slate-300 px-3 py-1 rounded-lg text-[10px] font-bold border border-slate-700">{hazardCount}</span></td>
                                    <td className="p-5 text-center"><span className={`px-2 py-1 rounded font-bold text-[10px] uppercase tracking-wider shadow-sm ${getRiskClass(maxRisk)}`}>{maxRisk}</span></td>
                                    <td className="p-5 pr-6 text-right flex justify-end gap-3">
                                        <button type="button" onClick={() => onPrint(assessment)} className="text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/30" title="Print PDF"><i className="fas fa-print"></i></button>
                                        {canEditRecord(assessment.siteId) ? (
                                            <button type="button" onClick={() => onOpenRecord(assessment)} className="text-purple-400 hover:text-white bg-purple-900/20 hover:bg-purple-600 px-3 py-1.5 rounded-lg transition-colors border border-purple-500/30" title="Edit"><i className="fas fa-edit"></i></button>
                                        ) : (
                                            <button type="button" onClick={() => onOpenRecord(assessment)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-600" title="View"><i className="fas fa-eye"></i></button>
                                        )}
                                        {canDeleteRecord(assessment.siteId) && (
                                            <button type="button" onClick={() => onDeleteRecord(assessment.firebaseKey)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors border border-red-500/30" title="Delete"><i className="fas fa-trash-alt"></i></button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredRepo.length === 0 && <tr><td colSpan="7" className="p-16 text-center italic text-slate-500">No records found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
