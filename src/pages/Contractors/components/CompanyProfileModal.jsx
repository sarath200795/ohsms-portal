import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function CompanyProfileModal({
    activeVendor,
    canEdit,
    editingVendor,
    getComplianceStatus,
    globalIncidents,
    globalPermits,
    isGlobalUser,
    navigate,
    newDocReq,
    onClose,
    onHandleDocUpload,
    onProvisionVendorPortalAccess,
    onRemoveWorker,
    onRequestAdditionalDoc,
    onSaveCompanyEdit,
    portalProvisioning,
    serviceTypes,
    setEditingVendor,
    setNewDocReq,
    visibleSites
}) {
    const permitMatches = globalPermits.filter((permit) => permit.contractorId === activeVendor.firebaseKey || (permit.contractorName && permit.contractorName.toLowerCase() === activeVendor.companyName.toLowerCase()));

    const companyIncidents = [
        ...safeArr(activeVendor.incidents).map((incident) => ({
            id: incident.id || 'INC',
            date: incident.date,
            type: incident.type || 'Incident',
            desc: incident.desc || incident.description,
            key: `${incident.id || 'local'}-${incident.date || Math.random().toString(36).slice(2)}`
        })),
        ...globalIncidents
            .filter((incident) => incident.affectedPersonType === 'Contractor' && incident.contractorId === activeVendor.firebaseKey)
            .map((incident) => ({
                id: incident.id,
                date: incident.incidentDate || incident.date,
                type: incident.incidentType || incident.type,
                desc: incident.description || incident.title,
                key: incident.firebaseKey || incident.id
            }))
    ].sort((left, right) => new Date(right.date || '1970-01-01') - new Date(left.date || '1970-01-01'));

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-[95vw] xl:max-w-[90vw] w-full relative max-h-[95vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center flex-shrink-0">
                    {editingVendor ? (
                        <div className="flex-1 mr-6 grid grid-cols-1 md:grid-cols-5 gap-4">
                            <input value={editingVendor.companyName} onChange={(event) => setEditingVendor({ ...editingVendor, companyName: event.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm font-bold outline-none focus:border-indigo-500" placeholder="Company Name" />

                            <div className="relative group col-span-2">
                                <div className="text-[10px] text-slate-400 absolute -top-2 left-2 bg-slate-900 px-1 font-bold z-10">Authorized Sites</div>
                                <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 h-10 overflow-hidden flex flex-wrap gap-1 hover:h-auto hover:absolute hover:w-full hover:z-50 min-h-full">
                                    {visibleSites.map((site) => (
                                        <label key={site.code} className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer whitespace-nowrap ${editingVendor.allocatedSites.includes(site.code) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                                            <input type="checkbox" className="hidden" checked={editingVendor.allocatedSites.includes(site.code)} onChange={() => {
                                                const exists = editingVendor.allocatedSites.includes(site.code);
                                                setEditingVendor((prev) => ({ ...prev, allocatedSites: exists ? prev.allocatedSites.filter((value) => value !== site.code) : [...prev.allocatedSites, site.code] }));
                                            }} />
                                            {site.name}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <select value={editingVendor.serviceType} onChange={(event) => setEditingVendor({ ...editingVendor, serviceType: event.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-indigo-300 text-sm font-bold outline-none focus:border-indigo-500">
                                {serviceTypes.map((type) => <option key={type}>{type}</option>)}
                            </select>

                            <input type="email" value={editingVendor.email || ''} onChange={(event) => setEditingVendor({ ...editingVendor, email: event.target.value.toLowerCase() })} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="Portal Email" />
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-2xl font-black text-white flex items-center gap-3">
                                <i className="fas fa-building text-indigo-500"></i> {activeVendor.companyName}
                                {activeVendor.vendorCode && <span className="text-xs font-mono bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded ml-2" title="Give this code to the vendor for portal login"><i className="fas fa-key mr-1"></i> {activeVendor.vendorCode}</span>}
                            </h3>
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2 flex flex-wrap gap-4 items-center">
                                <span className="flex gap-1 items-center bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded"><i className="fas fa-map-marker-alt"></i> {safeArr(activeVendor.allocatedSites).join(', ') || 'No Sites'}</span>
                                <span><i className="fas fa-wrench text-indigo-400 mr-1"></i> {activeVendor.serviceType}</span>
                                <span><i className="fas fa-user text-indigo-400 mr-1"></i> {activeVendor.contactPerson}</span>
                                <span><i className="fas fa-envelope text-indigo-400 mr-1"></i> {activeVendor.email || 'No Portal Email'}</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] border ${activeVendor.portalUid ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/20 text-amber-400 border-amber-500/30'}`}><i className={`fas ${activeVendor.portalUid ? 'fa-shield-check' : 'fa-user-lock'} mr-1`}></i>{activeVendor.portalUid ? 'Portal Linked' : 'Portal Pending'}</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] border ${getComplianceStatus(activeVendor.documents).color}`}>{getComplianceStatus(activeVendor.documents).label}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 items-center">
                        {isGlobalUser && !editingVendor && <button type="button" onClick={onProvisionVendorPortalAccess} disabled={portalProvisioning} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors shadow-lg shadow-emerald-600/20">{portalProvisioning ? <><i className="fas fa-spinner fa-spin mr-1"></i> Working</> : <><i className="fas fa-user-shield mr-1"></i> {activeVendor.portalUid ? 'Sync Portal Access' : 'Provision Portal'}</>}</button>}
                        {canEdit && (
                            editingVendor ? (
                                <>
                                    <button type="button" onClick={() => setEditingVendor(null)} className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest">Cancel</button>
                                    <button type="button" onClick={onSaveCompanyEdit} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors shadow-lg shadow-emerald-600/20"><i className="fas fa-save mr-1"></i> Save</button>
                                </>
                            ) : (
                                <button type="button" onClick={() => setEditingVendor({ ...activeVendor })} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors border border-slate-600"><i className="fas fa-edit"></i> Edit Company</button>
                            )
                        )}
                        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 ml-2"><i className="fas fa-times text-xl"></i></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg-slate-900/50">
                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[70vh]">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-folder-open mr-2"></i> Company Level Documents</h4>
                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                            {safeArr(activeVendor.documents).map((doc) => {
                                const isExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                                return (
                                    <div key={doc.id} className={`p-3 rounded-xl border shadow-sm ${isExpired ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-900 border-slate-700'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-xs font-bold text-white leading-tight">{doc.name} {doc.isMandatory && <span className="text-[8px] bg-red-900 text-red-300 px-1 ml-1 rounded">REQ</span>}</div>
                                            {doc.file ? <a href={doc.file} target="_blank" rel="noreferrer" className="text-[9px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded border border-blue-500/30 uppercase font-bold"><i className="fas fa-eye"></i> View</a> : canEdit ? (
                                                <div className="relative overflow-hidden w-20">
                                                    <input type="file" onChange={(event) => onHandleDocUpload(doc.id, event.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                                    <div className="w-full bg-slate-800 border border-slate-600 text-slate-300 text-[9px] p-1 text-center rounded uppercase font-bold cursor-pointer">Upload</div>
                                                </div>
                                            ) : <div className="text-[9px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700 uppercase font-bold">Pending</div>}
                                        </div>
                                        <div className="flex justify-between items-center mt-2">
                                            <div className={`text-[10px] font-mono ${isExpired ? 'text-red-400' : 'text-slate-500'}`}>Exp: {doc.expiryDate || 'N/A'}</div>
                                            {doc.status === 'Uploaded' && <span className="text-[8px] text-emerald-400 font-bold uppercase"><i className="fas fa-check"></i> Uploaded</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {canEdit && (
                            <div className="mt-4 pt-4 border-t border-slate-800">
                                <input value={newDocReq} onChange={(event) => setNewDocReq(event.target.value)} placeholder="Request new document..." className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs p-2.5 text-white outline-none focus:border-indigo-500 mb-2" />
                                <button type="button" onClick={onRequestAdditionalDoc} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"><i className="fas fa-plus"></i> Request</button>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[70vh]">
                        <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 flex justify-between items-center">
                            <span><i className="fas fa-users-cog mr-2"></i> Employee Roster</span>
                            <span className="bg-purple-900 text-purple-300 px-2 py-0.5 rounded">{safeArr(activeVendor.workers).length}</span>
                        </h4>
                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-2">
                            {safeArr(activeVendor.workers).map((worker) => (
                                <div key={worker.id} className="p-3 rounded-xl border border-slate-700 bg-slate-900 shadow-sm relative group">
                                    <div className="text-sm font-bold text-white">{worker.name} <span className="text-[9px] text-slate-400 font-normal ml-1">({worker.role})</span></div>
                                    <div className="mt-2 flex gap-2">
                                        {worker.medDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase font-bold"><i className="fas fa-check"></i> Med Fit</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 uppercase font-bold"><i className="fas fa-times"></i> Med Fit</span>}
                                        {worker.compDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase font-bold"><i className="fas fa-check"></i> Comp Doc</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 uppercase font-bold"><i className="fas fa-times"></i> Comp Doc</span>}
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-slate-800 flex justify-between items-center">
                                        <div>{!worker.inductionDate || worker.inductionDate === 'Pending' ? <span className="text-[8px] text-orange-400 uppercase font-bold tracking-widest"><i className="fas fa-exclamation-triangle"></i> Pend Induction</span> : <span className="text-[8px] text-emerald-400 uppercase font-bold tracking-widest"><i className="fas fa-check"></i> Inducted</span>}</div>
                                        {canEdit && <button type="button" onClick={() => onRemoveWorker(activeVendor.firebaseKey, worker.id)} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash-alt text-xs"></i></button>}
                                    </div>
                                </div>
                            ))}
                            {safeArr(activeVendor.workers).length === 0 && <div className="text-center text-slate-500 text-xs italic mt-4">No employees registered. Add them from the Worker Profiles tab.</div>}
                        </div>
                    </div>

                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[70vh]">
                        <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-clipboard-list mr-2"></i> Work Permits</h4>
                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                            {permitMatches.map((permit, index) => (
                                <div key={permit.firebaseKey || permit.id || index} className={`p-3 rounded-xl border shadow-sm ${permit.status === 'Closed' ? 'bg-slate-900 border-slate-700 opacity-60' : 'bg-orange-950/20 border-orange-500/30'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400">{permit.permitType || permit.typeId}</div>
                                        <div className="text-[9px] font-mono text-slate-500">{permit.id || 'PTW'}</div>
                                    </div>
                                    <div className="text-xs text-white font-medium mb-2 leading-tight">{permit.workDescription || permit.description}</div>
                                    {safeArr(permit.nonCompliances).length > 0 && (
                                        <div className="mb-3 bg-red-950/30 border border-red-500/30 rounded p-2 mt-2">
                                            <div className="text-[8px] font-bold text-red-400 uppercase tracking-widest mb-1"><i className="fas fa-exclamation-triangle"></i> Permit Non-Compliances</div>
                                            <ul className="list-disc pl-3 text-[10px] text-slate-300 space-y-1">
                                                {safeArr(permit.nonCompliances).map((nonCompliance, idx) => <li key={idx}>{nonCompliance.desc || nonCompliance}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-[9px] uppercase font-bold mt-2">
                                        <span className="text-slate-400">{permit.date || (permit.validFromDate ? `${permit.validFromDate} to ${permit.validToDate}` : permit.createdAt?.split('T')[0])}</span>
                                        <span className={permit.status === 'Closed' ? 'text-emerald-500' : 'text-yellow-500 animate-pulse'}>{permit.status}</span>
                                    </div>
                                </div>
                            ))}
                            {permitMatches.length === 0 && <div className="text-center text-slate-500 text-xs italic mt-4">No permits found for this contractor.</div>}
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                            <button type="button" onClick={() => navigate('/ptw')} className="text-[10px] text-orange-400 hover:text-white uppercase font-bold tracking-widest transition-colors"><i className="fas fa-external-link-alt mr-1"></i> Open PTW Module</button>
                        </div>
                    </div>

                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner flex flex-col h-[70vh]">
                        <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4"><i className="fas fa-briefcase-medical mr-2"></i> Incident History</h4>
                        <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                            {companyIncidents.length === 0 ? (
                                <div className="text-center text-slate-500 text-xs italic mt-4">No incidents recorded for this company.</div>
                            ) : companyIncidents.map((incident) => (
                                <div key={incident.key} className="p-3 rounded-xl border border-red-500/30 bg-red-950/20 shadow-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">{incident.type}</div>
                                        <div className="text-[9px] font-mono text-slate-500">{incident.id}</div>
                                    </div>
                                    <div className="text-xs text-white font-medium mb-2 leading-tight">{incident.desc}</div>
                                    <div className="text-[9px] uppercase font-bold text-slate-400">{incident.date}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                            <button type="button" onClick={() => navigate('/incidents')} className="text-[10px] text-red-400 hover:text-white uppercase font-bold tracking-widest transition-colors"><i className="fas fa-external-link-alt mr-1"></i> Open Incident Module</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
