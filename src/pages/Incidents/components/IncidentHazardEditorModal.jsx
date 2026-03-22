import React from 'react';

export default function IncidentHazardEditorModal({ editingHazardData, onClose, onSave, saving, session, setEditingHazardData }) {
    return (
        <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300 no-print">
            <div className="bg-slate-900 rounded-3xl max-w-4xl w-full p-8 border border-slate-700 max-h-[90vh] overflow-y-auto custom-scroll shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-6">
                    <h2 className="text-2xl font-bold text-orange-400 flex items-center gap-3"><i className="fas fa-shield-virus"></i> Update HIRA Record</h2>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 w-10 h-10 flex items-center justify-center rounded-xl transition"><i className="fas fa-times text-xl"></i></button>
                </div>

                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 mb-8 shadow-inner">
                    <div className="text-[10px] text-emerald-400 font-bold mb-2 uppercase tracking-widest font-mono">{editingHazardData.raDocId} - {editingHazardData.actName}</div>
                    <div className="text-xl text-white font-bold mb-3">[{editingHazardData.modifiedHazard.category}] {editingHazardData.modifiedHazard.subCategory}</div>
                    <div className="text-sm text-slate-400 border-l-2 border-slate-700 pl-4 italic">{editingHazardData.modifiedHazard.desc}</div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                        <label className="text-[10px] uppercase text-slate-400 font-bold tracking-widest block mb-4">Post-Incident Risk Re-evaluation</label>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">Probability (P)</label><select value={editingHazardData.modifiedHazard.p2} onChange={(e) => { const p2 = parseInt(e.target.value, 10); const s2 = editingHazardData.modifiedHazard.s2; setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, p2, r2: p2 * s2 } }); }} className="w-full bg-slate-950 text-sm p-3 rounded-xl border border-slate-700 outline-none focus:border-orange-500 text-white"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
                            <div className="flex-1"><label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">Severity (S)</label><select value={editingHazardData.modifiedHazard.s2} onChange={(e) => { const s2 = parseInt(e.target.value, 10); const p2 = editingHazardData.modifiedHazard.p2; setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, s2, r2: p2 * s2 } }); }} className="w-full bg-slate-950 text-sm p-3 rounded-xl border border-slate-700 outline-none focus:border-orange-500 text-white"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-500 block mb-2 font-bold uppercase">New Score</label>
                                <div className={`font-bold text-2xl h-[46px] flex items-center justify-center bg-slate-950 border border-slate-700 rounded-xl shadow-inner ${editingHazardData.modifiedHazard.r2 >= 15 ? 'text-red-500 shadow-red-500/20' : editingHazardData.modifiedHazard.r2 >= 10 ? 'text-orange-500 shadow-orange-500/20' : 'text-emerald-500 shadow-emerald-500/20'}`}>{editingHazardData.modifiedHazard.r2}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col justify-between">
                        <label className="text-[10px] uppercase text-emerald-400 font-bold tracking-widest block mb-4 flex items-center gap-2"><i className="fas fa-plus-circle"></i> Add Additional Control</label>
                        <div className="flex flex-col gap-3 flex-1">
                            <input id="new-hira-ctrl" placeholder="Describe new safety control implemented..." className="bg-slate-950 text-sm p-4 rounded-xl border border-slate-700 focus:border-emerald-500 outline-none text-white shadow-inner flex-1" />
                            <button
                                type="button"
                                onClick={() => {
                                    const ctrlInput = document.getElementById('new-hira-ctrl');
                                    const ctrl = ctrlInput?.value;
                                    if (ctrl) {
                                        const next = [...(editingHazardData.modifiedHazard.additionalControls || []), { category: 'Administrative', desc: ctrl, owner: session.name || session.email, status: 'Open' }];
                                        setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, additionalControls: next } });
                                        if (ctrlInput) ctrlInput.value = '';
                                    }
                                }}
                                className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold py-3 rounded-xl hover:bg-emerald-600 hover:text-white transition-colors uppercase tracking-widest"
                            >
                                Append Control
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mb-10 bg-slate-950 p-6 rounded-2xl border border-slate-800">
                    <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest block mb-4">Current Registered Controls</label>
                    <ul className="space-y-3">
                        {(editingHazardData.modifiedHazard.additionalControls || []).map((control, index) => (
                            <li key={index} className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex justify-between items-center group">
                                <div className="flex items-center text-sm text-slate-300">
                                    <span className="text-[9px] bg-blue-900/30 text-blue-400 px-2 py-1 rounded-lg mr-4 font-bold uppercase tracking-widest border border-blue-900">{control.category}</span>
                                    {control.desc}
                                </div>
                                <button type="button" onClick={() => { const next = editingHazardData.modifiedHazard.additionalControls.filter((_, idx) => idx !== index); setEditingHazardData({ ...editingHazardData, modifiedHazard: { ...editingHazardData.modifiedHazard, additionalControls: next } }); }} className="text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity bg-red-900/20 hover:bg-red-600 w-8 h-8 rounded-lg flex items-center justify-center"><i className="fas fa-trash-alt"></i></button>
                            </li>
                        ))}
                        {(!editingHazardData.modifiedHazard.additionalControls || editingHazardData.modifiedHazard.additionalControls.length === 0) && <li className="text-sm text-slate-500 italic p-6 bg-slate-900 rounded-xl border border-dashed border-slate-700 text-center">No additional controls listed.</li>}
                    </ul>
                </div>

                <div className="flex justify-end gap-4 pt-6 border-t border-slate-800">
                    <button type="button" onClick={onClose} className="px-8 py-4 bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-slate-700 transition-colors">Cancel</button>
                    <button type="button" onClick={onSave} disabled={saving} className="px-10 py-4 bg-emerald-600 text-white rounded-xl text-xs uppercase tracking-widest font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 flex items-center gap-3 transition-transform active:scale-95 disabled:opacity-50">
                        {saving ? <i className="fas fa-spinner fa-spin text-lg"></i> : <i className="fas fa-link text-lg"></i>}
                        Save & Link Incident
                    </button>
                </div>
            </div>
        </div>
    );
}
