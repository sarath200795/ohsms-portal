import React from 'react';
import { getTypeConfig } from '../../../utils/constants';

export default function PtwRegistry({ permits, onView }) {
    return (
        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white uppercase tracking-widest"><i className="fas fa-list text-emerald-500 mr-2"></i> Active Permit Registry</h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                        <tr>
                            <th className="p-5 pl-8">Permit ID & Type</th>
                            <th className="p-5">Location / Site</th>
                            <th className="p-5">Contractor</th>
                            <th className="p-5">Validity</th>
                            <th className="p-5">Status</th>
                            <th className="p-5 pr-8 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                        {permits.map(p => {
                            const tConfig = getTypeConfig(p.permitType || p.typeId);
                            return (
                                <tr key={p.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                    <td className="p-5 pl-8">
                                        <div className="font-bold text-white font-mono">{p.id || p.firebaseKey}</div>
                                        <div className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${tConfig.color}`}>{tConfig.label}</div>
                                    </td>
                                    <td className="p-5">
                                        <div className="font-bold text-slate-300">{p.location}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-1">{p.siteId}</div>
                                    </td>
                                    <td className="p-5">
                                        <div className="font-bold text-slate-300">{p.contractorName || (p.contractorId === 'INTERNAL' ? 'Internal Team' : p.contractorId)}</div>
                                    </td>
                                    <td className="p-5 font-mono text-xs">
                                        {p.validFromDate ? p.validFromDate.split('T')[0] : 'N/A'}
                                    </td>
                                    <td className="p-5">
                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${p.status === 'Closed' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' :
                                                p.status === 'Pending' ? 'bg-orange-900/30 text-orange-400 border-orange-500/30' :
                                                    'bg-blue-900/30 text-blue-400 border-blue-500/30'
                                            }`}>{p.status}</span>
                                    </td>
                                    <td className="p-5 pr-8 text-right">
                                        {/* THIS IS THE FIX: The button now triggers the onView prop! */}
                                        <button onClick={() => onView(p)} className="bg-slate-800 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow">
                                            View / Audit
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {permits.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No permits found matching your criteria.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}