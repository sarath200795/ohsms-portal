import React from 'react';

export default function RiskChangeLogModal({
    show,
    changeDetails,
    setChangeDetails,
    changeSources,
    onClose,
    onConfirm,
    saving
}) {
    if (!show) return null;

    return (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-lg w-full">
                <h3 className="text-xl font-bold text-orange-400 mb-2"><i className="fas fa-code-branch mr-2"></i> Document Revision Log</h3>
                <p className="text-slate-400 text-sm mb-6">ISO 45001 requires tracking why risk assessments are modified. Please detail the reason for this update.</p>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Source of Change</label>
                        <select value={changeDetails.source} onChange={(e) => setChangeDetails({ ...changeDetails, source: e.target.value })} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none focus:border-orange-500">
                            {changeSources.map((source) => <option key={source} value={source}>{source}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Reason / Description of Update</label>
                        <textarea rows="3" placeholder="e.g. Added new engineering control following incident IN-291..." value={changeDetails.reason} onChange={(e) => setChangeDetails({ ...changeDetails, reason: e.target.value })} className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg outline-none focus:border-orange-500 resize-none"></textarea>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                    <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold bg-slate-800 text-white hover:bg-slate-700 transition">Cancel</button>
                    <button type="button" onClick={onConfirm} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold bg-orange-600 text-white shadow-lg hover:bg-orange-500 transition">{saving ? <i className="fas fa-spinner fa-spin"></i> : 'Confirm & Save Update'}</button>
                </div>
            </div>
        </div>
    );
}
