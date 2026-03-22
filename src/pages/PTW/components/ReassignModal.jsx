import React from 'react';
import { safeArr } from '../../../utils/helpers';

export default function ReassignModal({ newApproverEmail, onCancel, onConfirm, onSelect, reassignModal, users }) {
    if (!reassignModal) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md animate-fade-in rounded-3xl border border-slate-700 bg-slate-900 p-8 font-['Space_Grotesk'] shadow-2xl">
                <h2 className="mb-2 text-xl font-bold text-white">
                    <i className="fas fa-user-edit mr-2 text-amber-500"></i> Reassign Approver
                </h2>
                <p className="mb-6 text-xs leading-relaxed text-slate-400">
                    Select a new <strong className="text-white">{reassignModal.role === 'eng' ? 'Engineering' : 'Production'}</strong> approver for Permit{' '}
                    <span className="font-mono text-amber-400">{reassignModal.permit.id}</span>.
                </p>

                <select value={newApproverEmail} onChange={(event) => onSelect(event.target.value)} className="mb-6 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm font-bold text-white outline-none focus:border-amber-500">
                    <option value="">-- Select New Approver --</option>
                    {users
                        .filter((user) => user.assignedSite === reassignModal.permit.siteId || safeArr(user.accessibleSites).includes(reassignModal.permit.siteId) || user.assignedSite === 'GLOBAL')
                        .map((user) => (
                            <option key={user.id} value={user.email || user.name}>
                                {user.name} ({user.email || 'System Auth'})
                            </option>
                        ))}
                </select>

                <div className="flex gap-3">
                    <button type="button" onClick={onConfirm} className="flex-1 rounded-xl bg-amber-600 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all shadow-lg hover:bg-amber-500">
                        Confirm
                    </button>
                    <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-slate-700">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
