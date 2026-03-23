import React from 'react';
import HazardRow from './HazardRow';

export default function RiskFormView({
    formData,
    setFormData,
    canEditForm,
    saving,
    onSave,
    onCancel,
    isGlobalUser,
    visibleSites,
    addTeamMember,
    updateTeam,
    removeTeam,
    addActivity,
    updateActivityName,
    removeActivity,
    addHazard,
    updateHazard,
    removeHazard,
    handleCategoryChange,
    handleSubCategoryChange,
    activeUsers
}) {
    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500 pb-20 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-1"><i className="fas fa-clipboard-list text-blue-500 mr-3"></i> {formData.firebaseKey ? 'Edit Risk Assessment' : 'New Risk Assessment'}</h2>
                    <p className="text-sm text-slate-400 font-mono ml-10">Ref: {formData.docId}</p>
                </div>
                <div className="flex gap-3">
                    <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                    {canEditForm && (
                        <button type="button" onClick={onSave} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/30 transition-transform active:scale-95 flex items-center gap-2">
                            {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save Assessment
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-xl">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-700 pb-3 mb-6">1. Core Context</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2">
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Assessment Name / Task Area</label>
                        <input value={formData.assessmentName || ''} onChange={(e) => setFormData({ ...formData, assessmentName: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-base font-bold text-white outline-none focus:border-blue-500 transition-colors shadow-inner" placeholder="e.g. Warehouse FLT Operations..." disabled={!canEditForm} />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Facility / Site</label>
                        <select value={formData.siteId} onChange={(e) => setFormData({ ...formData, siteId: e.target.value })} disabled={formData.firebaseKey || !canEditForm || (!isGlobalUser && visibleSites.length <= 1)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-white outline-none focus:border-blue-500 transition-colors shadow-inner">
                            {(isGlobalUser || visibleSites.length > 1) && <option value="">Select Authorized Site...</option>}
                            {visibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Assessment Date</label>
                        <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-white outline-none focus:border-blue-500 transition-colors shadow-inner font-mono" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Document Status</label>
                        <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} disabled={!canEditForm} className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm font-bold outline-none focus:border-blue-500 transition-colors shadow-inner ${formData.status === 'Active' ? 'text-emerald-400' : 'text-orange-400'}`}>
                            <option value="Draft">Draft (In Progress)</option>
                            <option value="Active">Active (Approved)</option>
                            <option value="Archived">Archived</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-slate-700 shadow-xl">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-6">
                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest">2. Assessment Team</h3>
                    {canEditForm && <button type="button" onClick={addTeamMember} className="text-[10px] bg-purple-900/30 text-purple-400 hover:bg-purple-600 hover:text-white px-3 py-1.5 rounded-lg border border-purple-500/30 font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus mr-1"></i> Add Member</button>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {formData.team.map((teamMember, idx) => (
                        <div key={idx} className="flex gap-2 items-center bg-slate-950/50 p-2 rounded-xl border border-slate-800 shadow-inner">
                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500"><i className="fas fa-user"></i></div>
                            <input value={teamMember.name} onChange={(e) => updateTeam(idx, 'name', e.target.value)} placeholder="Full Name" disabled={!canEditForm} className="flex-1 bg-transparent border-none outline-none text-sm text-white font-bold px-2" />
                            <select value={teamMember.role} onChange={(e) => updateTeam(idx, 'role', e.target.value)} disabled={!canEditForm} className="w-32 bg-slate-900 border border-slate-700 rounded-lg text-[10px] text-slate-400 font-bold uppercase tracking-widest outline-none p-2">
                                <option>Lead Assessor</option>
                                <option>Manager</option>
                                <option>Operator</option>
                                <option>HSE Rep</option>
                                <option>Contractor</option>
                            </select>
                            {idx > 0 && canEditForm && <button type="button" onClick={() => removeTeam(idx)} className="text-slate-600 hover:text-red-500 w-8 h-8 flex items-center justify-center transition-colors"><i className="fas fa-times"></i></button>}
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <div className="flex justify-between items-end mb-6">
                    <h3 className="text-2xl font-bold text-white"><i className="fas fa-layer-group text-orange-500 mr-3"></i> Hazard Analysis Matrix</h3>
                    {canEditForm && <button type="button" onClick={addActivity} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-orange-900/30 transition-transform active:scale-95 flex items-center gap-2"><i className="fas fa-plus"></i> Add Activity / Area</button>}
                </div>

                <div className="space-y-8">
                    {formData.activities.map((activity, actIdx) => (
                        <div key={activity.id} className="glass-panel rounded-3xl border border-slate-700 overflow-hidden shadow-2xl relative">
                            <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                            <div className="bg-slate-900/80 p-6 flex justify-between items-center border-b border-slate-700">
                                <div className="flex-1 mr-8 relative group">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-2 ml-1">Process / Task / Area Name</label>
                                    <input value={activity.name} onChange={(e) => updateActivityName(actIdx, e.target.value)} disabled={!canEditForm} placeholder="e.g., 'Hot Work on Main Boiler Pipes'..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-lg font-bold text-white outline-none focus:border-blue-500 shadow-inner pr-12 transition-colors" />
                                </div>
                                {canEditForm && (
                                    <div className="flex gap-3 mt-5">
                                        <button type="button" onClick={() => addHazard(actIdx)} className="bg-slate-800 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-lg border border-slate-700 flex items-center gap-2"><i className="fas fa-plus"></i> Add Hazard</button>
                                        <button type="button" onClick={() => removeActivity(actIdx)} className="bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white w-12 h-12 rounded-xl transition-colors border border-slate-700 flex items-center justify-center shadow-lg"><i className="fas fa-trash-alt"></i></button>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 bg-slate-950/40 space-y-6">
                                {(activity.hazards || []).map((hazard, hazIdx) => (
                                    <HazardRow
                                        key={hazard.id}
                                        idx={actIdx}
                                        hIdx={hazIdx}
                                        haz={hazard}
                                        updateHazard={updateHazard}
                                        removeHazard={removeHazard}
                                        handleCategoryChange={handleCategoryChange}
                                        handleSubCategoryChange={handleSubCategoryChange}
                                        users={activeUsers}
                                        canEdit={canEditForm}
                                    />
                                ))}
                                {(!activity.hazards || activity.hazards.length === 0) && (
                                    <div className="text-center p-12 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 italic bg-slate-900/20">No specific hazards identified for this activity step yet. Click "Add Hazard" to begin.</div>
                                )}
                            </div>
                        </div>
                    ))}
                    {formData.activities.length === 0 && (
                        <div className="text-center p-20 border-2 border-dashed border-slate-700 rounded-3xl text-slate-400 text-lg bg-slate-900/30 shadow-inner">
                            <i className="fas fa-arrow-up text-3xl mb-4 block text-slate-600"></i>
                            Click <strong className="text-orange-500">"Add Activity / Area"</strong> above to start building your risk assessment matrix.
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                {canEditForm && (
                    <button type="button" onClick={onSave} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/30 transition-transform active:scale-95 flex items-center gap-2">
                        {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save Assessment
                    </button>
                )}
            </div>
        </div>
    );
}
