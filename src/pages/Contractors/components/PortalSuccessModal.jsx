import React from 'react';

export default function PortalSuccessModal({ onClose, portalSuccess }) {
    return (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl shadow-2xl max-w-md w-full p-8">
                <div className="w-14 h-14 rounded-2xl bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl mb-5">
                    <i className="fas fa-user-check"></i>
                </div>
                <h3 className="text-2xl font-black text-white mb-2">Portal Access Ready</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                    {portalSuccess.linkedExisting
                        ? `The contractor portal has been linked to an existing org account for ${portalSuccess.companyName}.`
                        : `A new contractor portal account has been created for ${portalSuccess.companyName}.`}
                </p>

                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 mb-6">
                    <div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Portal Email</div>
                        <div className="text-sm font-bold text-white font-mono break-all">{portalSuccess.email}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Vendor Reference Code</div>
                        <div className="text-sm font-bold text-white font-mono break-all">{portalSuccess.vendorCode || 'Available on the contractor profile header'}</div>
                    </div>
                    {portalSuccess.temporaryPassword && (
                        <div>
                            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Temporary Portal Password</div>
                            <div className="text-sm font-bold text-emerald-300 font-mono break-all">{portalSuccess.temporaryPassword}</div>
                        </div>
                    )}
                    <div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Vendor Login Method</div>
                        <div className="text-xs text-slate-300">
                            {portalSuccess.temporaryPassword
                                ? 'Email + temporary password. The vendor must change this password after the first successful login.'
                                : 'Email + the vendor’s current portal password. If they cannot sign in, issue a password reset or reprovision the portal access again.'}
                        </div>
                    </div>
                </div>

                {portalSuccess.warning && <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-200 mb-6">{portalSuccess.warning}</div>}

                <button type="button" onClick={onClose} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shadow-lg shadow-emerald-600/20">
                    Close
                </button>
            </div>
        </div>
    );
}
