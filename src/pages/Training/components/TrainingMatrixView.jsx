import React from 'react';
import { safeArr } from '../utils';

export default function TrainingMatrixView({
    isGlobalUser,
    visibleSites,
    matrixSiteFilter,
    onMatrixSiteChange,
    matrixContractorFilter,
    onMatrixContractorChange,
    contractors,
    searchTerm,
    onSearchChange,
    filterRef,
    isFilterOpen,
    onToggleFilterOpen,
    selectAllTopics,
    clearAllTopics,
    uniqueTopics,
    hiddenTopics,
    toggleTopicFilter,
    downloadMatrix,
    displayedTopics,
    allMatrixRows,
    getMatrixCell
}) {
    return (
        <div className="glass-panel rounded-3xl animate-in fade-in duration-500 border border-slate-700 shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="p-6 border-b border-slate-700 flex flex-wrap justify-between items-center gap-4 bg-slate-900/50 flex-shrink-0">
                <h3 className="text-2xl font-bold text-white flex items-center"><i className="fas fa-th mr-3 text-blue-400"></i> Competency Matrix</h3>
                <div className="flex gap-3 items-center flex-wrap">
                    <div className="relative">
                        <i className="fas fa-map-marker-alt absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500"></i>
                        <select value={matrixSiteFilter} onChange={onMatrixSiteChange} className="bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-white outline-none focus:border-blue-500 appearance-none shadow-inner w-40">
                            {(isGlobalUser || visibleSites.length > 1) && <option value="All">All Sites</option>}
                            {visibleSites.map((site) => <option key={site.code} value={site.code}>{site.name}</option>)}
                        </select>
                    </div>

                    <div className="relative">
                        <i className="fas fa-hard-hat absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500"></i>
                        <select value={matrixContractorFilter} onChange={(e) => onMatrixContractorChange(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-purple-300 outline-none focus:border-purple-500 appearance-none shadow-inner w-52 truncate">
                            <option value="All">All Personnel (Int & Ext)</option>
                            <option value="Internal">Internal Employees Only</option>
                            {contractors.filter((contractor) => matrixSiteFilter === 'All' || safeArr(contractor.allocatedSites).includes(matrixSiteFilter) || contractor.siteId === 'GLOBAL').map((contractor) => (
                                <option key={contractor.firebaseKey} value={contractor.firebaseKey}>{contractor.companyName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="relative group">
                        <i className="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors"></i>
                        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white outline-none focus:border-blue-500 shadow-inner w-40 transition-colors" />
                    </div>

                    <div ref={filterRef} className="relative">
                        <button type="button" onClick={onToggleFilterOpen} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-600 shadow-lg transition-colors">
                            <i className="fas fa-filter text-blue-400"></i> Columns
                        </button>
                        {isFilterOpen && (
                            <div className="absolute right-0 top-12 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 z-50">
                                <div className="flex justify-between mb-4 border-b border-slate-800 pb-3">
                                    <button type="button" onClick={selectAllTopics} className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest transition-colors">Select All</button>
                                    <button type="button" onClick={clearAllTopics} className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest transition-colors">Clear All</button>
                                </div>
                                <div className="space-y-3 max-h-60 overflow-y-auto custom-scroll pr-2">
                                    {uniqueTopics.map((topic) => (
                                        <label key={topic} className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-2 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                                            <input type="checkbox" className="w-4 h-4 accent-blue-500 cursor-pointer" checked={!hiddenTopics.includes(topic)} onChange={() => toggleTopicFilter(topic)} />
                                            <span className="text-xs font-medium text-white">{topic}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button type="button" onClick={downloadMatrix} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"><i className="fas fa-file-excel"></i> Export</button>
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scroll bg-slate-950/50">
                <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap min-w-max">
                    <thead className="bg-slate-950/90 backdrop-blur-md text-[10px] font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-20 shadow-md">
                        <tr>
                            <th className="p-5 sticky left-0 bg-slate-950 border-r border-b border-slate-800 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.5)] min-w-[200px]">Name / Role</th>
                            {displayedTopics.map((topic) => <th key={topic} className="p-5 text-center border-r border-b border-slate-800 min-w-[150px] text-blue-300">{topic}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                        {allMatrixRows.map((row) => (
                            <tr key={row.id || row.name} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-4 bg-slate-900/90 shadow-[2px_0_5px_rgba(0,0,0,0.5)] z-10 border-r border-slate-800 sticky left-0 group-hover:bg-slate-800/90 transition-colors">
                                    <div className="font-bold text-white text-sm">
                                        {row.name}
                                        {row.type === 'Contractor' && <span className="text-[8px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded ml-2 font-bold border border-purple-500/50 uppercase tracking-widest" title={row.companyName}>EXT</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider truncate max-w-[200px]">{row.role}</div>
                                </td>
                                {displayedTopics.map((topic) => {
                                    const cell = getMatrixCell(row.name, row.role, topic);
                                    return (
                                        <td key={topic} className="p-3 text-center border-r border-slate-800/50 relative group hover:bg-slate-800/80 transition-colors">
                                            <div className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border ${cell.color} w-full text-center shadow-sm tracking-wider uppercase`}>{cell.status}</div>
                                            {cell.status !== 'Not Trained' && cell.status !== 'N/A' && (
                                                <div className="text-[9px] text-slate-400 mt-2 flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity font-mono">
                                                    <span>Done: {cell.dateGiven}</span>
                                                    <span className={`font-bold ${cell.status === 'Expired' ? 'text-red-400' : cell.status === 'Expiring Soon' ? 'text-yellow-400' : 'text-emerald-400'}`}>Exp: {cell.dateExpires}</span>
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {allMatrixRows.length === 0 && <tr><td colSpan={displayedTopics.length + 1} className="p-10 text-center italic text-slate-500 text-base">No personnel found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
