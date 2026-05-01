import React from 'react';

export default function PortalSuccessModal({ onClose, portalSuccess }) {
    const copyPortalLink = async () => {
        if (!portalSuccess?.portalUrl) return;
        try {
            await navigator.clipboard.writeText(portalSuccess.portalUrl);
            alert('Vendor portal link copied.');
        } catch {
            alert('Could not copy the portal link automatically.');
        }
    };

    const copyTemporaryPassword = async () => {
        if (!portalSuccess?.temporaryPassword) return;
        try {
            await navigator.clipboard.writeText(portalSuccess.temporaryPassword);
            alert('Temporary password copied.');
        } catch {
            alert('Could not copy the temporary password automatically.');
        }
    };

    const hasTemporaryPassword = Boolean(portalSuccess?.temporaryPassword);
    const hasSetupEmail = Boolean(portalSuccess?.setupEmailSent);
    const hasCredentialEmail = Boolean(portalSuccess?.credentialEmailSent);
    const hasManualCredentialDraft = Boolean(portalSuccess?.manualCredentialDraftUrl);

    return (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl shadow-2xl max-w-md w-full p-8">
                <div className="w-14 h-14 rounded-2xl bg-emerald-900/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl mb-5">
                    <i className="fas fa-user-check"></i>
                </div>
                <h3 className="text-2xl font-black text-white mb-2">Portal Access Ready</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                    {portalSuccess.sharedIdentity
                        ? `The contractor portal is now linked to the same shared login already used in your organization for ${portalSuccess.companyName}.`
                        : portalSuccess.linkedExisting
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
                            {hasTemporaryPassword
                                ? 'Use the portal email plus the temporary password below for the first sign-in. The portal will force an immediate password change, and the vendor must sign in again with the new password.'
                                : hasSetupEmail
                                    ? 'A secure setup link has been sent. The vendor should create or reset the portal password from that email, then sign in normally.'
                                    : 'Use the current vendor portal password. If the vendor cannot sign in, resend the access email from the contractor profile.'}
                        </div>
                    </div>
                    {hasCredentialEmail && (
                        <div>
                            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Temporary Password Email</div>
                            <div className="text-xs text-emerald-300">The temporary password email was sent to the vendor mailbox{portalSuccess.credentialEmailSentAt ? ` on ${new Date(portalSuccess.credentialEmailSentAt).toLocaleString()}` : ''}.</div>
                        </div>
                    )}
                    {hasManualCredentialDraft && (
                        <div>
                            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Email Draft Prepared</div>
                            <div className="text-xs text-amber-200">Automatic vendor email delivery is not configured, so a ready-to-send mail draft is available below for the registrar.</div>
                        </div>
                    )}
                    {hasSetupEmail && (
                        <div>
                            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Setup Email</div>
                            <div className="text-xs text-emerald-300">Password setup instructions were sent to the vendor mailbox{portalSuccess.setupEmailSentAt ? ` on ${new Date(portalSuccess.setupEmailSentAt).toLocaleString()}` : ''}.</div>
                        </div>
                    )}
                </div>

                {portalSuccess.warning && <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-200 mb-6">{portalSuccess.warning}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button type="button" onClick={copyPortalLink} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors border border-slate-700">
                        Copy Portal Link
                    </button>
                    {hasTemporaryPassword && (
                        <button type="button" onClick={copyTemporaryPassword} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors border border-slate-700">
                            Copy Temp Password
                        </button>
                    )}
                    {hasManualCredentialDraft && (
                        <a href={portalSuccess.manualCredentialDraftUrl} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shadow-lg shadow-amber-600/20 text-center">
                            Open Email Draft
                        </a>
                    )}
                    <a href={portalSuccess.portalUrl} target="_blank" rel="noreferrer" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shadow-lg shadow-emerald-600/20 text-center">
                        Open Portal
                    </a>
                    <button type="button" onClick={onClose} className="sm:col-span-2 w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
