import React from 'react';

export default function FieldHeader({
    firstName,
    isGlobalUser,
    selectedSite,
    onSiteChange,
    visibleSites,
    onBack
}) {
    return (
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">Field App</p>
                        <h1 className="text-lg font-black tracking-tight text-white sm:text-xl">Site Operations for {firstName}</h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-right sm:block">
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Today</p>
                        <p className="text-sm font-semibold text-white">{new Date().toLocaleDateString()}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2">
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                            Site
                        </label>
                        <select
                            value={selectedSite}
                            onChange={onSiteChange}
                            className="min-w-[140px] bg-transparent text-sm font-bold text-white outline-none"
                        >
                            {isGlobalUser && <option value="All" className="bg-slate-900">All Sites</option>}
                            {visibleSites.map((site) => (
                                <option key={site.code} value={site.code} className="bg-slate-900">
                                    {site.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </header>
    );
}
