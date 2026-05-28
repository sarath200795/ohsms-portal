import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function AddWorkerModal({
    addWorkerData,
    contractors,
    onClose,
    onSubmit,
    setAddWorkerData,
    visibleContractors,
    visibleSites = [],
    allSites = []          // ULTIMATE fallback — raw org-wide site list, used
                           // when both the contractor's allocatedSites and the
                           // session-scoped visibleSites end up empty (which
                           // can happen if the admin's session permissions
                           // were corrupted by an earlier bug).
}) {
    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-lg w-full p-8 relative">
                <button type="button" onClick={onClose} className="absolute top-6 right-6 text-slate-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                <h3 className="text-2xl font-black text-emerald-400 mb-2"><i className="fas fa-user-plus mr-2"></i> Register New Worker</h3>
                <p className="text-slate-400 text-xs mb-6">Assign an employee to an existing contractor roster.</p>

                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Select Contractor Company *</label>
                        <select value={addWorkerData.contractorId} onChange={(event) => setAddWorkerData({ ...addWorkerData, contractorId: event.target.value, deployedSite: '' })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500 font-bold">
                            <option value="">Select Vendor...</option>
                            {visibleContractors.map((contractor) => <option key={contractor.firebaseKey} value={contractor.firebaseKey}>{contractor.companyName}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Full Name *</label>
                        <input value={addWorkerData.name} onChange={(event) => setAddWorkerData({ ...addWorkerData, name: event.target.value })} placeholder="Worker Name" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Role / Job Title</label>
                            <input value={addWorkerData.role} onChange={(event) => setAddWorkerData({ ...addWorkerData, role: event.target.value })} placeholder="e.g. Electrician" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Competence *</label>
                            <input value={addWorkerData.competence} onChange={(event) => setAddWorkerData({ ...addWorkerData, competence: event.target.value })} placeholder="e.g. ITI Certified" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500" />
                        </div>
                    </div>

                    {addWorkerData.contractorId && (() => {
                        const selectedContractor = contractors.find((contractor) => contractor.firebaseKey === addWorkerData.contractorId);
                        const allocated = safeArr(selectedContractor?.allocatedSites).filter(Boolean);
                        // Tiered fallback so the picker is never empty:
                        //   1. Contractor's allocatedSites — the scope the
                        //      admin granted them in Users → permissions.
                        //   2. Session-scoped visibleSites — the admin's
                        //      accessible sites, used when the contractor
                        //      doesn't have allocatedSites set yet.
                        //   3. allSites — the raw org-wide site list,
                        //      used if visibleSites is somehow empty too
                        //      (e.g., session permissions were corrupted
                        //      by an earlier bug, leaving accessibleSites
                        //      empty on a record that's still flagged
                        //      Global Owner).
                        // The deployedSite written on the worker is
                        // informational; RTDB rules don't constrain it.
                        const useAllocated = allocated.length > 0;
                        const fallbackSites = safeArr(visibleSites).length > 0
                            ? safeArr(visibleSites)
                            : safeArr(allSites);
                        const sitesToShow = useAllocated
                            ? allocated.map((code) => {
                                const meta = fallbackSites.find((s) => s.code === code) || visibleSites.find((s) => s.code === code);
                                return { code, name: meta?.name || code };
                            })
                            : fallbackSites.map((s) => ({ code: s.code, name: s.name || s.code }));

                        return (
                            <div className="pt-2">
                                <label className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
                                    Initial Site Deployment *
                                </label>
                                <select
                                    value={addWorkerData.deployedSite}
                                    onChange={(event) => setAddWorkerData({ ...addWorkerData, deployedSite: event.target.value })}
                                    className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl p-3 text-emerald-400 outline-none focus:border-emerald-500 font-bold shadow-inner"
                                >
                                    <option value="">Select Target Site...</option>
                                    {sitesToShow.map((site) => (
                                        <option key={site.code} value={site.code}>{site.name} ({site.code})</option>
                                    ))}
                                </select>
                                {sitesToShow.length === 0 && (
                                    <p className="mt-2 text-[10px] text-red-400 italic">
                                        No sites available — register at least one site in the Sites module first, then come back here.
                                    </p>
                                )}
                                {!useAllocated && sitesToShow.length > 0 && safeArr(visibleSites).length > 0 && (
                                    <p className="mt-2 text-[10px] text-amber-300 italic">
                                        This contractor has no allocated sites yet — picking from your full site list. Grant them sites via Contractors → Edit if you want to lock deployment to a subset.
                                    </p>
                                )}
                                {!useAllocated && sitesToShow.length > 0 && safeArr(visibleSites).length === 0 && safeArr(allSites).length > 0 && (
                                    <p className="mt-2 text-[10px] text-amber-300 italic">
                                        Showing the full org site list. (Your account's session-scoped site list came back empty — if this is a regular admin account, refresh after re-logging in.)
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    <p className="text-[10px] text-slate-500 italic mt-4">Note: Medical Fitness and Competence Documents can be uploaded directly from the worker&apos;s profile after registration.</p>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                    <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                    <button type="button" onClick={onSubmit} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg transition-transform active:scale-95"><i className="fas fa-check mr-2"></i> Register</button>
                </div>
            </div>
        </div>
    );
}
