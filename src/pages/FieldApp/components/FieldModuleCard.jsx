import React from 'react';

export default function FieldModuleCard({ module, onOpen, siteLabel }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className={`group relative overflow-hidden rounded-[1.75rem] border bg-slate-900/70 p-6 text-left shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-slate-900 ${module.border}`}
        >
            <div className={`absolute inset-0 bg-gradient-to-br ${module.surface} opacity-70 transition-opacity duration-300 group-hover:opacity-100`}></div>
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/5 blur-3xl"></div>

            <div className="relative z-10 flex h-full flex-col">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-2xl shadow-lg ${module.accent}`}>
                        <i className={`fas ${module.icon}`}></i>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
                        {siteLabel}
                    </span>
                </div>

                <div className="mb-6">
                    <h3 className="mb-2 text-xl font-black tracking-tight text-white transition-colors group-hover:text-white">
                        {module.label}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-300">
                        {module.desc}
                    </p>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-slate-800/80 pt-4">
                    <span className={`text-xs font-bold uppercase tracking-[0.25em] ${module.accent}`}>
                        {module.actionLabel}
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:border-white/20 group-hover:text-white">
                        <i className="fas fa-arrow-right"></i>
                    </span>
                </div>
            </div>
        </button>
    );
}
