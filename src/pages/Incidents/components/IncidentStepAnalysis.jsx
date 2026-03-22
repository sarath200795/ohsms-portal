import React from 'react';
import { FaultTreeNode, Fishbone } from './IncidentAnalysisWidgets';

export default function IncidentStepAnalysis({
    addFiveWhyPath,
    canEditForm,
    data,
    generateSmartInvestigation,
    isAnalyzing,
    removeFiveWhyPath,
    saveData,
    saving,
    setData,
    setView,
    updateFiveWhy,
    updatePathName
}) {
    return (
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
            <div className="flex justify-between items-center mb-8 border-b border-purple-500/20 pb-4">
                <h2 className="text-xl font-bold text-purple-400 flex items-center gap-3 uppercase tracking-widest"><i className="fas fa-search-location text-2xl"></i> 3. Root Cause Analysis</h2>
                {canEditForm && (
                    <button type="button" onClick={() => generateSmartInvestigation(data.description)} disabled={isAnalyzing || !data.description || data.description.length < 15} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-lg shadow-purple-600/20 flex items-center gap-2 transition-transform active:scale-95 uppercase tracking-widest disabled:opacity-50">
                        {isAnalyzing ? <><i className="fas fa-spinner fa-spin"></i> Analyzing...</> : <><i className="fas fa-wand-magic-sparkles"></i> AI Auto-Analyze</>}
                    </button>
                )}
            </div>

            <div className="space-y-12">
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                    <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs flex items-center"><i className="fas fa-fish text-blue-400 mr-2"></i> Fishbone Diagram</h3>
                    <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 overflow-x-auto">
                        <Fishbone data={data.investigation?.fishbone || { man: [], machine: [], material: [], method: [], environment: [] }} onChange={(fishbone) => setData({ ...data, investigation: { ...data.investigation, fishbone } })} disabled={!canEditForm} />
                    </div>
                </div>

                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                    <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs flex items-center"><i className="fas fa-project-diagram text-orange-400 mr-2"></i> Fault Tree Analysis</h3>
                    <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 overflow-x-auto tree">
                        <ul className="m-0 p-0"><FaultTreeNode node={data.investigation?.faultTree || { id: 1, label: 'Top Event', type: 'AND', children: [] }} onUpdate={(faultTree) => setData({ ...data, investigation: { ...data.investigation, faultTree } })} disabled={!canEditForm} /></ul>
                    </div>
                </div>

                <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-white uppercase tracking-widest text-xs flex items-center"><i className="fas fa-question-circle text-purple-400 mr-2"></i> 5-Whys Analysis</h3>
                        {canEditForm && <button type="button" onClick={addFiveWhyPath} className="bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-colors no-print"><i className="fas fa-code-branch mr-1"></i> Add Path</button>}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {data.investigation?.fiveWhys?.map((path, pIdx) => (
                            <div key={path.id || pIdx} className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-inner group">
                                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                                    <input value={path.name || `Analysis Path ${pIdx + 1}`} onChange={(e) => updatePathName(pIdx, e.target.value)} disabled={!canEditForm} className="bg-transparent text-xs font-bold text-purple-400 uppercase tracking-widest outline-none border-b border-transparent focus:border-purple-500 w-full transition-all" />
                                    {canEditForm && data.investigation.fiveWhys.length > 1 && <button type="button" onClick={() => removeFiveWhyPath(pIdx)} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/10 hover:bg-red-500 w-8 h-8 rounded flex items-center justify-center no-print ml-4"><i className="fas fa-trash-alt"></i></button>}
                                </div>
                                <div className="space-y-3">
                                    {path.whys?.map((why, index) => (
                                        <div key={index} className="flex gap-4 items-center">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-12 text-right border-r border-slate-700 pr-3">Why {index + 1}</span>
                                            <input className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white focus:border-purple-500 outline-none" value={why} onChange={(e) => updateFiveWhy(pIdx, index, e.target.value)} disabled={!canEditForm} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-emerald-950/30 p-6 rounded-2xl border border-emerald-900/50">
                    <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-bullseye mr-2"></i> Final Root Cause Conclusion</label>
                    <textarea rows="4" value={data.investigation?.rootCause || ''} onChange={(e) => setData({ ...data, investigation: { ...(data.investigation || {}), rootCause: e.target.value } })} disabled={!canEditForm} className="w-full bg-emerald-900/10 border border-emerald-500/30 rounded-xl p-5 text-sm text-emerald-100 focus:border-emerald-500 outline-none resize-none shadow-inner" placeholder="State the conclusive root cause based on the analysis above..."></textarea>
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                <button type="button" onClick={() => setView('repo')} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                {canEditForm && (
                    <button type="button" onClick={saveData} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} text-lg`}></i> {saving ? 'Saving...' : 'Save Draft'}</button>
                )}
            </div>
        </div>
    );
}
