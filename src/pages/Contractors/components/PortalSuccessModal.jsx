import React, { useState } from 'react';

export default function PortalSuccessModal({ onClose, portalSuccess, onSendResetEmail }) {
    const [sendingReset, setSendingReset] = useState(false);
    const [resetSentAt, setResetSentAt] = useState(null);

    const handleSendReset = async () => {
        if (!onSendResetEmail) return;
        setSendingReset(true);
        try {
            await onSendResetEmail();
            setResetSentAt(new Date());
        } catch {
            // alert already handled in parent
        } finally {
            setSendingReset(false);
        }
    };

    const copyPortalLink = async () => {
        if (!portalSuccess?.portalUrl) return;
        try {
            await navigator.clipboard.writeText(portalSuccess.portalUrl);
            alert('Vendor portal link copied.');
        } catch {
            alert('Could not copy the portal link automatically.');
        }
    };

    const copyEmail = async () => {
        if (!portalSuccess?.email) return;
        try {
            await navigator.clipboard.writeText(portalSuccess.email);
            alert('Vendor email copied.');
        } catch {
            alert('Could not copy the email automatically.');
        }
    };

    // The provisioning flow no longer mails the vendor anything. The vendor
    // self-services their password via Firebase's built-in Forgot Password
    // reset email by clicking the link on the portal sign-in screen.
    // `resetFlowRequired` is the new flag set by Contractors/index.jsx for
    // every modern provisioning.
    const usesResetFlow = portalSuccess?.resetFlowRequired === true;

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
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Registered Email</div>
                        <div className="text-sm font-bold text-white font-mono break-all">{portalSuccess.email}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Vendor Reference Code</div>
                        <div className="text-sm font-bold text-white font-mono break-all">{portalSuccess.vendorCode || 'Available on the contractor profile header'}</div>
                    </div>
                </div>

                {/* First-login instructions — the admin reads this and shares
                    the gist with the vendor (along with the portal URL). No
                    emails are sent from this app; Firebase handles password
                    reset delivery via its own transport. */}
                {usesResetFlow && (
                    <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-5 text-xs leading-relaxed text-sky-100 mb-6">
                        <p className="font-bold text-sky-200 uppercase tracking-widest text-[10px] mb-2">
                            Tell the vendor how to log in
                        </p>
                        <ol className="space-y-1.5 list-decimal list-inside marker:text-sky-400">
                            <li>Open the <span className="font-bold">Portal URL</span> below.</li>
                            <li>Enter the <span className="font-bold">registered email</span> shown above.</li>
                            <li>Click <span className="font-bold">"Forgot Password"</span> — Firebase will email a reset link directly to that mailbox.</li>
                            <li>Set a new password from the reset link, then sign in.</li>
                        </ol>
                        <p className="mt-3 text-sky-300/80">
                            No temporary password is shared here — the vendor sets their own on first sign-in.
                        </p>
                    </div>
                )}

                {portalSuccess.warning && <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-200 mb-6">{portalSuccess.warning}</div>}

                {/* Two primary actions:
                    • Send password reset — Firebase mails the vendor a reset
                      link directly, so they never need the admin's help to
                      pick a password.
                    • Sign in to vendor portal — opens the portal URL (with the
                      orgId pre-pinned so the DB selector is already set). */}
                {onSendResetEmail && (
                    <button
                        type="button"
                        onClick={handleSendReset}
                        disabled={sendingReset}
                        className="mb-3 flex items-center justify-center gap-2 w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white px-4 py-3.5 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shadow-lg shadow-sky-600/30"
                    >
                        <i className={`fas ${sendingReset ? 'fa-spinner fa-spin' : 'fa-key'}`}></i>
                        {resetSentAt ? `Reset Email Sent · ${resetSentAt.toLocaleTimeString()}` : 'Send Password Reset Email'}
                    </button>
                )}

                <a
                    href={portalSuccess.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3.5 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shadow-lg shadow-emerald-600/30"
                >
                    <i className="fas fa-sign-in-alt"></i>
                    Sign In To Vendor Portal
                </a>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button type="button" onClick={copyPortalLink} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors border border-slate-700">
                        Copy Portal Link
                    </button>
                    <button type="button" onClick={copyEmail} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors border border-slate-700">
                        Copy Email
                    </button>
                    <button type="button" onClick={onClose} className="sm:col-span-2 w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
