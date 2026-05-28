import React from 'react';
import { addMonths, safeArr } from '../utils';

export default function TrainingFormView({
    data,
    setData,
    canEditForm,
    visibleSites,
    isGlobalUser,
    contractors,
    saving,
    onSave,
    onCancel,
    selectedUserToAdd,
    setSelectedUserToAdd,
    externalName,
    setExternalName,
    availableWorkersForForm,
    addAttendee,
    removeAttendee,
    onPrint
}) {
    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-500">
            <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-2xl">
                <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
                    <h2 className="text-3xl font-bold text-emerald-400 flex items-center gap-3"><i className="fas fa-chalkboard-teacher"></i> {data.firebaseKey ? 'Edit Training Session' : 'Log Training Session'}</h2>
                    <div className="flex items-center gap-3">
                        {canEditForm && (
                            <button type="button" onClick={onSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-900/30 transition flex items-center gap-2 disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i> Save</button>
                        )}
                        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white font-bold text-sm transition-colors flex items-center gap-2"><i className="fas fa-times"></i> Cancel</button>
                    </div>
                </div>

                <div className="flex gap-4 mb-8 bg-slate-900/50 p-2 rounded-2xl border border-slate-800 w-fit shadow-inner">
                    <button type="button" onClick={() => setData({ ...data, targetAudience: 'Internal', contractorId: '', attendees: [] })} className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${data.targetAudience === 'Internal' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-user-tie mr-2"></i> Internal Staff</button>
                    <button type="button" onClick={() => setData({ ...data, targetAudience: 'Contractor', attendees: [] })} className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${data.targetAudience === 'Contractor' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><i className="fas fa-hard-hat mr-2"></i> Contractors</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-6 bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-inner">
                        <h3 className="font-bold text-white mb-2 border-b border-slate-700 pb-3 uppercase tracking-widest text-xs flex items-center gap-2"><i className="fas fa-info-circle text-blue-400"></i> Session Details</h3>

                        {data.linkedCapa && (
                            <div className="bg-orange-900/10 border border-orange-500/30 p-4 rounded-xl flex justify-between items-center shadow-inner">
                                <div>
                                    <span className="text-orange-400 font-bold text-[10px] uppercase tracking-widest"><i className="fas fa-link mr-2"></i> Fulfilling Requirement</span>
                                    <div className="text-sm font-medium text-white mt-1 leading-relaxed">{data.linkedCapa.desc}</div>
                                </div>
                                {canEditForm && <button type="button" onClick={() => setData({ ...data, linkedCapa: null })} className="text-red-400 hover:text-white text-xs bg-red-900/20 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors font-bold uppercase tracking-widest ml-4 shadow-sm border border-red-500/20"><i className="fas fa-unlink mr-1"></i> Unlink</button>}
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Topic / Course Name</label>
                            <input value={data.topic} onChange={(e) => setData({ ...data, topic: e.target.value })} disabled={!canEditForm} className="w-full text-base font-bold text-white bg-slate-950 border border-slate-700 p-3.5 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" placeholder="e.g. LOTO Refresher" />
                        </div>

                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Training Content / Agenda</label>
                            <textarea rows="4" value={data.content || ''} onChange={(e) => setData({ ...data, content: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-medium text-slate-300 bg-slate-950 border border-slate-700 p-3.5 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors custom-scroll resize-none" placeholder="Briefly describe the training material covered..."></textarea>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Location / Site</label>
                                <select value={data.siteId} onChange={(e) => setData({ ...data, siteId: e.target.value, contractorId: '', attendees: [] })} disabled={data.firebaseKey || !canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors">
                                    {(isGlobalUser || visibleSites.length > 1) && <option value="">Select Site...</option>}
                                    {visibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Training Method</label>
                                <select value={data.type} onChange={(e) => setData({ ...data, type: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-bold text-blue-300 bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors">
                                    <option>Internal Tool Box Talk</option>
                                    <option>Internal Formal</option>
                                    <option>External Certified</option>
                                </select>
                            </div>
                        </div>

                        {data.targetAudience === 'Contractor' && (
                            <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-xl">
                                <label className="text-[10px] uppercase font-bold text-purple-400 block mb-2 tracking-widest ml-1"><i className="fas fa-building mr-1"></i> Contractor Company</label>
                                <select value={data.contractorId} onChange={(e) => setData({ ...data, contractorId: e.target.value, attendees: [] })} disabled={data.firebaseKey || !canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-purple-500 shadow-inner transition-colors">
                                    <option value="">Select Vendor...</option>
                                    {contractors.filter((contractor) => !data.siteId || safeArr(contractor.allocatedSites).includes(data.siteId) || contractor.siteId === 'GLOBAL').map((contractor) => (
                                        <option key={contractor.firebaseKey} value={contractor.firebaseKey}>{contractor.companyName}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Date Conducted</label>
                                <input type="date" value={data.date} onChange={(e) => setData({ ...data, date: e.target.value, expiryDate: addMonths(e.target.value, 6) })} disabled={!canEditForm} className="w-full text-sm font-mono text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-orange-400 block mb-2 tracking-widest ml-1">Expiry Date</label>
                                <input type="date" value={data.expiryDate} onChange={(e) => setData({ ...data, expiryDate: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-mono text-orange-300 bg-orange-950/20 border border-orange-500/30 p-3 rounded-xl outline-none focus:border-orange-500 shadow-inner transition-colors" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Trainer Name</label>
                                <input value={data.trainer} onChange={(e) => setData({ ...data, trainer: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" placeholder="Instructor Name" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Duration</label>
                                <input value={data.duration} onChange={(e) => setData({ ...data, duration: e.target.value })} disabled={!canEditForm} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500 shadow-inner transition-colors" placeholder="e.g. 2 Hours" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 shadow-inner flex flex-col h-[650px]">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-3">
                            <h3 className="font-bold text-white uppercase tracking-widest text-xs flex items-center gap-2"><i className="fas fa-users text-emerald-400"></i> Attendance Roster <span className="bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] ml-2">{data.attendees ? safeArr(data.attendees).length : 0}</span></h3>
                        </div>

                        {canEditForm && (
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 ml-1 tracking-widest">Select From Database</label>
                                    <div className="flex gap-2">
                                        <select value={selectedUserToAdd} onChange={(e) => setSelectedUserToAdd(e.target.value)} disabled={data.targetAudience === 'Contractor' && !data.contractorId} className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-emerald-500 shadow-inner transition-colors disabled:opacity-50">
                                            <option value="">{data.targetAudience === 'Contractor' && !data.contractorId ? 'Select Contractor Company first...' : `Select ${data.targetAudience} Personnel deployed at ${data.siteId}...`}</option>
                                            {availableWorkersForForm.filter((worker) => worker.deployedSite === data.siteId || data.targetAudience === 'Internal').map((worker) => (
                                                <option key={worker.id} value={worker.name}>{worker.name} ({worker.role})</option>
                                            ))}
                                        </select>
                                        <button type="button" onClick={() => addAttendee('db')} disabled={data.targetAudience === 'Contractor' && !data.contractorId} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-2 ml-1 tracking-widest">Add Manual (External Name)</label>
                                    <div className="flex gap-2">
                                        <input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Type Guest/Contractor Name..." className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-slate-500 shadow-inner transition-colors" />
                                        <button type="button" onClick={() => addAttendee('external_manual')} className="bg-slate-700 hover:bg-slate-600 text-white px-5 rounded-xl font-bold shadow-lg transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto custom-scroll border border-slate-700 rounded-xl bg-slate-950 shadow-inner">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900/90 backdrop-blur-md uppercase font-bold text-slate-500 text-[10px] tracking-widest sticky top-0 z-10 shadow-sm border-b border-slate-800">
                                    <tr><th className="p-4">Name</th><th className="p-4 hidden sm:table-cell">Role</th><th className="p-4">Status</th><th className="p-4 w-10 text-center"></th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {safeArr(data.attendees).map((attendee, idx) => (
                                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                                            <td className="p-4 font-bold text-white">
                                                {attendee.name}
                                                {attendee.userId === 'External' && <span className="ml-3 text-[9px] bg-purple-900/30 text-purple-400 px-2 py-1 rounded-lg uppercase tracking-widest font-bold border border-purple-500/30">EXT</span>}
                                            </td>
                                            <td className="p-4 text-xs text-slate-400 hidden sm:table-cell">{attendee.role}</td>
                                            <td className="p-4">
                                                <select value={attendee.status} onChange={(e) => { const attendees = [...safeArr(data.attendees)]; attendees[idx].status = e.target.value; setData({ ...data, attendees }); }} disabled={!canEditForm} className={`text-xs py-1.5 px-3 border outline-none rounded-lg font-bold cursor-pointer transition-colors shadow-sm ${attendee.status === 'Attended' ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/30 focus:border-emerald-500' : 'bg-red-950/50 text-red-400 border-red-500/30 focus:border-red-500'}`}>
                                                    <option>Attended</option>
                                                    <option>Absent</option>
                                                </select>
                                            </td>
                                            <td className="p-4 text-center">{canEditForm && <button type="button" onClick={() => removeAttendee(idx)} className="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button>}</td>
                                        </tr>
                                    ))}
                                    {(!data.attendees || safeArr(data.attendees).length === 0) && <tr><td colSpan="4" className="p-12 text-center text-slate-500 italic text-sm">No trainees added to roster.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 border-t border-slate-700 pt-8 mt-8">
                    {data.firebaseKey && <button type="button" onClick={() => onPrint(data)} className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow-lg flex items-center gap-2"><i className="fas fa-print"></i> Print Roster</button>}
                    {canEditForm && <button type="button" onClick={onSave} disabled={saving} className="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white px-10 py-4 rounded-xl font-bold shadow-lg shadow-emerald-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50">{saving ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-cloud-arrow-up text-lg"></i>} {data.linkedCapa ? 'Save & Close CAPA' : 'Save Record'}</button>}
                </div>
            </div>
        </div>
    );
}
