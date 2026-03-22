// src/pages/PTW/components/PermitBuilder.jsx
import React from 'react';

export default function PermitBuilder({ onCancel }) {
    return (
        <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl p-10 text-center">
            <i className="fas fa-tools text-6xl text-slate-600 mb-4"></i>
            <h2 className="text-2xl font-bold text-white">Permit Builder Interface</h2>
            <p className="text-slate-400 mt-2">Your form logic goes here.</p>
            <button onClick={onCancel} className="mt-6 text-emerald-400 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors border-b border-emerald-500/50 pb-1">Return to Registry</button>
        </div>
    );
}