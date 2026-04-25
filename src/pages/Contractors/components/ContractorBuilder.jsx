import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function ContractorBuilder({
    canEdit,
    formData,
    goodsTypes,
    onGoodsTypeChange,
    onServiceTypeChange,
    onSubmit,
    saving,
    serviceTypes,
    setFormData,
    toggleAllocatedSite,
    visibleSites
}) {
    return (
        <div className="max-w-4xl mx-auto bg-slate-900/80 p-6 md:p-10 rounded-3xl border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
            <div className="mb-8 border-b border-slate-800 pb-6">
                <h3 className="text-3xl font-black text-white flex items-center gap-3"><i className="fas fa-building text-indigo-500"></i> Register New Vendor</h3>
                <p className="text-slate-400 text-sm mt-2">Create the company profile first. You can add their employees (Roster) later from the Worker Profiles tab.</p>
            </div>

            <div className="bg-slate-950/50 p-8 rounded-2xl border border-slate-800 shadow-inner mb-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Company / Contractor Name *</label>
                        <input value={formData.companyName} onChange={(event) => setFormData({ ...formData, companyName: event.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 font-bold" placeholder="e.g. Acme Construction Ltd." />
                    </div>

                    <div className="md:col-span-2">
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Authorized Sites Allocation *</label>
                        <div className="flex flex-wrap gap-2">
                            {visibleSites.map((site) => (
                                <label key={site.code} className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors shadow-sm select-none ${formData.allocatedSites.includes(site.code) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}>
                                    <input type="checkbox" className="hidden" checked={formData.allocatedSites.includes(site.code)} onChange={() => toggleAllocatedSite(site.code)} disabled={!canEdit} />
                                    {site.name}
                                </label>
                            ))}
                        </div>
                        {formData.allocatedSites.length === 0 && <span className="text-[10px] text-red-400 mt-2 block italic">Please select at least one site.</span>}
                    </div>

                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Service Type (India Legal) *</label>
                        <select value={formData.serviceType} onChange={onServiceTypeChange} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-indigo-300 font-bold outline-none focus:border-indigo-500">
                            {serviceTypes.map((type) => <option key={type}>{type}</option>)}
                        </select>
                    </div>

                    {formData.serviceType === 'Supply of Goods' ? (
                        <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/30">
                            <label className="text-[10px] uppercase font-bold text-indigo-400 block mb-2 tracking-widest">Type of Goods Supplied *</label>
                            <select value={formData.goodsType} onChange={onGoodsTypeChange} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none focus:border-indigo-500">
                                {goodsTypes.map((type) => <option key={type}>{type}</option>)}
                            </select>
                        </div>
                    ) : <div></div>}

                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Primary Contact Person</label>
                        <input value={formData.contactPerson} onChange={(event) => setFormData({ ...formData, contactPerson: event.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500" placeholder="Manager / Supervisor Name" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Contact Phone</label>
                        <input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500" placeholder="+91..." />
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Vendor Portal Email *</label>
                        <input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value.toLowerCase() })} disabled={!canEdit} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500" placeholder="vendor@company.com" />
                        <p className="text-[10px] text-slate-500 mt-2">This email will be used for vendor portal login. When portal access is provisioned, the vendor receives a temporary password and must change it after the first login.</p>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-950/20 p-6 rounded-2xl border border-indigo-500/30 text-sm mb-8 shadow-inner">
                <div className="text-indigo-400 font-bold uppercase tracking-widest text-[10px] mb-3"><i className="fas fa-info-circle mr-1"></i> Pre-Configured Legal Requirements</div>
                <p className="text-slate-300 leading-relaxed mb-4">Based on selecting <strong className="text-white bg-slate-900 px-2 py-1 rounded mx-1">{formData.serviceType} {formData.serviceType === 'Supply of Goods' && `(${formData.goodsType})`}</strong>, the following company compliance documents will be auto-required:</p>
                <div className="flex flex-wrap gap-2">
                    {safeArr(formData.documents).map((doc, index) => (
                        <span key={index} className="bg-slate-900 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm"><i className="fas fa-file-contract text-slate-500 mr-2"></i>{doc.name}</span>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
                {canEdit && <button type="button" onClick={onSubmit} disabled={saving} className="px-10 py-4 rounded-xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition flex items-center gap-2 uppercase tracking-widest text-sm disabled:opacity-50">{saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>} Register Company</button>}
            </div>
        </div>
    );
}
