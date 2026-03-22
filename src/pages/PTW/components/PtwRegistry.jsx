import React from 'react';
import { getTypeConfig } from '../../../utils/constants';
import { getStatusColor } from '../utils';

export default function PtwRegistry({
    allowedSites,
    handleApproveClosure,
    handleApproveInitiation,
    handleRequestClosure,
    handleSiteFilterChange,
    isCreator,
    isEngApprover,
    isGlobalUser,
    isProdApprover,
    openForm,
    permissions,
    setInspectionModal,
    setInspectionObservation,
    setNewApproverEmail,
    setReassignModal,
    siteFilter,
    triggerPrint,
    visiblePermits
}) {
    return (
        <div className="mx-auto max-w-7xl animate-fade-in p-8 font-['Space_Grotesk']">
            <div className="mb-6 flex items-end justify-between">
                <div>
                    <h2 className="mb-2 text-3xl font-bold text-white">Permit Registry</h2>
                    <p className="font-['Inter'] text-sm text-slate-400">Master log of all drafted, active, and historical permits.</p>
                </div>
                <select value={siteFilter} onChange={handleSiteFilterChange} className="w-48 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-['Inter'] text-sm font-bold text-white shadow-lg outline-none focus:border-amber-500">
                    {(isGlobalUser || allowedSites.length > 1) && <option value="All">All Authorized Sites</option>}
                    {allowedSites.map((site) => (
                        <option key={site.code} value={site.code}>
                            {site.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="glass-panel overflow-hidden rounded-2xl border border-slate-700 shadow-xl font-['Inter']">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="border-b border-slate-700 bg-slate-950 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <tr>
                            <th className="p-4 pl-6">PTW Ref</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Location / Work</th>
                            <th className="p-4">Status & Approvals</th>
                            <th className="p-4 pr-6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                        {visiblePermits.map((permit, index) => {
                            const typeConfig = getTypeConfig(permit.typeId);
                            const amIEng = isEngApprover(permit);
                            const amIProd = isProdApprover(permit);
                            const amICreator = isCreator(permit);
                            const canReassign = amICreator && (permit.status === 'Pending Approval' || permit.status === 'Pending Closure');
                            const canEditPermitRow = permissions.canEditCreate && (permit.status === 'Draft' || permit.status === 'Pending Approval' || permit.status === 'Work in Progress');

                            return (
                                <tr key={permit.id || index} className={`transition-colors hover:bg-slate-800/50 ${permit.status === 'Closed' ? 'opacity-60' : ''}`}>
                                    <td className="p-4 pl-6 font-mono text-xs font-bold text-white">{permit.id}</td>
                                    <td className="p-4">
                                        <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-widest shadow-sm ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border}`}>
                                            {typeConfig.label}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="max-w-xs truncate font-bold text-slate-200">{permit.description}</div>
                                        <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
                                            {permit.location} ({permit.siteId})
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(permit.status)}`}>
                                            {permit.status}
                                        </span>

                                        <div className="mt-2 flex flex-col gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    ENG: <span className={permit.engStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{permit.engStatus}</span>
                                                </span>
                                                {canReassign && !permit.engStatus.includes('Approved') && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setReassignModal({ permit, role: 'eng' });
                                                            setNewApproverEmail(permit.engApproverEmail);
                                                        }}
                                                        className="text-amber-500 transition hover:text-amber-400"
                                                        title="Reassign Eng Approver"
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    PROD: <span className={permit.prodStatus.includes('Approved') ? 'text-emerald-400' : 'text-orange-400'}>{permit.prodStatus}</span>
                                                </span>
                                                {canReassign && !permit.prodStatus.includes('Approved') && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setReassignModal({ permit, role: 'prod' });
                                                            setNewApproverEmail(permit.prodApproverEmail);
                                                        }}
                                                        className="text-amber-500 transition hover:text-amber-400"
                                                        title="Reassign Prod Approver"
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="ml-auto flex min-w-[200px] flex-wrap justify-end gap-2 p-4 pr-6 text-right">
                                        {permit.status === 'Pending Approval' && amIEng && permit.engStatus === 'Pending' && (
                                            <button type="button" onClick={() => handleApproveInitiation(permit, 'eng')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-emerald-500">
                                                <i className="fas fa-check mr-1"></i> Apprv Eng
                                            </button>
                                        )}
                                        {permit.status === 'Pending Approval' && amIProd && permit.prodStatus === 'Pending' && (
                                            <button type="button" onClick={() => handleApproveInitiation(permit, 'prod')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-emerald-500">
                                                <i className="fas fa-check mr-1"></i> Apprv Prod
                                            </button>
                                        )}

                                        {permit.status === 'Work in Progress' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setInspectionObservation('');
                                                        setInspectionModal(permit);
                                                    }}
                                                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-orange-500"
                                                >
                                                    <i className="fas fa-search mr-1"></i> Inspect
                                                </button>
                                                {amICreator && (
                                                    <button type="button" onClick={() => handleRequestClosure(permit)} className="rounded-lg border border-slate-500 bg-slate-700 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-slate-600">
                                                        Close Work
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        {permit.status === 'Pending Closure' && amIEng && permit.engStatus === 'Closure Pending' && (
                                            <button type="button" onClick={() => handleApproveClosure(permit, 'eng')} className="rounded-lg bg-purple-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-purple-500">
                                                <i className="fas fa-check-double mr-1"></i> Verify Close Eng
                                            </button>
                                        )}
                                        {permit.status === 'Pending Closure' && amIProd && permit.prodStatus === 'Closure Pending' && (
                                            <button type="button" onClick={() => handleApproveClosure(permit, 'prod')} className="rounded-lg bg-purple-600 px-3 py-1.5 text-[10px] font-bold uppercase text-white shadow transition hover:bg-purple-500">
                                                <i className="fas fa-check-double mr-1"></i> Verify Close Prod
                                            </button>
                                        )}

                                        <button type="button" onClick={() => triggerPrint(permit)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-sm text-white shadow transition hover:bg-slate-700">
                                            <i className="fas fa-print"></i>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openForm(permit)}
                                            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-sm text-white shadow transition ${canEditPermitRow ? 'hover:bg-amber-600' : 'hover:bg-slate-700'}`}
                                        >
                                            <i className={`fas ${canEditPermitRow ? 'fa-edit' : 'fa-eye'}`}></i>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {visiblePermits.length === 0 && (
                            <tr>
                                <td colSpan={5} className="border-t border-slate-800 p-16 text-center text-base italic text-slate-500">
                                    No permits found for authorized locations.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
