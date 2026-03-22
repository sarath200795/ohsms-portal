import React from 'react';

export default function IncidentHazardMatchesModal({ matchedHazards, onClose, onSelect }) {
    return (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300 no-print">
            <div className="bg-slate-900 rounded-3xl max-w-4xl w-full p-8 border border-slate-700 max-h-[85vh] overflow-y-auto custom-scroll shadow-2xl flex flex-col">
                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-6 flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-blue-400 flex items-center gap-3"><i className="fas fa-search-location"></i> Relevant HIRA Matches</h2>
                        <p className="text-xs text-slate-400 mt-2">The AI scanned active Risk Assessments matching keywords in your incident description.</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 w-10 h-10 flex items-center justify-center rounded-xl transition"><i className="fas fa-times text-xl"></i></button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {matchedHazards.length === 0 ? (
                        <div className="text-center py-16 bg-slate-950 rounded-2xl border border-dashed border-slate-800">
                            <i className="fas fa-folder-open text-5xl text-slate-700 mb-4"></i>
                            <p className="text-slate-300 font-bold text-lg">No matching hazards found.</p>
                            <p className="text-sm text-slate-500 mt-2">Try expanding your incident description with more specific keywords.</p>
                        </div>
                    ) : (
                        <div className="space-y-4 pr-2">
                            {matchedHazards.map((match, index) => (
                                <div key={index} className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 flex justify-between items-center hover:border-blue-500/50 transition group">
                                    <div className="pr-6">
                                        <div className="text-[10px] text-emerald-400 font-bold mb-2 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-file-alt"></i> {match.raName} <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">ID: {match.raDocId}</span></div>
                                        <div className="font-bold text-lg text-white mb-1">{match.actName}</div>
                                        <div className="text-sm text-blue-400 font-bold mb-3 bg-blue-900/10 inline-block px-3 py-1 rounded border border-blue-900/30">[{match.hazard.category}] {match.hazard.subCategory}</div>
                                        <div className="text-xs text-slate-400 leading-relaxed border-l-2 border-slate-700 pl-4 italic">{match.hazard.desc}</div>
                                    </div>
                                    <button type="button" onClick={() => onSelect(match)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-transform active:scale-95 whitespace-nowrap opacity-0 group-hover:opacity-100 flex items-center gap-2">Update Risk <i className="fas fa-arrow-right"></i></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
