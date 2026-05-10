import React from 'react';

export default function IncidentStepReview({
    canEditForm,
    data,
    incidentReporting,
    investigationRequired,
    saveData,
    saving,
    scanHiraDatabase,
    setData,
    triggerPrint
}) {
    return (
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
            <h2 className="text-xl font-bold text-emerald-400 mb-8 flex items-center gap-3 border-b border-emerald-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-link text-2xl"></i> 5. Review & HIRA Connection</h2>

            <div className="bg-slate-950/50 p-8 rounded-2xl border border-slate-800 shadow-inner mb-8">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold text-lg text-white">Risk Assessment Integrity</h3>
                        <p className="text-xs text-slate-400 mt-1">Has the facility Risk Assessment (HIRA) been updated post-incident?</p>
                    </div>
                    <button type="button" onClick={scanHiraDatabase} disabled={!canEditForm} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50">
                        <i className="fas fa-search"></i> Scan HIRA Database
                    </button>
                </div>

                {data.linkedHazards && data.linkedHazards.length > 0 && (
                    <div className="mt-8 border-t border-slate-800 pt-6">
                        <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-4"><i className="fas fa-check-circle mr-2"></i> Linked HIRA Updates Confirmed</h5>
                        <ul className="space-y-3">
                            {data.linkedHazards.map((link, index) => (
                                <li key={index} className="bg-emerald-900/10 p-4 rounded-xl border border-emerald-500/20 flex justify-between items-center">
                                    <div>
                                        <span className="font-mono text-emerald-400 font-bold mr-3 bg-emerald-950 px-2 py-1 rounded border border-emerald-900">{link.raDocId}</span>
                                        <span className="text-white font-bold">{link.actName}</span>
                                        <span className="text-slate-400 text-xs ml-2">({link.category})</span>
                                    </div>
                                    <div className="bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg shadow-emerald-500/20">New Risk Score: {link.newRiskScore}</div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className={`flex gap-4 items-start mb-10 p-6 border rounded-2xl transition-colors cursor-pointer ${data.riskUpdated ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`} onClick={() => canEditForm && setData({ ...data, riskUpdated: !data.riskUpdated })}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${data.riskUpdated ? 'bg-emerald-500 text-white' : 'bg-slate-800 border border-slate-600 text-transparent'}`}>
                    <i className="fas fa-check"></i>
                </div>
                <div>
                    <label className="text-sm font-bold text-white block cursor-pointer mb-1">Formal Review Confirmation</label>
                    <p className="text-xs text-slate-400">I confirm that the site Risk Assessment (HIRA) has been formally reviewed, additional controls have been evaluated, and updated where necessary.</p>
                </div>
            </div>

            <div className={`mb-10 rounded-2xl border p-6 ${investigationRequired ? 'border-amber-500/30 bg-amber-500/10' : 'border-cyan-500/20 bg-cyan-500/10'}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-[0.25em] ${investigationRequired ? 'text-amber-300' : 'text-cyan-300'}`}>
                            {investigationRequired ? 'Stage 2 Investigation Report Mandatory' : 'Stage 2 Investigation Report Optional'}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                            {investigationRequired
                                ? 'This incident cannot be treated as closed on the initial report alone. Submit the Investigation Report from this stage to complete the record.'
                                : 'You can issue the Investigation Report from this stage if you want the full RCA, CAPA, and HIRA linkage captured in one final document.'}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Current Report Status</p>
                        <p className="mt-2 text-sm font-black uppercase text-white">{incidentReporting?.investigationStatus || 'Pending'}</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4 pt-8 border-t border-slate-800 action-buttons">
                <button type="button" onClick={() => triggerPrint(data, 'initial')} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-8 py-4 rounded-xl transition shadow text-xs uppercase tracking-widest flex items-center gap-2"><i className="fas fa-print text-lg"></i> Print Initial Report</button>
                <button type="button" onClick={() => triggerPrint(data, 'investigation')} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-8 py-4 rounded-xl transition shadow text-xs uppercase tracking-widest flex items-center gap-2"><i className="fas fa-file-lines text-lg"></i> Preview Investigation Report</button>
                {canEditForm && (
                    <button type="button" onClick={() => saveData('investigation-final')} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} text-lg`}></i> {saving ? 'Saving...' : 'Submit Investigation Report'}</button>
                )}
            </div>
        </div>
    );
}
