import React, { useState } from 'react';
import { ref, update } from 'firebase/database';
import { rtdb } from '../../../config/firebase';

export default function ContractorViewer({ contractor, session, onCancel }) {
    const [subTab, setSubTab] = useState('profile'); // 'profile', 'documents', 'employees'
    
    // Employee Module Routing
    const [workerMode, setWorkerMode] = useState('list'); // 'list', 'add', 'profile'
    const [selectedWorker, setSelectedWorker] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [workerForm, setWorkerForm] = useState({
        name: '', idNumber: '', trade: 'General Worker', gatePassExpiry: '', bloodGroup: '', contact: ''
    });

    // Bulletproof Arrays to prevent WSoD crashes
    const workers = Array.isArray(contractor?.workers) ? contractor.workers : [];
    const docs = Array.isArray(contractor?.documents) ? contractor.documents : [];
    const allocatedSites = Array.isArray(contractor?.allocatedSites) ? contractor.allocatedSites : [];

    // --- FIREBASE EMPLOYEE LOGIC ---
    const handleAddWorker = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // Need firebaseKey to update! Fallback to id if necessary
            const dbKey = contractor.firebaseKey || contractor.id; 
            if (!dbKey) throw new Error("Contractor Database Key Missing");

            const newWorker = {
                ...workerForm,
                id: `EMP-${Math.floor(Date.now() / 1000)}`,
                addedAt: new Date().toISOString(),
                addedBy: session?.name || 'Admin',
                status: 'Active'
            };

            const updatedWorkers = [...workers, newWorker];

            await update(ref(rtdb, `organizations/${session.orgId}/contractors/${dbKey}`), {
                workers: updatedWorkers
            });

            // Update local state temporarily so UI reflects change immediately
            contractor.workers = updatedWorkers;
            
            alert(`${workerForm.name} added successfully!`);
            setWorkerForm({ name: '', idNumber: '', trade: 'General Worker', gatePassExpiry: '', bloodGroup: '', contact: '' });
            setWorkerMode('list'); 
        } catch (error) {
            console.error("Failed to add worker:", error);
            alert("Database Error: Could not add employee.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Card */}
            <div className="flex justify-between items-center mb-6 bg-slate-900/80 p-6 rounded-3xl border border-slate-700 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg bg-indigo-900/50 text-indigo-400 border border-indigo-500/30">
                        <i className="fas fa-hard-hat"></i>
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-wide">{contractor.companyName}</h2>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm bg-slate-800 text-slate-300 border-slate-600 font-mono">{contractor.vendorCode}</span>
                    </div>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-colors border border-slate-700 hover:bg-slate-800">
                    <i className="fas fa-arrow-left mr-1"></i> Back to Registry
                </button>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex gap-4 mb-8 border-b border-slate-800 pb-2">
                <button onClick={() => { setSubTab('profile'); setWorkerMode('list'); }} className={`pb-3 text-sm font-bold uppercase tracking-widest transition-colors ${subTab === 'profile' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><i className="fas fa-info-circle mr-2"></i> Company Profile</button>
                <button onClick={() => { setSubTab('documents'); setWorkerMode('list'); }} className={`pb-3 text-sm font-bold uppercase tracking-widest transition-colors ${subTab === 'documents' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><i className="fas fa-file-contract mr-2"></i> Documents ({docs.length})</button>
                <button onClick={() => setSubTab('employees')} className={`pb-3 text-sm font-bold uppercase tracking-widest transition-colors ${subTab === 'employees' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}><i className="fas fa-users mr-2"></i> Employees ({workers.length})</button>
            </div>

            {/* TAB: COMPANY PROFILE */}
            {subTab === 'profile' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900/60 p-8 rounded-3xl shadow-xl border border-slate-700 space-y-6">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">General Information</h3>
                        <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Service Category</span><span className="text-white font-bold">{contractor.serviceType}</span></div>
                        <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Primary Contact</span><span className="text-white font-bold">{contractor.contactPerson || 'Not provided'}</span></div>
                        <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Registered By</span><span className="text-slate-300 text-sm">{contractor.registeredBy || 'Admin'} on {contractor.registeredAt ? new Date(contractor.registeredAt).toLocaleDateString() : 'Unknown'}</span></div>
                    </div>
                    <div className="bg-slate-900/60 p-8 rounded-3xl shadow-xl border border-slate-700">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-6">Authorized Sites</h3>
                        <div className="flex flex-wrap gap-2">
                            {allocatedSites.map(site => (
                                <span key={site} className="bg-indigo-900/30 text-indigo-300 px-4 py-2 rounded-xl border border-indigo-500/30 text-sm font-bold"><i className="fas fa-map-marker-alt mr-2"></i> {site}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: DOCUMENTS (Read Only View) */}
            {subTab === 'documents' && (
                <div className="bg-slate-900/60 p-8 rounded-3xl shadow-xl border border-slate-700">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-800 pb-4">Compliance Documents</h3>
                    <div className="space-y-4">
                        {docs.length === 0 ? <p className="text-slate-500 italic">No documents uploaded.</p> : docs.map((doc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                                <div className="flex items-center gap-4">
                                    <i className="fas fa-file-pdf text-2xl text-slate-500"></i>
                                    <div><p className="text-white font-bold text-sm">{doc.name || doc.type}</p></div>
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border bg-slate-800 text-slate-500 border-slate-700">{doc.status || 'Pending'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB: EMPLOYEES / WORKERS */}
            {subTab === 'employees' && (
                <div className="bg-slate-900/60 p-8 rounded-3xl shadow-xl border border-slate-700">
                    
                    {/* VIEW 1: WORKER TABLE */}
                    {workerMode === 'list' && (
                        <div className="animate-in fade-in">
                            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Onboarded Workforce</h3>
                                <button onClick={() => setWorkerMode('add')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-lg flex items-center gap-2">
                                    <i className="fas fa-user-plus"></i> Add Worker
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                                        <tr><th className="p-4 pl-6">Worker Name & ID</th><th className="p-4">Trade / Role</th><th className="p-4">Gate Pass Expiry</th><th className="p-4 pr-6 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                                        {workers.map((w, idx) => (
                                            <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-4 pl-6">
                                                    <div className="font-bold text-white">{w.name}</div>
                                                    <div className="text-[10px] font-mono text-slate-500 mt-1">{w.idNumber || 'No ID'}</div>
                                                </td>
                                                <td className="p-4"><span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-700">{w.trade || 'Worker'}</span></td>
                                                <td className="p-4 font-mono text-xs text-slate-300">{w.gatePassExpiry || 'N/A'}</td>
                                                <td className="p-4 pr-6 text-right">
                                                    <button onClick={() => { setSelectedWorker(w); setWorkerMode('profile'); }} className="bg-slate-800 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow">Profile</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {workers.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-slate-500 italic border-b border-slate-800">No employees registered yet.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* VIEW 2: ADD NEW WORKER FORM */}
                    {workerMode === 'add' && (
                        <div className="animate-in fade-in slide-in-from-right-4">
                            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                                <h3 className="text-lg font-bold text-white"><i className="fas fa-user-plus text-indigo-400 mr-2"></i> Onboard New Worker</h3>
                                <button onClick={() => setWorkerMode('list')} className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest"><i className="fas fa-times mr-1"></i> Cancel</button>
                            </div>
                            <form onSubmit={handleAddWorker} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Full Name *</label><input type="text" required value={workerForm.name} onChange={e => setWorkerForm({...workerForm, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-indigo-500" /></div>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Govt ID Number *</label><input type="text" required value={workerForm.idNumber} onChange={e => setWorkerForm({...workerForm, idNumber: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-indigo-500 font-mono" /></div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Trade / Profession</label>
                                        <select value={workerForm.trade} onChange={e => setWorkerForm({...workerForm, trade: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-indigo-500 font-bold">
                                            <option value="General Worker">General Worker / Helper</option>
                                            <option value="Electrician">Electrician</option>
                                            <option value="Welder">Welder / Fitter</option>
                                            <option value="Supervisor">Supervisor</option>
                                        </select>
                                    </div>
                                    <div><label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">Gate Pass Expiry *</label><input type="date" required value={workerForm.gatePassExpiry} onChange={e => setWorkerForm({...workerForm, gatePassExpiry: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-indigo-500" /></div>
                                </div>
                                <div className="text-right border-t border-slate-800 pt-6">
                                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest flex items-center gap-2 ml-auto">
                                        {isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save Profile
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* VIEW 3: DETAILED EMPLOYEE PROFILE */}
                    {workerMode === 'profile' && selectedWorker && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-start mb-6 border-b border-slate-800 pb-6">
                                <div className="flex items-center gap-6">
                                    <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-3xl text-slate-500 shadow-inner overflow-hidden"><i className="fas fa-user"></i></div>
                                    <div>
                                        <h2 className="text-3xl font-bold text-white mb-2">{selectedWorker.name}</h2>
                                        <span className="bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded text-xs font-bold uppercase tracking-widest">{selectedWorker.trade || 'Worker'}</span>
                                    </div>
                                </div>
                                <button onClick={() => setWorkerMode('list')} className="text-slate-400 hover:text-white bg-slate-900 border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"><i className="fas fa-arrow-left mr-1"></i> Back to List</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2"><i className="fas fa-id-card mr-2"></i> Identity</h4>
                                    <div><span className="text-[10px] uppercase font-bold text-slate-500 block">System ID</span><span className="text-white font-mono">{selectedWorker.id || 'N/A'}</span></div>
                                    <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Govt ID</span><span className="text-white font-mono">{selectedWorker.idNumber || 'Not Provided'}</span></div>
                                </div>
                                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2"><i className="fas fa-shield-alt mr-2"></i> Safety & Access</h4>
                                    <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Gate Pass Expiry</span><span className="text-emerald-400 font-mono font-bold">{selectedWorker.gatePassExpiry || 'N/A'}</span></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}