import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function ContractorRegistry({ contractors, getComplianceStatus, onViewProfile }) {
    return (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-x-auto shadow-xl">
            <table className="w-full text-left text-sm min-w-[1000px]">
                <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                    <tr>
                        <th className="p-4 pl-6">Vendor Company</th>
                        <th className="p-4">Service Type</th>
                        <th className="p-4">Compliance Score</th>
                        <th className="p-4 text-center">Employees</th>
                        <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                    {contractors.map((contractor) => {
                        const docsArr = safeArr(contractor.documents);
                        const statusObj = getComplianceStatus(docsArr);

                        return (
                            <tr key={contractor.firebaseKey} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-4 pl-6">
                                    <div className="font-bold text-white text-base">{contractor.companyName || 'Unnamed Vendor'}</div>
                                    {contractor.vendorCode && <div className="text-[10px] font-mono text-emerald-400 bg-emerald-900/20 border border-emerald-500/30 px-2 py-0.5 rounded inline-block mt-1 mb-1">ID: {contractor.vendorCode}</div>}
                                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">
                                        <i className="fas fa-map-marker-alt mr-1"></i> {safeArr(contractor.allocatedSites).join(', ') || 'None'} | <i className="fas fa-user ml-2 mr-1"></i> {contractor.contactPerson || 'N/A'}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="font-medium text-slate-400">{contractor.serviceType}</div>
                                    {contractor.serviceType === 'Supply of Goods' && <div className="text-[9px] text-indigo-400 uppercase tracking-widest mt-1">[{contractor.goodsType}]</div>}
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[10px] border-2 ${statusObj.pct === 100 ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30' : statusObj.pct > 50 ? 'border-yellow-500 text-yellow-400 bg-yellow-950/30' : 'border-red-500 text-red-400 bg-red-950/30'}`}>
                                            {statusObj.pct}%
                                        </div>
                                        <div>
                                            <div className={`text-[10px] font-bold uppercase tracking-widest ${statusObj.color.split(' ')[0]}`}>{statusObj.label}</div>
                                            <div className="text-xs font-mono text-slate-500">{docsArr.filter((doc) => doc.file || doc.status === 'Uploaded').length} / {docsArr.length} Docs Verified</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="font-mono font-bold bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-indigo-300">{safeArr(contractor.workers).length}</span>
                                </td>
                                <td className="p-4 pr-6 text-right">
                                    <button type="button" onClick={() => onViewProfile(contractor)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-transform active:scale-95 shadow-lg shadow-indigo-600/20"><i className="fas fa-id-card mr-1"></i> View Profile</button>
                                </td>
                            </tr>
                        );
                    })}
                    {contractors.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-500 italic">No vendors found. Please register one.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}
