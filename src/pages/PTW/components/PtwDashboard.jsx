import React from 'react';
import { getTypeConfig } from '../../../utils/constants';
import { isPermitOverdue } from '../utils';

export default function PtwDashboard({
    allowedSites,
    handleSiteFilterChange,
    isGlobalUser,
    myPendingApprovals,
    onRegionChange,
    onViewPermit,
    regionFilter,
    regionOptions,
    setCurrentView,
    siteFilter,
    visiblePermits
}) {
    return (
        <div className="mx-auto max-w-7xl animate-fade-in p-8 font-['Space_Grotesk']">
            <div className="mb-8 flex items-end justify-between">
                <div>
                    <h2 className="mb-2 text-3xl font-bold text-white">PTW Dashboard</h2>
                    <p className="font-['Inter'] text-sm text-slate-400">Real-time status of safe work permits for your allowed locations.</p>
                </div>
                <div className="flex items-center gap-4 text-sm font-bold">
                    <select value={regionFilter} onChange={onRegionChange} className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-['Inter'] text-white shadow-lg outline-none focus:border-amber-500">
                        <option value="All">All Regions</option>
                        {regionOptions.map((region) => (
                            <option key={region} value={region}>
                                {region}
                            </option>
                        ))}
                    </select>
                    <select value={siteFilter} onChange={handleSiteFilterChange} className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-['Inter'] text-white shadow-lg outline-none focus:border-amber-500">
                        {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Authorized Sites</option>}
                        {allowedSites.map((site) => (
                            <option key={site.code} value={site.code}>
                                {site.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
                <div className="glass-panel rounded-2xl border-l-4 border-l-blue-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-blue-400">Work In Progress</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Work in Progress').length}</div>
                </div>
                <div className="glass-panel rounded-2xl border-l-4 border-l-orange-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orange-400">Pending Approval</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Pending Approval').length}</div>
                </div>
                <div className="glass-panel rounded-2xl border-l-4 border-l-purple-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">Pending Closure</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Pending Closure').length}</div>
                </div>
                <div className="glass-panel rounded-2xl border-l-4 border-l-red-500 p-6">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-red-400">Cancelled / Stopped</h3>
                    <div className="text-4xl font-black text-white">{visiblePermits.filter((permit) => permit.status === 'Cancelled').length}</div>
                </div>
            </div>

            {myPendingApprovals.length > 0 && (
                <div className="mb-10 rounded-3xl border border-orange-500/50 bg-orange-900/20 p-6 shadow-2xl">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-orange-400">
                        <i className="fas fa-bell animate-pulse"></i> Tasks Requiring Your Action
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {myPendingApprovals.map((permit) => (
                            <div key={permit.id} className="flex flex-col justify-between rounded-xl border border-slate-700 bg-slate-900 p-4 font-['Inter']">
                                <div>
                                    <span className={`mb-2 inline-block rounded border px-2 py-1 text-[10px] font-bold uppercase ${permit.status === 'Pending Closure' ? 'border-purple-500/30 bg-purple-500/20 text-purple-400' : 'border-orange-500/30 bg-orange-500/20 text-orange-400'}`}>
                                        {permit.status}
                                    </span>
                                    <h4 className="mb-1 line-clamp-2 text-sm font-bold text-white">{permit.description}</h4>
                                    <p className="mb-4 truncate text-xs text-slate-400">{permit.location}</p>
                                </div>
                                <button type="button" onClick={() => setCurrentView('inventory')} className="rounded-lg bg-slate-800 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-slate-700">
                                    Go to Registry
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <h3 className="mb-4 text-xl font-bold text-white">Recently Active Permits</h3>
            <div className="grid grid-cols-1 gap-6 font-['Inter'] lg:grid-cols-2 xl:grid-cols-3">
                {visiblePermits
                    .filter((permit) => permit.status === 'Work in Progress' || permit.status === 'Pending Approval')
                    .slice(0, 6)
                    .map((permit) => {
                        const typeConfig = getTypeConfig(permit.typeId);
                        const overdue = isPermitOverdue(permit);
                        return (
                            <div key={permit.id} className={`glass-panel rounded-2xl border-t-4 p-5 shadow-lg transition-shadow hover:shadow-xl ${overdue ? 'border border-red-500/40 bg-red-950/10' : ''} ${typeConfig.border.replace('border-', 'border-t-')}`}>
                                <div className="mb-3 flex items-start justify-between">
                                    <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-widest shadow-sm ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                                        {typeConfig.label}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-slate-400">{permit.id}</span>
                                </div>
                                <h4 className={`mb-1 truncate font-bold ${overdue ? 'text-red-300' : 'text-white'}`}>{permit.description}</h4>
                                <p className="mb-4 text-xs text-slate-400">
                                    <i className="fas fa-location-dot mr-1"></i> {permit.location} ({permit.siteId})
                                </p>
                                <div className={`mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${overdue ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-slate-800 bg-slate-950/60'}`}>
                                    <span className={overdue ? 'text-red-300' : permit.status === 'Work in Progress' ? 'animate-pulse text-blue-400' : 'text-orange-400'}>
                                        {overdue ? 'Overdue' : permit.status}
                                    </span>
                                    <span className={overdue ? 'text-red-200' : 'text-slate-500'}>Till: {permit.validToDate} {permit.validToTime}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onViewPermit(permit)}
                                        className="flex-1 rounded-lg bg-slate-800 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-amber-600"
                                    >
                                        View Full Permit
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                {visiblePermits.filter((permit) => permit.status === 'Work in Progress' || permit.status === 'Pending Approval').length === 0 && (
                    <div className="col-span-full rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/50 p-10 text-center italic text-slate-500">
                        No active permits at this time.
                    </div>
                )}
            </div>
        </div>
    );
}
