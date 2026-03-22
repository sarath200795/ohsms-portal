// src/pages/Incidents/components/IncidentBuilder.jsx
import React, { useState } from 'react';
import { ref, push, update } from 'firebase/database';
import { rtdb } from '../../../config/firebase';

const INCIDENT_TYPES = [
    { id: 'Near Miss', label: 'Near Miss (No Injury)', color: 'text-yellow-400' },
    { id: 'First Aid', label: 'First Aid Case (FAC)', color: 'text-emerald-400' },
    { id: 'MTI', label: 'Medical Treatment (MTI)', color: 'text-orange-400' },
    { id: 'LTI', label: 'Lost Time Injury (LTI)', color: 'text-red-400' },
    { id: 'Property Damage', label: 'Property / Env Damage', color: 'text-blue-400' }
];

export default function IncidentBuilder({ session, sites, onCancel, onSuccess }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        title: '',
        type: 'Near Miss',
        siteId: sites.length === 1 ? sites[0].code : '',
        location: '',
        date: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
        description: '',
        immediateAction: '',
        status: 'Open'
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.siteId || !formData.title || !formData.description) return alert("Please fill in all required fields.");
        
        setIsSubmitting(true);
        try {
            // Generate a readable ID (e.g., INC-LTI-17042391)
            const incidentId = `INC-${formData.type === 'Near Miss' ? 'NM' : formData.type}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`;
            
            const payload = {
                ...formData,
                id: incidentId,
                reportedBy: session.name || session.email,
                reportedAt: new Date().toISOString(),
            };

            const newRef = push(ref(rtdb, `organizations/${session.orgId}/incidents`));
            await update(newRef, payload);
            
            alert(`Incident ${incidentId} logged successfully!`);
            onSuccess(); // Return to registry view
        } catch (error) {
            console.error("Submission failed:", error);
            alert("Failed to report incident.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-1">
                        <i className="fas fa-file-medical text-red-500 mr-3"></i> Report New Incident
                    </h2>
                    <p className="text-sm text-slate-400 ml-10">Capture initial details for safety investigation.</p>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors border border-slate-700 hover:bg-slate-800">
                    <i className="fas fa-times mr-2"></i> Cancel
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="bg-slate-900/60 backdrop-blur-md p-8 rounded-3xl shadow-2xl border-t-4 border-red-500">
                    <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-700 pb-2">1. Incident Classification</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Incident Title</label>
                            <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="e.g. Worker slipped on wet floor near Boiler" required className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-red-500 text-lg font-bold" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Classification Type</label>
                            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none font-bold focus:border-red-500">
                                {INCIDENT_TYPES.map(t => <option key={t.id} value={t.id} className={t.color}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Date & Time of Occurrence</label>
                            <input type="datetime-local" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-red-500 custom-calendar-icon" />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/60 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-700">
                    <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-widest border-b border-slate-700 pb-2">2. Location & Description</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Site / Facility</label>
                            <select value={formData.siteId} onChange={e => setFormData({...formData, siteId: e.target.value})} required className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-red-500">
                                <option value="">Select Site...</option>
                                {sites.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Specific Location</label>
                            <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="e.g. Loading Bay 3" required className="w-full bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-white outline-none focus:border-red-500" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Detailed Description</label>
                            <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows="4" placeholder="What happened? Who was involved? What was the outcome?" required className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-red-500 resize-none"></textarea>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest">Immediate Actions Taken</label>
                            <textarea value={formData.immediateAction} onChange={e => setFormData({...formData, immediateAction: e.target.value})} rows="2" placeholder="e.g. First aid administered, area barricaded..." className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-red-500 resize-none"></textarea>
                        </div>
                    </div>
                </div>

                <div className="text-right">
                    <button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold px-10 py-4 rounded-xl shadow-lg shadow-red-900/50 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest flex items-center gap-3 ml-auto">
                        {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-exclamation-triangle"></i>}
                        {isSubmitting ? 'Logging...' : 'Log Incident Record'}
                    </button>
                </div>
            </form>
        </div>
    );
}