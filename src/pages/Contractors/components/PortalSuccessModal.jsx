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

    // Two possible first-login flows depending on what provisioning could do:
    //
    // • vendorCodeFlow (default) — provisioning set the vendor's Firebase Auth
    //   password to the Vendor Reference Code. Admin shares the email + code
    //   with the vendor. Vendor signs in once with those, and the portal
    //   forces them to choose a real password before doing anything else.
    //
    // • resetFlow (fallback) — provisioning couldn't set a password (e.g.,
    //   the email already had a Firebase Auth account with a different
    //   password). Admin clicks "Send Password Reset Email" and the vendor
    //   sets their password from the email link.
    const usesResetFlow = portalSuccess?.resetFlowRequired === true;
    const vendorCodeFlow = !usesResetFlow && Boolean(portalSuccess?.temporaryPassword);

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
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">
                            {vendorCodeFlow ? 'First-Login Password (= Vendor Reference Code)' : 'Vendor Reference Code'}
                        </div>
                        <div className="text-sm font-bold text-emerald-300 font-mono break-all bg-emerald-900/15 border border-emerald-500/30 rounded-lg px-3 py-2">
                            {portalSuccess.vendorCode || portalSuccess.temporaryPassword || 'Available on the contractor profile header'}
                        </div>
                        {vendorCodeFlow && (
                            <p className="text-[10px] text-slate-500 mt-2 italic">
                                Share this with the vendor. They use it once to sign in, then the portal forces them to set their own password.
                            </p>
                        )}
                    </div>
                </div>

                {/* Vendor-code flow — primary path. */}
                {vendorCodeFlow && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 text-xs leading-relaxed text-emerald-100 mb-6">
                        <p className="font-bold text-emerald-200 uppercase tracking-widest text-[10px] mb-2">
                            Tell the vendor how to log in
                        </p>
                        <ol className="space-y-1.5 list-decimal list-inside marker:text-emerald-400">
                            <li>Open the <span className="font-bold">Portal URL</span> below (the correct database is already selected).</li>
                            <li>Enter the <span className="font-bold">registered email</span> shown above.</li>
                            <li>Enter the <span className="font-bold">Vendor Reference Code</span> as the password.</li>
                            <li>The portal will immediately ask the vendor to <span className="font-bold">set a new password</span> for future use.</li>
                        </ol>
                        <p className="mt-3 text-emerald-300/80">
                            No email delivery required — the admin shares the code verbally or via chat. The code only works once; after the vendor sets a new password it stops being a valid login.
                        </p>
                    </div>
                )}

                {/* Reset-link fallback flow (email account already existed). */}
                {usesResetFlow && (
                    <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-5 text-xs leading-relaxed text-sky-100 mb-6">
                        <p className="font-bold text-sky-200 uppercase tracking-widest text-[10px] mb-2">
                            Tell the vendor how to log in
                        </p>
                        <ol className="space-y-1.5 list-decimal list-inside marker:text-sky-400">
                            <li>Click <span className="font-bold">"Send Password Reset Email"</span> below.</li>
                            <li>Vendor opens the email from <span className="font-mono">noreply@&lt;project-id&gt;.firebaseapp.com</span> (check spam).</li>
                            <li>Vendor clicks the reset link and chooses a new password.</li>
                            <li>Vendor signs in to the portal with their new password.</li>
                        </ol>
                        <p className="mt-3 text-sky-300/80">
                            This path is the fallback — the vendor's email already had a Firebase Auth account that we couldn't take over directly.
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
