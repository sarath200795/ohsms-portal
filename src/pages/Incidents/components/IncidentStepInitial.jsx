import React from 'react';
import { SMART_CATEGORIES, safeArr } from '../utils';

export default function IncidentStepInitial({
    activePersonnelList,
    analysisStatusLabel,
    allowedSites,
    canEditForm,
    contractors,
    data,
    handleDescriptionBlur,
    handleImageUpload,
    handleRemoveVideo,
    handleVideoUpload,
    incidentReporting,
    investigationRequired,
    isAnalyzing,
    isGlobalUser,
    resetIncidentDraft,
    saveData,
    saving,
    setData,
    triggerPrint,
    generateSmartInvestigation
}) {
    return (
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-300">
            <h2 className="text-xl font-bold text-red-400 mb-8 flex items-center gap-3 border-b border-red-500/20 pb-4 uppercase tracking-widest"><i className="fas fa-clipboard-list text-2xl"></i> 1. Initial Report Details</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <div className="md:col-span-4">
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Incident Title *</label>
                    <input value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-red-500 font-bold" placeholder="e.g. Laceration to right hand during grinding" />
                </div>
                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Site ID *</label>
                    <select value={data.siteId} onChange={(e) => setData({ ...data, siteId: e.target.value })} disabled={!canEditForm || (!isGlobalUser && allowedSites.length <= 1)} className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500">
                        {(isGlobalUser || allowedSites.length > 1) && <option value="">Select Authorized Site...</option>}
                        {allowedSites.map((site) => <option key={site.code} value={site.code}>{site.name} ({site.code})</option>)}
                    </select>
                </div>
                <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Date *</label><input type="date" value={data.date} onChange={(e) => setData({ ...data, date: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500 font-mono" /></div>
                <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Time</label><input type="time" value={data.time} onChange={(e) => setData({ ...data, time: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500 font-mono" /></div>
                <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Record ID</label><input value={data.id} className="w-full bg-slate-950/50 border border-slate-800 p-3 rounded-lg text-slate-500 text-xs font-mono" disabled placeholder="Auto-generated" /></div>

                <div><label className="text-[10px] uppercase font-bold text-purple-400 ml-1 mb-2 block">Smart Category (AI)</label><select value={data.smartType} onChange={(e) => setData({ ...data, smartType: e.target.value, manualOverrides: { ...data.manualOverrides, smartType: true } })} disabled={!canEditForm} className="w-full bg-purple-900/10 border border-purple-500/30 p-3 rounded-lg text-purple-300 font-bold text-xs outline-none focus:border-purple-500">{SMART_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>

                <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Incident Type</label><select value={data.type} onChange={(e) => setData({ ...data, type: e.target.value, manualOverrides: { ...data.manualOverrides, type: true } })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500"><option>Near Miss</option><option>Property Damage</option><option>First Aid injury</option><option>Lost Time injury</option><option>Reportable Injury</option></select></div>
                <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Severity</label><select value={data.severity} onChange={(e) => setData({ ...data, severity: e.target.value, manualOverrides: { ...data.manualOverrides, severity: true } })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500"><option>Level A</option><option>Level B</option><option>Level C</option><option>Level D</option></select></div>

                <div><label className="text-[10px] uppercase font-bold text-slate-500 ml-1 mb-2 block">Equipment</label><input value={data.equipmentInvolved} onChange={(e) => setData({ ...data, equipmentInvolved: e.target.value })} disabled={!canEditForm} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-xs outline-none focus:border-red-500" placeholder="e.g., Forklift" /></div>
            </div>

            <div className="mb-6 bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-inner relative">
                <label className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2 ml-1">
                    Detailed Incident Narrative
                    {!data.manualOverrides?.smartType && <span className="text-purple-400 animate-pulse bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/30 tracking-widest"><i className="fas fa-robot mr-1"></i> Auto-Classify on blur</span>}
                </label>
                <textarea rows="4" value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} onBlur={handleDescriptionBlur} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-purple-500 outline-none shadow-inner mb-4" disabled={!canEditForm} placeholder="e.g., 'John slipped on a puddle of hydraulic fluid because the forklift gasket blew out, which we complained about for weeks...'" />

                {canEditForm && (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => generateSmartInvestigation()}
                            disabled={isAnalyzing || (!data.imageEvidence && !data.videoEvidence) || (!(data.description || '').trim() && !(data.evidenceObservations || '').trim())}
                            className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAnalyzing ? (
                                <><i className="fas fa-spinner fa-spin"></i> {analysisStatusLabel || 'Processing Context...'}</>
                            ) : (
                                <><i className="fas fa-microchip"></i> Auto-Generate RCA Matrix</>
                            )}
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-indigo-950/20 p-6 rounded-2xl border border-indigo-500/30 shadow-inner mb-6">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-indigo-500/30 pb-2 mb-4"><i className="fas fa-user-injured mr-2"></i> Affected Personnel</h4>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-300">
                            <input type="radio" name="pType" value="Internal" checked={data.affectedPersonType === 'Internal'} onChange={() => setData({ ...data, affectedPersonType: 'Internal', contractorId: '', affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="accent-indigo-500 w-4 h-4" /> Internal Staff
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-300">
                            <input type="radio" name="pType" value="Contractor" checked={data.affectedPersonType === 'Contractor'} onChange={() => setData({ ...data, affectedPersonType: 'Contractor', affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="accent-indigo-500 w-4 h-4" /> Contractor
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-300">
                            <input type="radio" name="pType" value="External Non-Employee" checked={data.affectedPersonType === 'External Non-Employee'} onChange={() => setData({ ...data, affectedPersonType: 'External Non-Employee', contractorId: '', affectedPersonId: 'external-non-employee', affectedPersonName: '' })} disabled={!canEditForm} className="accent-indigo-500 w-4 h-4" /> External Non-Employee
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-300">
                            <input type="radio" name="pType" value="None" checked={data.affectedPersonType === 'None'} onChange={() => setData({ ...data, affectedPersonType: 'None', contractorId: '', affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="accent-indigo-500 w-4 h-4" /> None (Property/Env)
                        </label>
                    </div>

                    {data.affectedPersonType === 'Contractor' && (
                        <div>
                            <label className="text-[10px] uppercase font-bold text-indigo-300 block mb-2">Select Vendor Company</label>
                            <select value={data.contractorId} onChange={(e) => setData({ ...data, contractorId: e.target.value, affectedPersonId: '', affectedPersonName: '' })} disabled={!canEditForm} className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl p-3 text-white outline-none focus:border-indigo-400">
                                <option value="">Select Company...</option>
                                {contractors.filter((contractor) => !data.siteId || safeArr(contractor.allocatedSites).includes(data.siteId) || contractor.siteId === 'GLOBAL').map((contractor) => <option key={contractor.firebaseKey} value={contractor.firebaseKey}>{contractor.companyName}</option>)}
                            </select>
                        </div>
                    )}

                    {data.affectedPersonType === 'External Non-Employee' && (
                        <div>
                            <label className="text-[10px] uppercase font-bold text-indigo-300 block mb-2">External Person Name</label>
                            <input
                                value={data.affectedPersonName || ''}
                                onChange={(e) => setData({ ...data, affectedPersonId: 'external-non-employee', affectedPersonName: e.target.value })}
                                disabled={!canEditForm}
                                className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl p-3 text-white outline-none focus:border-indigo-400 font-bold"
                                placeholder="Enter member / visitor / non-employee name"
                            />
                            <p className="text-[10px] text-slate-500 mt-2 italic">Use this for gym members, visitors, customers, or other external non-employees who are not in the contractor register.</p>
                        </div>
                    )}

                    {(data.affectedPersonType === 'Internal' || data.affectedPersonType === 'Contractor') && (
                        <div>
                            <label className="text-[10px] uppercase font-bold text-indigo-300 block mb-2">Select Individual Worker</label>
                            <select
                                value={data.affectedPersonId}
                                onChange={(e) => {
                                    const target = activePersonnelList.find((person) => person.id === e.target.value);
                                    setData({ ...data, affectedPersonId: e.target.value, affectedPersonName: target ? (target.name || target.email) : '' });
                                }}
                                disabled={!canEditForm || (data.affectedPersonType === 'Contractor' && !data.contractorId)}
                                className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl p-3 text-white outline-none focus:border-indigo-400 font-bold"
                            >
                                <option value="">Select Person...</option>
                                {activePersonnelList.map((person) => <option key={person.id} value={person.id}>{person.name || person.email} {person.role ? `(${person.role})` : ''}</option>)}
                            </select>
                            <p className="text-[10px] text-slate-500 mt-2 italic">Note: Selecting a contractor worker here will automatically sync this incident to their permanent ISO 45001 Safety Passport.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="mb-6">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-2 ml-1">Immediate Actions Taken</label>
                <textarea rows="3" value={data.immediateAction} onChange={(e) => setData({ ...data, immediateAction: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-red-500 outline-none shadow-inner" disabled={!canEditForm} placeholder="What was done immediately to secure the scene or treat the injured?"></textarea>
            </div>

            <div className={`mb-6 rounded-2xl border p-5 ${investigationRequired ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}`}>
                <p className={`text-xs font-bold uppercase tracking-[0.25em] ${investigationRequired ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {investigationRequired ? 'Stage 2 Investigation Report Required' : 'Stage 2 Investigation Report Optional'}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                    {investigationRequired
                        ? 'Save this stage as the Initial Information Report first. After that, the incident must be completed through the Investigation Report before closure.'
                        : 'This incident can remain as an Initial Information Report, or you can continue into the Investigation Report if you want a full root-cause record.'}
                </p>
                {incidentReporting?.initialSubmittedAt && (
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        Initial report already saved on {new Date(incidentReporting.initialSubmittedAt).toLocaleString()}
                    </p>
                )}
            </div>

            <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-xl space-y-6">
                <div>
                    <label className="text-[10px] uppercase font-bold text-red-300 mb-2 block"><i className="fas fa-photo-film mr-2"></i> Media Evidence *</label>
                    <p className="text-xs text-slate-400 mb-4">Upload at least one scene photo or supporting video for the initial report. Smart investigation uses the narrative, evidence observations, and uploaded media together.</p>
                    {data.imageEvidence ? (
                        <div className="relative inline-block group">
                            <img src={data.imageEvidence} alt="Evidence" className="h-48 rounded-xl border-2 border-slate-700 object-cover shadow-xl" />
                            {canEditForm && <button type="button" onClick={() => setData({ ...data, imageEvidence: null, imageEvidenceName: '' })} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-xl w-8 h-8 text-sm opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center justify-center"><i className="fas fa-times"></i></button>}
                            {data.imageEvidenceName && <div className="mt-3 text-xs font-mono text-slate-400">{data.imageEvidenceName}</div>}
                        </div>
                    ) : canEditForm && (
                        <label className="cursor-pointer bg-slate-900 border-2 border-dashed border-slate-700 hover:border-red-500 hover:bg-slate-800 transition-colors w-48 h-48 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-red-400">
                            <i className="fas fa-cloud-upload-alt text-3xl mb-2"></i>
                            <span className="text-xs font-bold uppercase tracking-widest">Upload Photo</span>
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                    )}
                </div>

                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-2 block"><i className="fas fa-video mr-2"></i> Video Evidence</label>
                    <p className="text-xs text-slate-500 mb-4">Upload a supporting clip if it helps explain movement, sequence, equipment condition, or visible failure.</p>
                    {data.videoEvidence ? (
                        <div className="space-y-3">
                            <video src={data.videoEvidence} controls className="max-h-64 rounded-xl border border-slate-700 bg-black" />
                            <div className="flex items-center gap-4">
                                {data.videoEvidenceName && <div className="text-xs font-mono text-slate-400">{data.videoEvidenceName}</div>}
                                {canEditForm && <button type="button" onClick={handleRemoveVideo} className="text-[10px] uppercase tracking-[0.22em] text-red-400 font-bold hover:text-red-300">Remove Video</button>}
                            </div>
                        </div>
                    ) : canEditForm && (
                        <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-400 transition-colors hover:border-blue-500 hover:text-blue-300">
                            <i className="fas fa-film"></i> Upload Video
                            <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
                        </label>
                    )}
                </div>

                <div>
                    <label className="text-[10px] uppercase font-bold text-blue-300 mb-2 block"><i className="fas fa-binoculars mr-2"></i> Evidence Observations For Smart Investigation</label>
                    <textarea
                        rows="3"
                        value={data.evidenceObservations || ''}
                        onChange={(e) => setData({ ...data, evidenceObservations: e.target.value })}
                        disabled={!canEditForm}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-blue-500 outline-none shadow-inner resize-none"
                        placeholder="Describe what is visible in the photo or video: damaged guard, leaked fluid, scorch marks, fallen material, missing barricade, etc."
                    />
                </div>

                <div className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] ${data.imageEvidence || data.videoEvidence ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                    {data.imageEvidence || data.videoEvidence
                        ? 'Media evidence attached and ready for report submission'
                        : 'Upload at least one photo or video to complete the initial report'}
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-800">
                <button type="button" onClick={resetIncidentDraft} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                <button type="button" onClick={() => triggerPrint(data, 'initial')} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-6 py-4 rounded-xl transition shadow text-xs uppercase tracking-widest flex items-center gap-2">
                    <i className="fas fa-print text-lg"></i> Print Initial Report
                </button>
                {canEditForm && (
                    <button type="button" onClick={() => saveData('initial')} disabled={saving} className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 flex items-center gap-3 transition-transform active:scale-95 text-sm uppercase tracking-widest disabled:opacity-50"><i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} text-lg`}></i> {saving ? 'Saving...' : 'Save Initial Report'}</button>
                )}
            </div>
        </div>
    );
}
