import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function WorkerProfileModal({
    activeWorker,
    canEdit,
    contractors,
    getComplianceStatus,
    navigate,
    newWorkerDocReq,
    onClose,
    onHandleWorkerCoreDocUpload,
    onRequestAdditionalWorkerDoc,
    onUploadAdditionalWorkerDoc,
    setNewWorkerDocReq
}) {
    const parentContractor = contractors.find((contractor) => contractor.firebaseKey === activeWorker.contractorId);
    const parentStatus = parentContractor ? getComplianceStatus(parentContractor.documents) : null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-5xl w-full relative max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-8 border-b border-slate-800 bg-slate-950 flex justify-between items-start flex-shrink-0">
                    <div className="flex gap-6 items-center">
                        <div className="w-16 h-16 rounded-full bg-indigo-900/50 border border-indigo-500 flex items-center justify-center text-indigo-400 text-2xl shadow-inner">
                            <i className="fas fa-user-hard-hat"></i>
                        </div>
                        <div>
                            <h3 className="text-3xl font-black text-white mb-1">{activeWorker.name}</h3>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-3">
                                <span>{activeWorker.role}</span>
                                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                <span className="text-indigo-400">{activeWorker.companyName}</span>
                                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                <span className="text-emerald-400">Deployed: {activeWorker.deployedSite || 'Unassigned'}</span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {activeWorker.medDoc ? (
                                    <div className="flex items-center gap-1">
                                        <a href={activeWorker.medDoc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-l-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-colors"><i className="fas fa-file-medical"></i> Med Fitness</a>
                                        {canEdit && <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-r-lg px-2 py-1.5 transition-colors" title="Update Doc"><input type="file" onChange={(event) => onHandleWorkerCoreDocUpload('med', event.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" /><i className="fas fa-upload text-[10px]"></i></div>}
                                    </div>
                                ) : canEdit ? (
                                    <div className="relative overflow-hidden">
                                        <input type="file" onChange={(event) => onHandleWorkerCoreDocUpload('med', event.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="Upload Medical Fitness Form 33" />
                                        <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:bg-red-600 hover:text-white transition-colors"><i className="fas fa-upload"></i> Upload Med Fitness</span>
                                    </div>
                                ) : <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i className="fas fa-times-circle"></i> No Med Fitness Doc</span>}

                                {activeWorker.compDoc ? (
                                    <div className="flex items-center gap-1">
                                        <a href={activeWorker.compDoc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-blue-900/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-l-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-colors"><i className="fas fa-certificate"></i> Competence</a>
                                        {canEdit && <div className="relative overflow-hidden bg-slate-800 border border-slate-600 text-slate-400 hover:text-white cursor-pointer rounded-r-lg px-2 py-1.5 transition-colors" title="Update Doc"><input type="file" onChange={(event) => onHandleWorkerCoreDocUpload('comp', event.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" /><i className="fas fa-upload text-[10px]"></i></div>}
                                    </div>
                                ) : canEdit ? (
                                    <div className="relative overflow-hidden">
                                        <input type="file" onChange={(event) => onHandleWorkerCoreDocUpload('comp', event.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="Upload Competence Certificate" />
                                        <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:bg-red-600 hover:text-white transition-colors"><i className="fas fa-upload"></i> Upload Competence</span>
                                    </div>
                                ) : <span className="inline-flex items-center gap-2 bg-red-900/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest"><i className="fas fa-times-circle"></i> No Competence Doc</span>}
                            </div>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-500 hover:text-white w-10 h-10 rounded-full flex items-center justify-center bg-slate-800"><i className="fas fa-times text-xl"></i></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-900/50">
                    <div className="space-y-8">
                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4">Parent Company Compliance</h4>
                            {!parentContractor ? (
                                <div className="text-slate-500 italic text-xs">Data unavailable</div>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xs border-2 ${parentStatus.pct === 100 ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30' : parentStatus.pct > 50 ? 'border-yellow-500 text-yellow-400 bg-yellow-950/30' : 'border-red-500 text-red-400 bg-red-950/30'}`}>{parentStatus.pct}%</div>
                                    <div>
                                        <div className="text-white font-bold">{parentContractor.companyName}</div>
                                        <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${parentStatus.color.split(' ')[0]}`}>{parentStatus.label}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col max-h-[400px]">
                            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-folder-plus mr-2"></i> Additional Documents (Worker Level)</h4>
                            <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                                {safeArr(activeWorker.additionalDocs).map((doc) => (
                                    <div key={doc.id} className="p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm flex justify-between items-center">
                                        <div className="text-xs font-bold text-white">{doc.name}</div>
                                        {doc.file ? <a href={doc.file} target="_blank" rel="noreferrer" className="text-[9px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded border border-blue-500/30 uppercase font-bold"><i className="fas fa-eye"></i> View</a> : canEdit ? (
                                            <div className="relative overflow-hidden w-20">
                                                <input type="file" onChange={(event) => onUploadAdditionalWorkerDoc(doc.id, event.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                <div className="w-full bg-slate-800 border border-slate-600 text-slate-300 text-[9px] p-1 text-center rounded uppercase font-bold cursor-pointer">Upload</div>
                                            </div>
                                        ) : <div className="text-[9px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700 uppercase font-bold">Pending</div>}
                                    </div>
                                ))}
                                {safeArr(activeWorker.additionalDocs).length === 0 && <div className="text-center text-slate-500 text-xs italic mt-2">No additional documents requested.</div>}
                            </div>
                            {canEdit && (
                                <div className="mt-4 pt-4 border-t border-slate-800">
                                    <input value={newWorkerDocReq} onChange={(event) => setNewWorkerDocReq(event.target.value)} placeholder="Request extra doc (e.g. Police Ver.)" className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs p-2.5 text-white outline-none focus:border-indigo-500 mb-2" />
                                    <button type="button" onClick={onRequestAdditionalWorkerDoc} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus"></i> Request for Worker</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-graduation-cap mr-2"></i> Training & Inductions</h4>
                            <div className="space-y-4">
                                <div className={`p-4 rounded-xl border shadow-sm ${activeWorker.inductionDate && activeWorker.inductionDate !== 'Pending' ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-orange-950/20 border-orange-500/30'}`}>
                                    <div className="text-xs font-bold uppercase tracking-widest mb-1 text-white">Site Safety Induction</div>
                                    {activeWorker.inductionDate && activeWorker.inductionDate !== 'Pending' ? <div className="text-emerald-400 text-[10px] font-mono"><i className="fas fa-check-circle mr-1"></i> Completed: {activeWorker.inductionDate}</div> : <div className="text-orange-400 text-[10px] font-bold animate-pulse"><i className="fas fa-exclamation-triangle mr-1"></i> Pending / Required</div>}
                                </div>

                                {safeArr(activeWorker.trainingsList).map((training, index) => (
                                    <div key={index} className="p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm">
                                        <div className="text-sm font-bold text-blue-300">{training.topic || 'Training Session'}</div>
                                        <div className="text-[10px] font-mono text-slate-500 mt-1">Date: {training.date || 'N/A'} | Exp: <span className="text-emerald-400">{training.expiryDate || 'N/A'}</span></div>
                                    </div>
                                ))}
                                {safeArr(activeWorker.trainingsList).length === 0 && <div className="text-center text-slate-500 text-xs italic mt-4">No additional training records found globally.</div>}
                            </div>
                        </div>

                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-briefcase-medical mr-2"></i> Injury & Incident Involvement</h4>
                            <div className="space-y-3">
                                {safeArr(activeWorker.injuriesList).map((incident, index) => (
                                    <div key={incident.id || index} className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold text-xs uppercase tracking-widest text-red-400">{incident.type || incident.incidentType || 'Incident'}</div>
                                            <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded">{incident.date || incident.incidentDate || 'Unknown Date'}</div>
                                        </div>
                                        <div className="text-xs text-white font-bold mb-1">{incident.title || ''}</div>
                                        <div className="text-xs text-slate-300 leading-relaxed">{incident.desc || incident.description || 'No description provided.'}</div>
                                        <div className="mt-3 text-right">
                                            <button type="button" onClick={() => navigate(`/incidents?id=${incident.id || incident.firebaseKey}`)} className="text-[9px] bg-red-900/30 text-red-400 border border-red-500/30 px-2 py-1 rounded hover:bg-red-600 hover:text-white transition-colors uppercase font-bold tracking-widest">View Report</button>
                                        </div>
                                    </div>
                                ))}
                                {safeArr(activeWorker.injuriesList).length === 0 && <div className="text-center text-emerald-500 font-bold text-sm mt-10"><i className="fas fa-shield-check mr-2"></i>Zero Incidents Recorded!</div>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
