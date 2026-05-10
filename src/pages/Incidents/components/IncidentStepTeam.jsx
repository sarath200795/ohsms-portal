import React from 'react';

export default function IncidentStepTeam({
    canEditForm,
    data,
    externalName,
    handleAddTeamMember,
    removeTeamMember,
    saveData,
    saving,
    selectedUserToAdd,
    setData,
    setExternalName,
    setSelectedUserToAdd,
    setView,
    siteUsers
}) {
    return (
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
            <h2 className="text-xl font-bold text-teal-400 mb-8 flex items-center gap-3 border-b border-teal-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-users text-2xl"></i> 2. Investigation Team</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner">
                    <h3 className="font-bold text-white mb-6 uppercase tracking-widest text-xs"><i className="fas fa-user-shield text-teal-400 mr-2"></i> Team Roster ({(data.investigationTeam || []).length})</h3>

                    {canEditForm && (
                        <div className="space-y-4 mb-8 pb-8 border-b border-slate-800 no-print">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Add Internal Employee</label>
                                <div className="flex gap-2">
                                    <select value={selectedUserToAdd} onChange={(e) => setSelectedUserToAdd(e.target.value)} className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-teal-500 text-white">
                                        <option value="">Select Employee...</option>
                                        {siteUsers.map((user) => <option key={user.id} value={user.id}>{user.name || user.email} ({user.role})</option>)}
                                    </select>
                                    <button type="button" onClick={() => handleAddTeamMember('internal')} className="bg-teal-600 hover:bg-teal-500 text-white px-4 rounded-lg text-sm font-bold shadow-lg transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Add External Contractor/Expert</label>
                                <div className="flex gap-2">
                                    <input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Type Name..." className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-purple-500 text-white" />
                                    <button type="button" onClick={() => handleAddTeamMember('external')} className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-lg text-sm font-bold shadow-lg transition-transform active:scale-95"><i className="fas fa-plus"></i></button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-900">
                        <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950 uppercase font-bold text-slate-500 border-b border-slate-800">
                                <tr><th className="p-4">Name</th><th className="p-4">Role</th><th className="p-4 w-10 text-center"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {(data.investigationTeam || []).map((member, index) => (
                                    <tr key={index} className="hover:bg-slate-800/50">
                                        <td className="p-4 font-bold text-white">
                                            {member.name}
                                            {member.userId === 'External' && <span className="ml-2 text-[9px] bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30">EXT</span>}
                                        </td>
                                        <td className="p-4">{member.role}</td>
                                        <td className="p-4 text-center">
                                            {canEditForm && <button type="button" onClick={() => removeTeamMember(index)} className="text-red-500 hover:text-white bg-red-500/10 hover:bg-red-500 px-2 py-1 rounded transition-colors"><i className="fas fa-times"></i></button>}
                                        </td>
                                    </tr>
                                ))}
                                {(!data.investigationTeam || data.investigationTeam.length === 0) && <tr><td colSpan="3" className="p-8 text-center text-slate-500 italic">No team members assigned.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-4 tracking-wider"><i className="fas fa-pen-alt mr-2 text-teal-400"></i> Investigation Notes & Summary</label>
                    <textarea className="w-full flex-1 bg-slate-900 border border-slate-700 p-5 rounded-xl text-white focus:border-teal-500 outline-none resize-none custom-scroll text-sm shadow-inner min-h-[300px]" value={data.consultationSummary} onChange={(e) => setData({ ...data, consultationSummary: e.target.value })} placeholder="Summarize the investigation details, witness statements, and initial findings here..." disabled={!canEditForm}></textarea>
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                <button type="button" onClick={() => setView('repo')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                {canEditForm && (
                    <button type="button" onClick={() => saveData('investigation-draft')} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} text-lg`}></i> {saving ? 'Saving...' : 'Save Investigation Draft'}</button>
                )}
            </div>
        </div>
    );
}
