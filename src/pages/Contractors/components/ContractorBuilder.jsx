import React, { useState } from 'react';
import { ref, push, update } from 'firebase/database';
import { rtdb } from '../../../config/firebase';
import { SERVICE_TYPES } from '../../../utils/constants';

export default function ContractorBuilder({ session, sites, onCancel, onSuccess }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        companyName: '',
        vendorCode: '',
        contactPerson: '',
        email: '',
        phone: '',
        serviceType: 'General / Housekeeping',
        allocatedSites: sites.length === 1 ? [sites[0].code] : [],
        status: 'Active'
    });

    const handleSiteToggle = (siteCode) => {
        setFormData(prev => ({
            ...prev,
            allocatedSites: prev.allocatedSites.includes(siteCode) 
                ? prev.allocatedSites.filter(s => s !== siteCode)
                : [...prev.allocatedSites, siteCode]
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.companyName || formData.allocatedSites.length === 0) return alert("Company Name and at least one Site are required.");
        
        setIsSubmitting(true);
        try {
            const finalVendorCode = formData.vendorCode || `VEN-${Math.floor(Date.now() / 1000).toString().slice(-5)}`;
            
            const payload = {
                ...formData,
                vendorCode: finalVendorCode,
                documents: [], // Empty docs array to start
                workers: [], // Empty workers array to start
                registeredBy: session.name || session.email,
                registeredAt: new Date().toISOString(),
            };

            const newRef = push(ref(rtdb, `organizations/${session.orgId}/contractors`));
            await update(newRef, payload);
            
            alert(`Vendor registered successfully!`);
            onSuccess();
        } catch (error) {
            console.error("Registration failed:", error);
            alert("Failed to register vendor.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Ensure SERVICE_TYPES exists as a fallback to prevent map crash
    const safeServiceTypes = Array.isArray(SERVICE_TYPES) ? SERVICE_TYPES : ['General / Housekeeping', 'Electrical Services', 'Mechanical Maintenance', 'Construction', 'Other'];

    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-1"><i className="fas fa-building text-indigo-400 mr-3"></i> Register New Contractor</h2>
                    <p className="text-sm text-slate-400 ml-10">Onboard a vendor and generate their profile.</p>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors border border-slate-700 hover:bg-slate-800"><i className="fas fa-times mr-2"></i> Cancel</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="bg-slate-900/60 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-t-4 border-indigo-500">
                    <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-700 pb-2">Company Profile</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Company Name</label>
                            <input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} required className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-indigo-500" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Vendor Code</label>
                            <input type="text" value={formData.vendorCode} onChange={e => setFormData({...formData, vendorCode: e.target.value})} placeholder="Auto-generates if blank" className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-indigo-500 font-mono" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Service Category</label>
                            <select value={formData.serviceType} onChange={e => setFormData({...formData, serviceType: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none font-bold focus:border-indigo-500">
                                {safeServiceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Primary Contact Person</label>
                            <input type="text" value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-indigo-500" />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-700">
                    <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-700 pb-2">Site Allocation</h3>
                    <div className="flex flex-wrap gap-3">
                        {sites.map(site => (
                            <div key={site.code} onClick={() => handleSiteToggle(site.code)} className={`px-4 py-3 rounded-xl border cursor-pointer font-bold text-sm transition-colors flex items-center gap-3 ${formData.allocatedSites.includes(site.code) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                                <i className={`fas ${formData.allocatedSites.includes(site.code) ? 'fa-check-circle' : 'fa-circle text-slate-700'}`}></i> {site.name}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-right">
                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 text-sm uppercase tracking-widest">
                        {isSubmitting ? 'Registering...' : 'Register Contractor'}
                    </button>
                </div>
            </form>
        </div>
    );
}