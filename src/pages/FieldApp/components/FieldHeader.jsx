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
        <header className="myth-topbar sticky top-0 z-30">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="myth-outline-button flex h-11 w-11 items-center justify-center rounded-2xl"
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <p className="myth-kicker">Field App</p>
                        <h1 className="text-3xl text-white sm:text-[2.15rem]">Site Operations for {firstName}</h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="myth-surface-soft hidden rounded-2xl px-4 py-3 text-right sm:block">
                        <p className="myth-kicker text-[10px]">Today</p>
                        <p className="text-sm font-semibold text-white">{new Date().toLocaleDateString()}</p>
                    </div>
                    <div className="myth-surface-soft rounded-2xl px-3 py-2">
                        <label className="myth-kicker mb-1 block text-[10px]">
                            Site
                        </label>
                        <select
                            value={selectedSite}
                            onChange={onSiteChange}
                            className="min-w-[140px] bg-transparent text-sm font-bold text-white outline-none"
                        >
                            {isGlobalUser && <option value="All">All Sites</option>}
                            {visibleSites.map((site) => (
                                <option key={site.code} value={site.code}>
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
