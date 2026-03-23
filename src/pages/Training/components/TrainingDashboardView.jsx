import React from 'react';

export default function TrainingDashboardView({
    filterSite,
    onSiteChange,
    isGlobalUser,
    visibleSites,
    validCount,
    expiringCount,
    pendingCount,
    expiredCount,
    filteredAlerts,
    pendingTrainingCapas,
    canEditCreate,
    onInitiateCapaTraining
}) {
    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-end mb-4">
                <select value={filterSite} onChange={onSiteChange} className="w-48 text-xs bg-slate-950 border border-slate-700 text-white outline-none focus:border-blue-500 rounded-xl p-3 shadow-inner">
                    {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Authorized Sites</option>}
                    {visibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-emerald-500 shadow-xl">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Valid Certifications</div>
                    <div className="text-4xl font-bold text-emerald-400">{validCount}</div>
                </div>
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-yellow-500 shadow-xl">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Expiring &lt; 6 Months</div>
                    <div className="text-4xl font-bold text-yellow-400">{expiringCount}</div>
                </div>
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-orange-500 shadow-xl">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">CAPA Training Due</div>
                    <div className="text-4xl font-bold text-orange-400">{pendingCount}</div>
                </div>
                <div className="glass-panel p-6 rounded-3xl border-l-4 border-red-500 shadow-xl">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">Expired Certifications</div>
                    <div className="text-4xl font-bold text-red-500">{expiredCount}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
                <div className="glass-panel rounded-3xl overflow-hidden shadow-xl border border-slate-700 flex flex-col max-h-[500px]">
                    <div className="p-6 border-b border-slate-700 bg-slate-900/50">
                        <h3 className="font-bold text-lg text-white flex items-center gap-2"><i className="fas fa-bell text-red-500"></i> Expiry Alerts</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scroll">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-950/80 backdrop-blur-md sticky top-0 text-[10px] uppercase font-bold text-slate-500 z-10 border-b border-slate-800">
                                <tr><th className="p-4">Employee</th><th className="p-4">Topic</th><th className="p-4">Expiry</th><th className="p-4 text-right">Status</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 bg-slate-950/40">
                                {filteredAlerts.map((alert, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/60 transition-colors">
                                        <td className="p-4 font-bold text-white">{alert.userName}</td>
                                        <td className="p-4 text-blue-300 font-medium">{alert.topic}</td>
                                        <td className="p-4 font-mono text-xs">{alert.expiryDate}</td>
                                        <td className="p-4 text-right"><span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border border-current shadow-sm ${alert.statusClass}`}>{alert.status}</span></td>
                                    </tr>
                                ))}
                                {filteredAlerts.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-emerald-400 italic font-bold">Excellent! No upcoming expirations.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="glass-panel rounded-3xl overflow-hidden shadow-xl border border-slate-700 flex flex-col max-h-[500px]">
                    <div className="p-6 border-b border-slate-700 bg-slate-900/50">
                        <h3 className="font-bold text-lg text-white flex items-center gap-2"><i className="fas fa-tasks text-orange-500"></i> Pending CAPA Trainings</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scroll">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-950/80 backdrop-blur-md sticky top-0 text-[10px] uppercase font-bold text-slate-500 z-10 border-b border-slate-800">
                                <tr><th className="p-4">Source</th><th className="p-4">Requirement / Topic</th><th className="p-4 text-right">Actions</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 bg-slate-950/40">
                                {pendingTrainingCapas.map((capa, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/60 transition-colors">
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border shadow-sm ${capa.source.includes('Contractor') ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : capa.source === 'Incident' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
                                                {capa.source}
                                            </span>
                                            <div className="text-[9px] text-slate-500 mt-2 font-mono">{capa.sourceId}</div>
                                        </td>
                                        <td className="p-4 font-medium text-white leading-relaxed">{capa.desc}</td>
                                        <td className="p-4 text-right">
                                            {canEditCreate && <button type="button" onClick={() => onInitiateCapaTraining(capa)} className="text-orange-400 hover:text-white bg-orange-900/20 hover:bg-orange-600 px-3 py-1.5 rounded-lg transition border border-orange-500/30 text-[10px] uppercase font-bold whitespace-nowrap tracking-widest shadow-sm">Log Session</button>}
                                        </td>
                                    </tr>
                                ))}
                                {pendingTrainingCapas.length === 0 && <tr><td colSpan="3" className="p-12 text-center text-slate-500 italic">No pending training CAPAs from other modules.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
