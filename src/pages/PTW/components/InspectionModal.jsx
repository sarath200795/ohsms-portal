import React from 'react';

export default function InspectionModal({ inspectionModal, inspectionObservation, onClose, onChange, onSubmit }) {
    if (!inspectionModal) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg animate-fade-in rounded-3xl border border-slate-700 bg-slate-900 p-8 font-['Space_Grotesk'] shadow-2xl">
                <h2 className="mb-2 text-xl font-bold text-white">
                    <i className="fas fa-search mr-2 text-orange-500"></i> Conduct Inspection
                </h2>
                <p className="mb-6 text-xs text-slate-400">
                    Location: <span className="font-bold text-fuchsia-400">{inspectionModal.location}</span>
                </p>

                <label className="mb-2 block text-[10px] font-bold uppercase text-slate-400">Observation Notes</label>
                <textarea
                    value={inspectionObservation}
                    onChange={(event) => onChange(event.target.value)}
                    rows="4"
                    className="mb-6 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-['Inter'] text-sm text-white outline-none focus:border-orange-500"
                    placeholder="Log site conditions, PPE usage, etc..."
                ></textarea>

                <div className="flex flex-col gap-3">
                    <button type="button" onClick={() => onSubmit(false)} className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-emerald-500">
                        <i className="fas fa-check-circle mr-2"></i> Log as Safe & Continue
                    </button>
                    <button type="button" onClick={() => onSubmit(true)} className="w-full rounded-xl border border-red-500/50 bg-red-900/50 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-red-600">
                        <i className="fas fa-ban mr-2"></i> Log Unsafe (Cancel Permit)
                    </button>
                    <button type="button" onClick={onClose} className="mt-2 w-full rounded-xl bg-slate-800 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-slate-700">
                        Close Menu
                    </button>
                </div>
            </div>
        </div>
    );
}
