// src/pages/Incidents/components/IncidentRegistry.jsx
import React from 'react';

export default function IncidentRegistry({ incidents }) {
    return (
        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white uppercase tracking-widest"><i className="fas fa-list text-red-500 mr-2"></i> Master Incident Log</h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800 tracking-widest">
                        <tr>
                            <th className="p-5 pl-8">Incident Details</th>
                            <th className="p-5">Classification</th>
                            <th className="p-5">Location / Site</th>
                            <th className="p-5">Date & Time</th>
                            <th className="p-5">Status</th>
                            <th className="p-5 pr-8 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                        {incidents.map(inc => (
                            <tr key={inc.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-5 pl-8">
                                    <div className="font-bold text-white">{inc.title || 'Untitled Incident'}</div>
                                    <div className="text-[10px] font-mono text-slate-500 mt-1">{inc.id || inc.firebaseKey}</div>
                                </td>
                                <td className="p-5">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border shadow-sm ${
                                        ['LTI', 'Fatality'].includes(inc.type) ? 'bg-red-900/30 text-red-400 border-red-500/30' :
                                        inc.type === 'Near Miss' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' :
                                        'bg-orange-900/30 text-orange-400 border-orange-500/30'
                                    }`}>{inc.type || inc.incidentType || 'Unclassified'}</span>
                                </td>
                                <td className="p-5">
                                    <div className="font-bold text-slate-300">{inc.siteId}</div>
                                </td>
                                <td className="p-5 font-mono text-xs">
                                    {inc.date || inc.incidentDate || 'Unknown'}
                                </td>
                                <td className="p-5">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${inc.status === 'Closed' ? 'text-emerald-400' : 'text-orange-400'}`}>
                                        {inc.status || 'Open'}
                                    </span>
                                </td>
                                <td className="p-5 pr-8 text-right">
                                    <button className="bg-slate-800 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors shadow">Investigate</button>
                                </td>
                            </tr>
                        ))}
                        {incidents.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No incidents match your search criteria.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}