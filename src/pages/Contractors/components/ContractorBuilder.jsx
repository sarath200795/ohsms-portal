import React from 'react';
import { SERVICE_TYPES } from '../../../utils/constants';

export default function ContractorBuilder({ sites, onCancel }) {
    const siteCount = Array.isArray(sites) ? sites.length : 0;
    const serviceCount = Array.isArray(SERVICE_TYPES) ? SERVICE_TYPES.length : 0;

    return (
        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl p-10 text-center">
            <i className="fas fa-file-signature text-6xl text-slate-600 mb-4"></i>
            <h2 className="text-2xl font-bold text-white">Vendor Onboarding Interface</h2>
            <p className="text-slate-400 mt-2">
                Your form logic utilizing <span className="text-indigo-400 font-mono">SERVICE_TYPES</span> goes here.
            </p>
            <p className="text-xs text-slate-500 mt-3 uppercase tracking-widest">
                {serviceCount} service categories configured across {siteCount} site records.
            </p>
            <button
                type="button"
                onClick={onCancel}
                className="mt-6 text-indigo-400 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors border-b border-indigo-500/50 pb-1"
            >
                Return to Registry
            </button>
        </div>
    );
}
