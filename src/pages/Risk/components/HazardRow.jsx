import React from 'react';
import {
    HAZARD_CATS,
    HAZARD_DICTIONARY,
    PROBABILITY,
    SEVERITY,
    getRiskClass
} from '../utils';

export default function HazardRow({
    idx,
    hIdx,
    haz,
    updateHazard,
    removeHazard,
    handleCategoryChange,
    handleSubCategoryChange,
    users,
    canEdit
}) {
    const manuallyAddExistingControl = () => {
        const type = document.getElementById(`ext-type-${haz.id}`).value;
        const desc = document.getElementById(`ext-desc-${haz.id}`).value;
        if (desc) {
            const updatedArray = [...(Array.isArray(haz.existingControls) ? haz.existingControls : []), { type, desc }];
            updateHazard(idx, hIdx, 'existingControls', updatedArray);
            document.getElementById(`ext-desc-${haz.id}`).value = '';
        }
    };

    const removeExistingControl = (cIdx) => {
        updateHazard(idx, hIdx, 'existingControls', haz.existingControls.filter((_, i) => i !== cIdx));
    };

    const addSuggestedToExisting = (suggestionObj) => {
        const safeArray = Array.isArray(haz.existingControls) ? haz.existingControls : [];
        if (safeArray.some((c) => c.desc === suggestionObj.desc)) return;
        updateHazard(idx, hIdx, 'existingControls', [...safeArray, suggestionObj]);
    };

    const manuallyAddAdditionalControl = () => {
        const cat = document.getElementById(`add-type-${haz.id}`).value;
        const desc = document.getElementById(`add-desc-${haz.id}`).value;
        const own = document.getElementById(`add-own-${haz.id}`).value || 'Unassigned';
        if (desc) {
            const updatedArray = [...(Array.isArray(haz.additionalControls) ? haz.additionalControls : []), { category: cat, desc, owner: own, status: 'Open' }];
            updateHazard(idx, hIdx, 'additionalControls', updatedArray);
            document.getElementById(`add-desc-${haz.id}`).value = '';
        }
    };

    const removeAdditionalControl = (cIdx) => {
        updateHazard(idx, hIdx, 'additionalControls', haz.additionalControls.filter((_, i) => i !== cIdx));
    };

    const addSuggestedToAdditional = (suggestionObj) => {
        const safeArray = Array.isArray(haz.additionalControls) ? haz.additionalControls : [];
        if (safeArray.some((c) => c.desc === suggestionObj.desc)) return;
        updateHazard(idx, hIdx, 'additionalControls', [...safeArray, { category: suggestionObj.type, desc: suggestionObj.desc, owner: 'Unassigned', status: 'Open' }]);
    };

    return (
        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-700 relative group shadow-inner">
            {canEdit && <button type="button" onClick={() => removeHazard(idx, hIdx)} className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-times text-lg"></i></button>}

            <div className="grid grid-cols-12 gap-4 mb-4 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-purple-400 uppercase block mb-1">Specific Location</label>
                    <input value={haz.location || ''} onChange={(e) => updateHazard(idx, hIdx, 'location', e.target.value)} disabled={!canEdit} placeholder="e.g. Ceiling, Pump Room" className="bg-slate-900 border border-slate-700 p-2 rounded text-sm w-full outline-none focus:border-purple-500 text-white" />
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-blue-400 uppercase block mb-1">Hazard Category</label>
                    <select value={haz.category} onChange={(e) => handleCategoryChange(idx, hIdx, e.target.value)} disabled={!canEdit} className="bg-slate-900 border border-slate-700 p-2 rounded text-sm focus:border-blue-500 w-full outline-none text-white">
                        <option value="">Select Category...</option>
                        {HAZARD_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-orange-400 uppercase block mb-1">Hazard Type</label>
                    <select value={haz.subCategory} onChange={(e) => handleSubCategoryChange(idx, hIdx, e.target.value)} disabled={!canEdit || !haz.category} className="bg-slate-900 border border-slate-700 p-2 rounded text-sm focus:border-orange-500 w-full outline-none text-white">
                        <option value="">Select Hazard...</option>
                        {haz.category && HAZARD_DICTIONARY[haz.category] && Object.keys(HAZARD_DICTIONARY[haz.category]).map((sc) => <option key={sc} value={sc}>{sc}</option>)}
                    </select>
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Who Might Be Harmed?</label>
                    <input value={haz.who || ''} onChange={(e) => updateHazard(idx, hIdx, 'who', e.target.value)} disabled={!canEdit} placeholder="Operators..." className="bg-slate-900 border border-slate-700 p-2 rounded text-sm w-full outline-none text-white" />
                </div>
            </div>

            <div className="flex gap-4 mb-6 border-b border-slate-700 pb-4">
                <div className="col-span-8 flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Description / Context</label>
                    <textarea rows="1" value={haz.desc} onChange={(e) => updateHazard(idx, hIdx, 'desc', e.target.value)} disabled={!canEdit} className="resize-none bg-slate-950 border border-slate-600 text-sm w-full focus:border-blue-500 p-2 rounded outline-none text-white"></textarea>
                </div>
                <div className="bg-slate-950 border border-slate-700 p-2 rounded flex gap-4 w-1/3 shadow">
                    <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Prob</label><select value={haz.p1} onChange={(e) => updateHazard(idx, hIdx, 'p1', parseInt(e.target.value, 10))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-blue-500 rounded text-white">{PROBABILITY.map((p) => <option key={p.v} value={p.v}>{p.v}</option>)}</select></div>
                    <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Sevr</label><select value={haz.s1} onChange={(e) => updateHazard(idx, hIdx, 's1', parseInt(e.target.value, 10))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-blue-500 rounded text-white">{SEVERITY.map((s) => <option key={s.v} value={s.v}>{s.v}</option>)}</select></div>
                    <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Risk</label><div className={`font-bold text-center text-sm ${getRiskClass(haz.r1)} rounded p-1`}>{haz.r1}</div></div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="text-xs font-bold text-emerald-400 uppercase block mb-2 border-b border-emerald-500/20 pb-1">Existing Controls</label>
                    <div className="flex flex-col gap-2 mb-3 min-h-[40px]">
                        {(Array.isArray(haz.existingControls) ? haz.existingControls : []).map((c, i) => (
                            <div key={i} className="flex justify-between items-center bg-emerald-900/20 border border-emerald-700/30 px-3 py-2 rounded text-sm group">
                                <div className="flex items-center gap-2"><span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded font-bold border border-emerald-500/50">{c.type}</span><span className="text-slate-200">{c.desc}</span></div>
                                {canEdit && <button type="button" onClick={() => removeExistingControl(i)} className="text-emerald-700 hover:text-red-400 opacity-0 group-hover:opacity-100"><i className="fas fa-times"></i></button>}
                            </div>
                        ))}
                        {(!haz.existingControls || haz.existingControls.length === 0) && <span className="text-xs text-slate-600 italic px-2">No existing controls documented.</span>}
                    </div>

                    {canEdit && (
                        <div className="flex gap-2 mb-4">
                            <select id={`ext-type-${haz.id}`} className="text-[10px] w-28 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded"><option>Elimination</option><option>Substitution</option><option>Engineering</option><option>Administrative</option><option>PPE</option></select>
                            <input id={`ext-desc-${haz.id}`} className="text-xs flex-1 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded" placeholder="Add custom control..." />
                            <button type="button" onClick={manuallyAddExistingControl} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 rounded text-white font-bold transition-colors">+</button>
                        </div>
                    )}

                    {canEdit && haz.suggestedControls?.length > 0 && (
                        <div className="border-t border-slate-800 pt-2">
                            <span className="text-[9px] text-slate-500 uppercase font-bold block mb-2"><i className="fas fa-magic text-blue-400 mr-1"></i> Add from HSE Library</span>
                            <div className="flex flex-wrap gap-2">
                                {haz.suggestedControls.map((sug, i) => (
                                    <button key={i} type="button" onClick={() => addSuggestedToExisting(sug)} className="text-[10px] bg-slate-800 hover:bg-emerald-900/50 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 px-2 py-1 rounded border border-slate-700 transition-colors text-left flex items-center gap-1 shadow-sm">
                                        <i className="fas fa-plus"></i> <span className="text-blue-300 font-bold border border-blue-500/30 px-1 rounded">[{sug.type}]</span> {sug.desc}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-l border-slate-700 pl-6 flex flex-col">
                    <div className="flex justify-between items-center mb-2 border-b border-orange-500/20 pb-1">
                        <label className="text-xs font-bold text-orange-400 uppercase">Additional Actions (CAPA)</label>
                        <label className="flex items-center gap-2 text-[10px] font-bold text-red-400 cursor-pointer">
                            <input type="checkbox" className="accent-red-500 w-3 h-3" checked={haz.alarp || false} onChange={(e) => updateHazard(idx, hIdx, 'alarp', e.target.checked)} disabled={!canEdit} /> Declare ALARP
                        </label>
                    </div>

                    {haz.alarp ? (
                        <div className="bg-red-900/10 border border-red-500/30 p-3 rounded mb-4">
                            <label className="text-[10px] text-red-400 font-bold block mb-1">ALARP Justification (Mandatory)</label>
                            <textarea placeholder="Why can't risk be reduced further?..." value={haz.alarpJustification || ''} onChange={(e) => updateHazard(idx, hIdx, 'alarpJustification', e.target.value)} disabled={!canEdit} className="w-full text-xs bg-slate-950 border border-red-500/50 text-white outline-none p-2 rounded" rows="2"></textarea>
                        </div>
                    ) : (
                        <div className="mb-4">
                            <div className="flex flex-col gap-2 mb-3 min-h-[40px]">
                                {(Array.isArray(haz.additionalControls) ? haz.additionalControls : []).map((c, i) => (
                                    <div key={i} className="flex flex-col bg-orange-900/20 border border-orange-700/30 px-3 py-2 rounded text-sm group relative">
                                        <div className="flex items-center gap-2 mb-1"><span className="text-[10px] bg-orange-900/50 text-orange-400 px-1.5 py-0.5 rounded font-bold border border-orange-500/50">{c.category}</span><span className="text-slate-200">{c.desc}</span></div>
                                        <div className="text-[10px] text-slate-500 pl-1"><i className="fas fa-user mr-1"></i> {c.owner}</div>
                                        {canEdit && <button type="button" onClick={() => removeAdditionalControl(i)} className="absolute top-2 right-2 text-orange-700 hover:text-red-400 opacity-0 group-hover:opacity-100"><i className="fas fa-times"></i></button>}
                                    </div>
                                ))}
                                {(!haz.additionalControls || haz.additionalControls.length === 0) && <span className="text-xs text-slate-600 italic px-2">No additional controls mapped.</span>}
                            </div>

                            {canEdit && (
                                <div className="flex gap-2 mb-4">
                                    <select id={`add-type-${haz.id}`} className="text-[10px] w-28 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded"><option>Elimination</option><option>Substitution</option><option>Engineering</option><option>Administrative</option><option>PPE</option></select>
                                    <input id={`add-desc-${haz.id}`} className="text-xs flex-1 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded" placeholder="Add custom action..." />
                                    <select id={`add-own-${haz.id}`} className="text-[10px] w-24 bg-slate-950 border border-slate-700 text-white outline-none p-2 rounded"><option value="">Owner</option>{users.map((u) => <option key={u.id} value={u.name || u.email}>{u.name || u.email}</option>)}</select>
                                    <button type="button" onClick={manuallyAddAdditionalControl} className="bg-slate-700 hover:bg-slate-600 text-xs px-2 rounded text-white font-bold transition-colors">+</button>
                                </div>
                            )}

                            {canEdit && haz.suggestedControls?.length > 0 && (
                                <div className="border-t border-slate-800 pt-2">
                                    <span className="text-[9px] text-slate-500 uppercase font-bold block mb-2"><i className="fas fa-magic text-blue-400 mr-1"></i> Add from HSE Library</span>
                                    <div className="flex flex-col gap-1">
                                        {haz.suggestedControls.map((sug, i) => (
                                            <button key={i} type="button" onClick={() => addSuggestedToAdditional(sug)} className="text-[10px] bg-slate-800 hover:bg-orange-900/50 hover:border-orange-500/50 text-slate-300 hover:text-orange-300 px-2 py-1.5 rounded border border-slate-700 transition-colors text-left flex items-center gap-2 shadow-sm">
                                                <i className="fas fa-plus"></i> <span className="font-bold w-16 truncate text-blue-300 border border-blue-500/30 px-1 rounded text-center">[{sug.type}]</span> <span className="truncate">{sug.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-slate-950 border border-slate-700 p-2 rounded flex gap-4 shadow mt-auto">
                        <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Res. Prob</label><select value={haz.p2} onChange={(e) => updateHazard(idx, hIdx, 'p2', parseInt(e.target.value, 10))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-orange-500 rounded text-white">{PROBABILITY.map((p) => <option key={p.v} value={p.v}>{p.v}</option>)}</select></div>
                        <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Res. Sevr</label><select value={haz.s2} onChange={(e) => updateHazard(idx, hIdx, 's2', parseInt(e.target.value, 10))} disabled={!canEdit} className="w-full p-1 text-center font-mono text-xs bg-slate-800 border-none outline-none focus:border-orange-500 rounded text-white">{SEVERITY.map((s) => <option key={s.v} value={s.v}>{s.v}</option>)}</select></div>
                        <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase block text-center mb-1">Res. Risk</label><div className={`font-bold text-center text-sm ${getRiskClass(haz.r2)} rounded p-1`}>{haz.r2}</div></div>
                    </div>
                    {haz.r2 > 8 && !haz.alarp && <div className="text-[10px] text-red-500 font-bold text-center mt-2 animate-pulse">Warning: Residual risk remains high. Must declare ALARP or add controls.</div>}
                </div>
            </div>
        </div>
    );
}
