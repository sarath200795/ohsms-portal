import React, { useMemo } from 'react';
import { safeArr } from '../utils';

export default function IncidentDashboard({ incidents }) {
    const stats = useMemo(() => {
        let total = 0;
        let closed = 0;
        let open = 0;

        incidents.forEach((incident) => {
            safeArr(incident.capa).forEach((action) => {
                total += 1;
                if (action.status === 'Closed') closed += 1;
                else open += 1;
            });
        });

        return { total, closed, open };
    }, [incidents]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
            <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-xl border-l-4 border-l-blue-500 flex justify-between items-center shadow-lg">
                <div><p className="text-xs text-slate-400 uppercase font-bold">Total CAPA Raised</p><h3 className="text-3xl font-bold text-white">{stats.total}</h3></div>
                <i className="fas fa-list-check text-2xl text-blue-500/50"></i>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-xl border-l-4 border-l-emerald-500 flex justify-between items-center shadow-lg">
                <div><p className="text-xs text-slate-400 uppercase font-bold">Actions Closed</p><h3 className="text-3xl font-bold text-emerald-400">{stats.closed}</h3></div>
                <i className="fas fa-check-circle text-2xl text-emerald-500/50"></i>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-xl border-l-4 border-l-orange-500 flex justify-between items-center shadow-lg">
                <div><p className="text-xs text-slate-400 uppercase font-bold">Actions Open</p><h3 className="text-3xl font-bold text-orange-400">{stats.open}</h3></div>
                <i className="fas fa-clock text-2xl text-orange-500/50"></i>
            </div>
        </div>
    );
}
