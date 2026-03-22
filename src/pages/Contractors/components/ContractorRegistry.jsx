import React from 'react';

// Inline safe compliance calculator to prevent crashes
const getCompliance = (docs) => {
    const arr = Array.isArray(docs) ? docs : [];
    if (arr.length === 0) return { pct: 0, color: 'text-red-400' };
    const verified = arr.filter(d => d.status === 'Verified').length;
    const pct = Math.round((verified / arr.length) * 100);
    return { pct, color: pct === 100 ? 'text-emerald-400' : pct > 50 ? 'text-yellow-400' : 'text-red-400' };
};

export default function ContractorRegistry({ contractors, onView }) {
    return (
        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white uppercase tracking-widest"><i className="fas fa-building text-indigo-500 mr-2"></i> Master Vendor List</h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                        <tr>
                            <th className="p-5 pl-8">Company & ID</th>
                            <th className="p-5">Service Category</th>
                            <th className="p-5">Authorized Sites</th>
                            <th className="p-5">Compliance Score</th>
                            <th className="p-5">Workforce</th>
                            <th className="p-5 pr-8 text-right">Profile</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                        {contractors.map(c => {
                            const status = getCompliance(c.documents);
                            const siteList = Array.isArray(c.allocatedSites) ? c.allocatedSites : [];
                            const workerCount = Array.isArray(c.workers) ? c.workers.length : 0;
                            
                            return (
                                <tr key={c.firebaseKey || c.id} className="hover:bg-slate-800/40 transition-colors">
                                    <td className="p-5 pl-8">
                                        <div className="font-bold text-white">{c.companyName || 'Unknown Company'}</div>
                                        <div className="text-[10px] text-indigo-400 font-mono mt-1 font-bold">{c.vendorCode || 'NO-CODE'}</div>
                                    </td>
                                    <td className="p-5 text-xs text-slate-400 font-bold">{c.serviceType || 'General'}</td>
                                    <td className="p-5 font-mono text-[10px] text-slate-500">{siteList.join(', ') || 'None'}</td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                <div className={`h-full ${status.pct === 100 ? 'bg-emerald-500' : status.pct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${status.pct}%` }}></div>
                                            </div>
                                            <span className={`text-[10px] font-bold ${status.color}`}>{status.pct}%</span>
                                        </div>
                                    </td>
                                    <td className="p-5 font-bold text-slate-300">
                                        <i className="fas fa-users text-slate-500 mr-2"></i>{workerCount}
                                    </td>
                                    <td className="p-5 pr-8 text-right">
                                        <button onClick={() => onView(c)} className="bg-slate-800 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow">
                                            Manage Profile
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {contractors.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No vendors found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}