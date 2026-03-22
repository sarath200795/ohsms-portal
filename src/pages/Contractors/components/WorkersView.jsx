import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function WorkersView({
    allWorkers,
    canEdit,
    contractors,
    onAddWorker,
    onViewWorker,
    setWorkerCompanyFilter,
    workerCompanyFilter
}) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-xl border border-slate-800 shadow-inner">
                    <i className="fas fa-filter text-slate-500 ml-2"></i>
                    <select value={workerCompanyFilter} onChange={(event) => setWorkerCompanyFilter(event.target.value)} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg outline-none w-64 shadow-inner">
                        <option value="All">Filter by Company (All)</option>
                        {contractors.map((contractor) => <option key={contractor.firebaseKey} value={contractor.firebaseKey}>{contractor.companyName}</option>)}
                    </select>
                </div>
                {canEdit && <button type="button" onClick={onAddWorker} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"><i className="fas fa-user-plus mr-2"></i> Register Worker</button>}
            </div>

            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-x-auto shadow-xl">
                <table className="w-full text-left text-sm min-w-[1000px]">
                    <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-widest font-bold text-slate-500">
                        <tr>
                            <th className="p-4 pl-6">Worker Details</th>
                            <th className="p-4">Company</th>
                            <th className="p-4">Docs Status</th>
                            <th className="p-4 text-center">Trainings</th>
                            <th className="p-4 text-center">Injuries</th>
                            <th className="p-4 pr-6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                        {allWorkers.map((worker, index) => (
                            <tr key={worker.id || index} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-4 pl-6">
                                    <div className="font-bold text-white text-base">{worker.name}</div>
                                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">{worker.role} | <span className="text-blue-300">{worker.competence}</span></div>
                                </td>
                                <td className="p-4 font-medium text-slate-400">{worker.companyName}</td>
                                <td className="p-4">
                                    <div className="flex flex-col gap-1">
                                        {worker.medDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 w-fit uppercase font-bold"><i className="fas fa-check"></i> Med Fit</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-2 py-0.5 rounded border border-red-500/30 w-fit uppercase font-bold"><i className="fas fa-times"></i> Med Fit</span>}
                                        {worker.compDoc ? <span className="text-[8px] bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 w-fit uppercase font-bold"><i className="fas fa-check"></i> Comp. Doc</span> : <span className="text-[8px] bg-red-900/30 text-red-400 px-2 py-0.5 rounded border border-red-500/30 w-fit uppercase font-bold"><i className="fas fa-times"></i> Comp. Doc</span>}
                                    </div>
                                </td>
                                <td className="p-4 text-center font-mono font-bold text-blue-400">{safeArr(worker.trainingsList).length}</td>
                                <td className="p-4 text-center font-mono font-bold text-red-400">{safeArr(worker.injuriesList).length}</td>
                                <td className="p-4 pr-6 text-right">
                                    <button type="button" onClick={() => onViewWorker(worker)} className="bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-400 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"><i className="fas fa-user-circle mr-1"></i> View Profile</button>
                                </td>
                            </tr>
                        ))}
                        {allWorkers.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-500 italic">No workers found. Register a worker to get started.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
