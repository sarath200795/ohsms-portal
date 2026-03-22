// src/pages/PTW/components/PtwDashboard.jsx
import React from 'react';

export default function PtwDashboard({ permits }) {
    const activePermits = permits.filter(p => p.status !== 'Closed' && p.status !== 'Cancelled').length;
    const pendingPermits = permits.filter(p => p.status === 'Pending').length;
    const highRiskPermits = permits.filter(p => ['HOT', 'CSE'].includes(p.permitType)).length;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-blue-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Total Permits</h3>
                <div className="text-3xl font-black text-white">{permits.length}</div>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-emerald-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Active / Open</h3>
                <div className="text-3xl font-black text-emerald-400">{activePermits}</div>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-orange-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Pending Approval</h3>
                <div className="text-3xl font-black text-orange-400">{pendingPermits}</div>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-red-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">High Risk (Hot/CSE)</h3>
                <div className="text-3xl font-black text-red-400">{highRiskPermits}</div>
            </div>
        </div>
    );
}