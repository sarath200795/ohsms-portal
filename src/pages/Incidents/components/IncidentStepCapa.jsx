import React from 'react';
import { UserSelect } from './IncidentAnalysisWidgets';

export default function IncidentStepCapa({
    addCapa,
    canEditCapa,
    canEditForm,
    data,
    newCapaAct,
    newCapaDue,
    newCapaOwn,
    newCapaSite,
    removeCapa,
    saveData,
    saving,
    setData,
    setNewCapaAct,
    setNewCapaDue,
    setNewCapaOwn,
    setNewCapaSite,
    setView,
    siteUsers,
    sites
}) {
    return (
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
            <div className="flex items-center justify-between mb-8 border-b border-orange-500/20 pb-4">
                <h2 className="text-xl font-bold text-orange-400 flex items-center gap-3 uppercase tracking-widest"><i className="fas fa-list-check text-2xl"></i> 4. CAPA Plan</h2>
                {canEditForm && (
                    <button type="button" onClick={() => saveData('investigation-draft')} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-red-900/30 transition flex items-center gap-2 disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`}></i> Save</button>
                )}
            </div>

            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                <div className="col-span-1 md:col-span-5 mt-2 bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl flex items-center justify-between shadow-inner mb-6">
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={data.horizontalDeployment || false} onChange={(e) => setData({ ...data, horizontalDeployment: e.target.checked })} disabled={!canEditForm} className="w-5 h-5 accent-blue-500 cursor-pointer" />
                            <span className="text-sm font-bold text-blue-400 uppercase tracking-widest">Horizontal Deployment</span>
                        </label>
                        <p className="text-[10px] text-slate-400 mt-1 ml-8">If checked, saving this report will automatically generate a separate CAPA Action for <strong>every site in the organization</strong>.</p>
                    </div>
                    <i className="fas fa-globe text-3xl text-blue-500/20"></i>
                </div>

                {canEditForm && (
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-8 no-print bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-inner">
                        <div className="md:col-span-2">
                            <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Action Required</label>
                            <input value={newCapaAct} onChange={(e) => setNewCapaAct(e.target.value)} placeholder="Describe action..." className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white focus:border-orange-500 outline-none" />
                        </div>
                        <div>
                            <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Target Site</label>
                            <select value={newCapaSite} onChange={(e) => setNewCapaSite(e.target.value)} disabled={data.horizontalDeployment} className={`w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white outline-none focus:border-orange-500 ${data.horizontalDeployment ? 'opacity-50' : ''}`}>
                                <option value="">{data.horizontalDeployment ? 'All Sites' : 'Default'}</option>
                                {!data.horizontalDeployment && sites.map((site) => <option key={site.code} value={site.code}>{site.code}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Owner</label>
                            <UserSelect users={siteUsers} value={newCapaOwn} onChange={(value) => setNewCapaOwn(value)} disabled={false} placeholder="Assign to..." />
                        </div>
                        <div>
                            <label className="text-[9px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Due Date</label>
                            <input type="date" value={newCapaDue} onChange={(e) => setNewCapaDue(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-white focus:border-orange-500 outline-none" />
                        </div>
                        <div className="flex items-end">
                            <button type="button" onClick={addCapa} className="w-full bg-orange-600 hover:bg-orange-500 text-white p-3 rounded-lg font-bold shadow-lg shadow-orange-600/20 transition-transform active:scale-95 text-xs uppercase tracking-widest"><i className="fas fa-plus mr-1"></i> Add</button>
                        </div>
                    </div>
                )}

                <div className="overflow-hidden rounded-xl border border-slate-700 shadow-lg bg-slate-900">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-950 text-[10px] uppercase tracking-widest font-bold text-slate-500 border-b border-slate-800">
                            <tr><th className="p-5">Action Details</th><th className="p-5">Site</th><th className="p-5">Owner</th><th className="p-5 w-24">Due Date</th><th className="p-5 w-32">Status</th><th className="p-5 w-12"></th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {(data.capa || []).map((capaItem, index) => (
                                <tr key={index} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-5">
                                        {capaItem.actionType === 'Verification' && (
                                            <div className="mb-2 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-cyan-300">
                                                Verification Follow-Up
                                            </div>
                                        )}
                                        <textarea rows={3} className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-orange-500 text-xs py-1 outline-none text-white font-medium resize-none leading-snug" value={capaItem.act} onChange={(e) => { const next = [...data.capa]; next[index].act = e.target.value; setData({ ...data, capa: next }); }} disabled={!canEditCapa(capaItem)} />
                                    </td>
                                    <td className="p-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        {data.horizontalDeployment ? <span className="bg-blue-900/30 text-blue-400 px-2 py-1 rounded border border-blue-500/30">All Sites</span> : (capaItem.siteId || data.siteId)}
                                    </td>
                                    <td className="p-5 text-blue-400 font-bold"><UserSelect users={siteUsers} value={capaItem.own} onChange={(value) => { const next = [...data.capa]; next[index].own = value; setData({ ...data, capa: next }); }} disabled={!canEditCapa(capaItem)} /></td>
                                    <td className="p-5"><input type="date" className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-orange-500 text-[10px] py-1 outline-none font-mono" value={capaItem.due} onChange={(e) => { const next = [...data.capa]; next[index].due = e.target.value; setData({ ...data, capa: next }); }} disabled={!canEditCapa(capaItem)} /></td>
                                    <td className="p-5">
                                        {canEditCapa(capaItem) ? (
                                            <select value={capaItem.status} onChange={(e) => { const next = [...data.capa]; next[index].status = e.target.value; setData({ ...data, capa: next }); }} className={`w-full bg-slate-950 text-xs px-3 py-2 rounded-lg outline-none border font-bold ${capaItem.status === 'Closed' ? 'text-emerald-400 border-emerald-500/30' : capaItem.status === 'In Progress' ? 'text-blue-400 border-blue-500/30' : 'text-orange-400 border-orange-500/30'}`}>
                                                <option>Open</option><option>In Progress</option><option>Closed</option>
                                            </select>
                                        ) : <span className={`px-3 py-1.5 rounded border text-[10px] font-bold uppercase tracking-widest ${capaItem.status === 'Closed' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/20' : capaItem.status === 'In Progress' ? 'bg-blue-900/20 text-blue-400 border-blue-500/20' : 'bg-orange-900/20 text-orange-400 border-orange-500/20'}`}>{capaItem.status}</span>}
                                    </td>
                                    <td className="p-5 text-center">{canEditForm && <button type="button" onClick={() => removeCapa(index)} className="text-red-500 hover:text-white bg-red-500/10 hover:bg-red-500 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-trash-alt"></i></button>}</td>
                                </tr>
                            ))}
                            {(!data.capa || data.capa.length === 0) && <tr><td colSpan="6" className="text-center py-12 text-slate-500 text-sm italic border-t border-slate-800">No actions defined. Add one above.</td></tr>}
                        </tbody>
                    </table>
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
