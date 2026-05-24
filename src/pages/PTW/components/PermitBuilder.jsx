import React, { useState } from 'react';
import { dbPush, dbUpdate } from '../../../services/db/index.js';
import { PERMIT_TYPES, CHECKLIST_ITEMS } from '../../../utils/constants';

export default function PermitBuilder({ session, sites, contractors, onCancel, onSuccess }) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        permitType: 'GEN',
        siteId: sites?.length === 1 ? sites[0].code : '',
        location: '',
        contractorId: 'INTERNAL',
        workDescription: '',
        validFromDate: new Date().toISOString().split('T')[0],
        checklist: {},
        status: 'Pending'
    });

    const handleChecklistToggle = (item) => {
        setFormData(prev => ({ ...prev, checklist: { ...prev.checklist, [item]: !prev.checklist[item] } }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.siteId || !formData.workDescription) return alert("Please fill in all required fields.");

        setIsSubmitting(true);
        try {
            const permitId = `PTW-${formData.permitType}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`;
            const payload = { ...formData, id: permitId, createdBy: session.name || session.email, createdAt: new Date().toISOString() };

            const newId = await dbPush(`organizations/${session.orgId}/ptwRecords`, payload);

            alert(`Permit ${permitId} submitted successfully!`);
            onSuccess();
        } catch (error) {
            console.error("Submission failed:", error);
            alert("Failed to submit permit.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const activeChecklist = CHECKLIST_ITEMS[formData.permitType] || CHECKLIST_ITEMS['GEN'];
    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-1"><i className="fas fa-clipboard-check text-emerald-400 mr-3"></i> Create New Permit</h2>
                    <p className="text-sm text-slate-400 ml-10">Define work scope and verify safety protocols.</p>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors border border-slate-700 hover:bg-slate-800"><i className="fas fa-times mr-2"></i> Cancel</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="bg-slate-900/60 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-t-4 border-emerald-500">
                    <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-700 pb-2">1. Scope of Work</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Permit Type</label>
                            <select value={formData.permitType} onChange={e => setFormData({ ...formData, permitType: e.target.value, checklist: {} })} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none font-bold">
                                {PERMIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Executing Agency</label>
                            <select value={formData.contractorId} onChange={e => setFormData({ ...formData, contractorId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-emerald-500">
                                <option value="INTERNAL">Internal Maintenance Team</option>
                                {(contractors || []).map(c => <option key={c.firebaseKey} value={c.firebaseKey}>{c.companyName}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Site / Facility</label>
                            <select value={formData.siteId} onChange={e => setFormData({ ...formData, siteId: e.target.value })} required className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-emerald-500">
                                <option value="">Select Site...</option>
                                {(sites || []).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Specific Location</label>
                            <input type="text" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Boiler Room B" required className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-emerald-500" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Work Description</label>
                            <textarea value={formData.workDescription} onChange={e => setFormData({ ...formData, workDescription: e.target.value })} rows="3" placeholder="Detailed description of the task..." required className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-emerald-500 resize-none"></textarea>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-700">
                    <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-700 pb-2">2. Safety Pre-Requisites</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeChecklist.map((item, idx) => (
                            <div key={idx} onClick={() => handleChecklistToggle(item)} className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-4 ${formData.checklist[item] ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-slate-950/50 border-slate-800 hover:border-slate-600'}`}>
                                <div className={`w-6 h-6 rounded flex items-center justify-center border transition-colors ${formData.checklist[item] ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-slate-900 border-slate-700 text-transparent'}`}><i className="fas fa-check text-xs"></i></div>
                                <span className={`text-sm font-medium ${formData.checklist[item] ? 'text-white' : 'text-slate-400'}`}>{item}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-right">
                    <button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest flex items-center gap-3 ml-auto">
                        {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>} Submit Permit
                    </button>
                </div>
            </form>
        </div>
    );
}
