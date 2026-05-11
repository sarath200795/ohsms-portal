import React from 'react';
import { safeArr } from '../utils';

export default function TrainingRepositoryView({
    isGlobalUser,
    allowedSiteCodes,
    filterSite,
    regionFilter,
    regionOptions,
    filteredVisibleSites,
    onRegionChange,
    onSiteChange,
    trainings,
    permissions,
    onPrint,
    onOpenRecord,
    onDelete
}) {
    const filteredTrainings = trainings
        .filter((training) => {
            const hasAccess = filterSite === 'All' ? (isGlobalUser || allowedSiteCodes.has(training.siteId)) : training.siteId === filterSite;
            if (!hasAccess) return false;
            if (regionFilter === 'All') return true;
            return filteredVisibleSites.some((site) => site.code === training.siteId);
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <div className="max-w-7xl mx-auto glass-panel p-8 rounded-3xl animate-in fade-in duration-500 shadow-2xl border border-slate-700">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2"><i className="fas fa-history text-blue-400 mr-3"></i> Training Master Log</h2>
                    <p className="text-sm text-slate-400">Historical repository of all completed training sessions.</p>
                </div>
                <div className="flex gap-3">
                    <select value={regionFilter} onChange={onRegionChange} className="w-40 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl p-3 outline-none focus:border-blue-500 shadow-inner">
                        <option value="All">All Regions</option>
                        {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                    </select>
                    <select value={filterSite} onChange={onSiteChange} className="w-48 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl p-3 outline-none focus:border-blue-500 shadow-inner">
                        {(isGlobalUser || filteredVisibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                        {filteredVisibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 shadow-inner custom-scroll">
                <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap">
                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 tracking-widest border-b border-slate-800">
                        <tr><th className="p-5 pl-6">Record ID</th><th className="p-5">Course / Topic</th><th className="p-5">Date Conducted</th><th className="p-5">Site</th><th className="p-5">Trainees</th><th className="p-5 pr-6 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/30">
                        {filteredTrainings.map((training) => (
                            <tr key={training.firebaseKey} className="hover:bg-slate-800/60 transition-colors">
                                <td className="p-5 pl-6 font-mono text-xs text-slate-400">{training.id}</td>
                                <td className="p-5 font-bold text-white text-base">
                                    {training.topic}
                                    {training.contractorId && <span className="ml-2 text-[8px] bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded uppercase font-bold border border-purple-500/30" title={training.contractorName}>EXT</span>}
                                </td>
                                <td className="p-5 text-xs font-mono">{training.date}</td>
                                <td className="p-5 text-xs font-medium">{training.siteId}</td>
                                <td className="p-5 font-bold text-emerald-400"><span className="bg-emerald-900/20 border border-emerald-500/30 px-2 py-1 rounded-lg">{safeArr(training.attendees).filter((attendee) => attendee.status === 'Attended').length} passed</span></td>
                                <td className="p-5 pr-6 text-right flex justify-end gap-3">
                                    <button type="button" onClick={() => onPrint(training)} className="text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors border border-blue-500/30" title="Print Register"><i className="fas fa-print"></i></button>
                                    {permissions.canEditCreate ? (
                                        <button type="button" onClick={() => onOpenRecord(training)} className="text-purple-400 hover:text-white bg-purple-900/20 hover:bg-purple-600 px-3 py-1.5 rounded-lg transition-colors border border-purple-500/30 font-bold text-[10px] uppercase tracking-widest" title="Edit">Edit</button>
                                    ) : (
                                        <button type="button" onClick={() => onOpenRecord(training)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-600 font-bold text-[10px] uppercase tracking-widest" title="View">View</button>
                                    )}
                                    {permissions.canDelete && <button type="button" onClick={() => onDelete(training)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors" title="Delete"><i className="fas fa-trash-alt"></i></button>}
                                </td>
                            </tr>
                        ))}
                        {filteredTrainings.length === 0 && <tr><td colSpan="6" className="text-center p-12 text-slate-500 italic">No records found for this location.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
