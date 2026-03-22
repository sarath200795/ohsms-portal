// src/pages/Incidents/components/IncidentDashboard.jsx
import React from 'react';

export default function IncidentDashboard({ incidents }) {
    const openIncidents = incidents.filter(i => i.status !== 'Closed').length;
    const ltis = incidents.filter(i => i.type === 'LTI' || i.incidentType === 'LTI').length;
    const nearMisses = incidents.filter(i => i.type === 'Near Miss' || i.incidentType === 'Near Miss').length;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-blue-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Total Logged</h3>
                <div className="text-3xl font-black text-white">{incidents.length}</div>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-orange-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Open Investigations</h3>
                <div className="text-3xl font-black text-orange-400">{openIncidents}</div>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-red-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Lost Time Injuries (LTI)</h3>
                <div className="text-3xl font-black text-red-400">{ltis}</div>
            </div>
            <div className="bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-700 shadow-xl border-l-4 border-l-yellow-500">
                <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Near Misses</h3>
                <div className="text-3xl font-black text-yellow-400">{nearMisses}</div>
            </div>
        </div>
    );
}