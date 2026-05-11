import React from 'react';

export default function RiskLogsView({
    allChangeLogs,
    filterSite,
    regionFilter,
    regionOptions,
    filteredVisibleSites,
    onFilterRegionChange,
    onFilterSiteChange,
    isGlobalUser,
    onOpenLogRecord
}) {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2"><i className="fas fa-history text-orange-400 mr-3"></i>HIRA Revision History</h2>
                    <p className="text-sm text-slate-400">Audit trail of all modifications made to active Risk Assessments.</p>
                </div>
                <div className="bg-slate-900 border border-slate-700 p-1.5 rounded-xl shadow-inner flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase ml-2">Filter Site:</span>
                    <select value={regionFilter} onChange={onFilterRegionChange} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                        <option value="All">All Regions</option>
                        {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                    </select>
                    <select value={filterSite} onChange={onFilterSiteChange} className="bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none border border-slate-800">
                        {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                        {filteredVisibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                        <tr>
                            <th className="p-5 pl-6">Date & Time</th>
                            <th className="p-5">HIRA Document</th>
                            <th className="p-5">Site</th>
                            <th className="p-5">Source of Change</th>
                            <th className="p-5 w-1/3">Reason / Details</th>
                            <th className="p-5">Updated By</th>
                            <th className="p-5 pr-6 text-right">View</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                        {allChangeLogs.map((log, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                                <td className="p-5 pl-6 whitespace-nowrap font-mono text-xs">{log.date ? new Date(log.date).toLocaleString() : 'N/A'}</td>
                                <td className="p-5 font-bold text-blue-400">{log.docId}<br /><span className="text-[10px] text-slate-500 font-normal">{log.assessmentName}</span></td>
                                <td className="p-5 text-xs">{log.siteId}</td>
                                <td className="p-5"><span className="bg-orange-900/20 text-orange-400 border border-orange-500/30 px-2 py-1 rounded font-bold text-[10px] uppercase tracking-widest">{log.source}</span></td>
                                <td className="p-5 text-xs text-slate-300">{log.reason}</td>
                                <td className="p-5 text-xs font-bold text-slate-400"><i className="fas fa-user-circle mr-1"></i> {log.user}</td>
                                <td className="p-5 pr-6 text-right">
                                    <button type="button" onClick={() => onOpenLogRecord(log.firebaseKey)} className="text-blue-400 hover:text-white px-4 py-2 bg-blue-900/20 rounded-lg transition-colors text-[10px] font-bold uppercase tracking-widest border border-blue-500/30 hover:bg-blue-600">Open</button>
                                </td>
                            </tr>
                        ))}
                        {allChangeLogs.length === 0 && <tr><td colSpan="7" className="p-16 text-center italic text-slate-500">No revisions found for the selected filters.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
