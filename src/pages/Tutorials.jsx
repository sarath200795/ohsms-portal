import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppTransition } from '../hooks/useAppTransition';
import { TUTORIAL_CATALOG } from '../tutorials/catalog';

const CATEGORY_ORDER = ['Platform', 'Enterprise Modules', 'OHS Tools', 'Portals'];

export default function Tutorials() {
    const navigate = useNavigate();
    const playTransition = useAppTransition();
    const [selectedTutorialId, setSelectedTutorialId] = useState(TUTORIAL_CATALOG[0]?.id || '');

    const selectedTutorial = useMemo(
        () => TUTORIAL_CATALOG.find((tutorial) => tutorial.id === selectedTutorialId) || TUTORIAL_CATALOG[0],
        [selectedTutorialId]
    );

    const tutorialsByCategory = useMemo(() => {
        return CATEGORY_ORDER.map((category) => ({
            category,
            items: TUTORIAL_CATALOG.filter((tutorial) => tutorial.category === category)
        })).filter((group) => group.items.length > 0);
    }, []);

    return (
        <div className="myth-shell min-h-screen bg-[var(--myth-bg)] px-4 py-6 text-[var(--myth-ink)] sm:px-6 sm:py-8">
            <div className="mx-auto max-w-7xl">
                <div className="command-panel mb-8 rounded-[2.2rem] p-6 sm:p-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="myth-kicker">Training Library</p>
                            <h1 className="mt-2 text-4xl text-[var(--myth-ink)] sm:text-5xl">Tutorials</h1>
                            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--myth-muted)] sm:text-base">
                                Watch guided module walkthroughs, portal videos, and the platform overview from one place. These are the same videos used in the first-open module prompts.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => playTransition({ label: 'Returning to Dashboard', action: () => navigate('/dashboard') })}
                                className="myth-outline-button rounded-2xl px-5 py-3 text-xs"
                            >
                                <i className="fas fa-arrow-left mr-2"></i>
                                Back to Hub
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <section className="command-panel rounded-[2rem] p-5 sm:p-6">
                        {selectedTutorial ? (
                            <>
                                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <p className="myth-kicker">{selectedTutorial.category}</p>
                                        <h2 className="mt-2 text-3xl text-white">{selectedTutorial.title}</h2>
                                        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--myth-muted)]">
                                            {selectedTutorial.description}
                                        </p>
                                    </div>
                                    <span className="rounded-xl border border-[rgba(242,201,120,0.12)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--myth-gold)]">
                                        {selectedTutorial.duration}
                                    </span>
                                </div>

                                <div className="overflow-hidden rounded-[1.6rem] border border-[rgba(242,201,120,0.08)] bg-black">
                                    <video
                                        key={selectedTutorial.videoUrl}
                                        controls
                                        preload="metadata"
                                        className="h-auto w-full"
                                        src={selectedTutorial.videoUrl}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="rounded-[1.6rem] border border-dashed border-[rgba(242,201,120,0.12)] px-6 py-14 text-center text-[var(--myth-muted)]">
                                No tutorial selected.
                            </div>
                        )}
                    </section>

                    <section className="command-panel rounded-[2rem] p-5 sm:p-6">
                        <div className="mb-4">
                            <p className="myth-kicker">Available Videos</p>
                            <h2 className="mt-2 text-3xl text-white">Library</h2>
                        </div>

                        <div className="space-y-6">
                            {tutorialsByCategory.map((group) => (
                                <div key={group.category}>
                                    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--myth-gold)]">{group.category}</h3>
                                    <div className="space-y-3">
                                        {group.items.map((tutorial) => {
                                            const isActive = tutorial.id === selectedTutorialId;
                                            return (
                                                <button
                                                    key={tutorial.id}
                                                    type="button"
                                                    onClick={() => setSelectedTutorialId(tutorial.id)}
                                                    className={`w-full rounded-[1.4rem] border p-4 text-left transition-all ${
                                                        isActive
                                                            ? 'border-[var(--myth-cyan)] bg-[rgba(17,40,48,0.72)]'
                                                            : 'border-[rgba(242,201,120,0.08)] bg-[rgba(12,10,8,0.72)] hover:border-[rgba(242,201,120,0.22)]'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <h4 className="text-base font-bold text-white">{tutorial.title}</h4>
                                                            <p className="mt-2 text-sm leading-relaxed text-[var(--myth-muted)]">{tutorial.description}</p>
                                                        </div>
                                                        <span className="rounded-lg border border-[rgba(242,201,120,0.1)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--myth-gold)]">
                                                            {tutorial.duration}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
