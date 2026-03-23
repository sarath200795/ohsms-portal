import React from 'react';

export default function RiskImportView({
    importing,
    onImport,
    onDownloadTemplate
}) {
    return (
        <div className="animate-in fade-in duration-500 max-w-6xl mx-auto">
            <div className="glass-panel p-10 rounded-3xl border border-blue-500/30 shadow-2xl text-center mb-8">
                <div className="w-24 h-24 rounded-2xl bg-blue-900/30 flex items-center justify-center text-5xl text-blue-400 mx-auto mb-6 shadow-inner border border-blue-500/20"><i className="fas fa-file-excel"></i></div>
                <h2 className="text-3xl font-bold text-white mb-4">Smart Excel Import</h2>
                <p className="text-slate-400 mb-8 max-w-xl mx-auto leading-relaxed">Upload your existing Risk Assessment spreadsheet (.xlsx, .csv). Our AI engine will read the rows, detect the hazard types, match them against the HSE framework, and pre-fill the HIRA form for you.</p>

                <div className="relative border-2 border-dashed border-blue-500/50 rounded-2xl p-12 hover:bg-blue-900/10 transition-colors cursor-pointer max-w-2xl mx-auto bg-slate-900/50 group">
                    <input type="file" accept=".xlsx, .xls, .csv" onChange={onImport} disabled={importing} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    {importing ? (
                        <div className="text-blue-400 font-bold text-xl flex items-center justify-center gap-3"><i className="fas fa-spinner fa-spin"></i> Analyzing Data...</div>
                    ) : (
                        <div>
                            <i className="fas fa-cloud-upload-alt text-5xl text-slate-500 mb-4 group-hover:text-blue-400 transition-colors"></i>
                            <div className="text-xl font-bold text-white mb-1">Drag & Drop File Here</div>
                            <div className="text-sm text-slate-500 font-medium">or click to browse your computer</div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-emerald-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2"><i className="fas fa-info-circle"></i> Standard Upload Format Required</h3>
                    <button type="button" onClick={onDownloadTemplate} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-transform active:scale-95 shadow-lg"><i className="fas fa-download"></i> Download Template</button>
                </div>
                <p className="text-sm text-slate-400 mb-6">To ensure accurate mapping, your uploaded file must contain column headers similar to the structure below. The Location should be grouped with the Activity separated by a hyphen (e.g., <span className="text-white bg-slate-800 px-2 py-0.5 rounded font-mono text-xs">Ceiling - Maintenance</span>).</p>

                <div className="overflow-x-auto custom-scroll pb-4">
                    <table className="w-full text-left text-xs text-slate-300 border border-slate-700 whitespace-nowrap bg-slate-950 rounded-xl overflow-hidden">
                        <thead className="bg-slate-900 font-bold text-slate-500 border-b border-slate-800">
                            <tr>
                                <th className="p-4 border-r border-slate-800">Activity/Sub activity/ Equipment</th>
                                <th className="p-4 border-r border-slate-800">Potential Hazards</th>
                                <th className="p-4 border-r border-slate-800">Consequences (Who)</th>
                                <th className="p-4 border-r border-slate-800">Current Controls (EC, AC, PPE)</th>
                                <th className="p-4 border-r border-slate-800 text-center">PR</th>
                                <th className="p-4 border-r border-slate-800 text-center">S</th>
                                <th className="p-4 border-r border-slate-800">Additional Controls</th>
                                <th className="p-4 border-r border-slate-800 text-center">Res. PR</th>
                                <th className="p-4 border-r border-slate-800 text-center">Res. S</th>
                                <th className="p-4">Remarks/Owner</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="hover:bg-slate-900/50 transition-colors">
                                <td className="p-4 border-r border-slate-800 text-white font-bold">Ceiling - Maintenance of Fans</td>
                                <td className="p-4 border-r border-slate-800">Physical / Fall from Height</td>
                                <td className="p-4 border-r border-slate-800">Harm to Technicians</td>
                                <td className="p-4 border-r border-slate-800">Ladder (Administrative Controls)</td>
                                <td className="p-4 border-r border-slate-800 text-center text-red-400 font-bold bg-red-950/20">4</td>
                                <td className="p-4 border-r border-slate-800 text-center text-red-400 font-bold bg-red-950/20">4</td>
                                <td className="p-4 border-r border-slate-800">A-frame ladders; Buddy system.</td>
                                <td className="p-4 border-r border-slate-800 text-center text-emerald-400 font-bold bg-emerald-950/20">1</td>
                                <td className="p-4 border-r border-slate-800 text-center text-emerald-400 font-bold bg-emerald-950/20">4</td>
                                <td className="p-4 text-slate-400 font-mono text-[10px]">Owner: Facility Manager</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
