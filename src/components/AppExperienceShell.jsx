import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getTutorialForPath } from '../tutorials/catalog';

const STICKERS = [
    { src: '/safety-sticker-helmet.svg', alt: 'Safety helmet sticker', className: 'ambient-sticker ambient-sticker--helmet' },
    { src: '/safety-sticker-extinguisher.svg', alt: 'Fire extinguisher sticker', className: 'ambient-sticker ambient-sticker--extinguisher' },
    { src: '/safety-sticker-shield.svg', alt: 'Safety shield sticker', className: 'ambient-sticker ambient-sticker--shield' }
];

const getTransitionLabel = (pathname) => {
    const lowerPath = String(pathname || '').toLowerCase();

    if (lowerPath.includes('incident')) return 'Opening incident workspace';
    if (lowerPath.includes('inspection')) return 'Opening inspection workspace';
    if (lowerPath.includes('loto')) return 'Opening loto controls';
    if (lowerPath.includes('ptw')) return 'Opening permit controls';
    if (lowerPath.includes('emergency')) return 'Opening emergency workspace';
    if (lowerPath.includes('risk')) return 'Opening risk controls';
    if (lowerPath.includes('training')) return 'Opening training center';
    if (lowerPath.includes('dashboard')) return 'Loading command hub';
    if (lowerPath.includes('field')) return 'Switching to field mode';
    return 'Loading safety workspace';
};

const AppTransitionContext = createContext(() => {});

export const useAppTransition = () => useContext(AppTransitionContext);

export default function AppExperienceShell({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const routeKey = `${location.pathname}${location.search}`;
    const previousRouteRef = useRef(routeKey);
    const skipNextRouteEffectRef = useRef(false);
    const timersRef = useRef([]);
    const routeMotionTimerRef = useRef(null);
    const tutorialTimerRef = useRef(null);
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [overlayLabel, setOverlayLabel] = useState(getTransitionLabel(location.pathname));
    const [routeSettling, setRouteSettling] = useState(false);
    const [tutorialPrompt, setTutorialPrompt] = useState(null);

    const transitionLabel = useMemo(
        () => getTransitionLabel(location.pathname),
        [location.pathname]
    );

    const clearTransitionTimers = () => {
        timersRef.current.forEach((timerId) => clearTimeout(timerId));
        timersRef.current = [];
    };

    const clearRouteMotionTimer = () => {
        if (routeMotionTimerRef.current) {
            clearTimeout(routeMotionTimerRef.current);
            routeMotionTimerRef.current = null;
        }
    };

    const clearTutorialTimer = () => {
        if (tutorialTimerRef.current) {
            clearTimeout(tutorialTimerRef.current);
            tutorialTimerRef.current = null;
        }
    };

    const startRouteMotion = (duration = 320) => {
        clearRouteMotionTimer();
        setRouteSettling(true);
        routeMotionTimerRef.current = setTimeout(() => {
            setRouteSettling(false);
            routeMotionTimerRef.current = null;
        }, duration);
    };

    const playTransition = ({ label, action, leadMs = 110, tailMs = 220 } = {}) => {
        clearTransitionTimers();
        skipNextRouteEffectRef.current = true;
        setOverlayLabel(label || transitionLabel);
        setOverlayVisible(true);
        startRouteMotion(Math.max(leadMs + tailMs + 80, 320));

        const actionTimer = setTimeout(() => {
            try {
                if (typeof action === 'function') action();
            } catch (error) {
                console.error('Route transition action failed:', error);
                skipNextRouteEffectRef.current = false;
                setOverlayVisible(false);
            }
        }, leadMs);

        const hideTimer = setTimeout(() => {
            setOverlayVisible(false);
        }, leadMs + tailMs);

        const failSafeTimer = setTimeout(() => {
            skipNextRouteEffectRef.current = false;
            setOverlayVisible(false);
        }, Math.max(leadMs + tailMs + 900, 1400));

        timersRef.current = [actionTimer, hideTimer, failSafeTimer];
    };

    const dismissTutorialPrompt = (markSeen = true) => {
        if (tutorialPrompt && markSeen) {
            localStorage.setItem(`ohsms:tutorial-seen:${tutorialPrompt.id}`, '1');
        }
        setTutorialPrompt(null);
    };

    useEffect(() => {
        if (previousRouteRef.current === routeKey) return undefined;

        previousRouteRef.current = routeKey;
        if (skipNextRouteEffectRef.current) {
            skipNextRouteEffectRef.current = false;
            return undefined;
        }

        clearTransitionTimers();
        setOverlayLabel(transitionLabel);
        setOverlayVisible(true);
        startRouteMotion(340);

        const hideTimer = setTimeout(() => {
            setOverlayVisible(false);
        }, 220);

        return () => clearTimeout(hideTimer);
    }, [routeKey, transitionLabel]);

    useEffect(() => {
        clearTutorialTimer();

        const isAuthenticated = Boolean(
            sessionStorage.getItem('isoSession')
            || sessionStorage.getItem('fieldPortalSession')
            || sessionStorage.getItem('vendorSession')
        );

        if (!isAuthenticated) {
            setTutorialPrompt(null);
            return undefined;
        }

        const tutorial = getTutorialForPath(location.pathname);
        if (!tutorial) {
            setTutorialPrompt(null);
            return undefined;
        }

        if (localStorage.getItem(`ohsms:tutorial-seen:${tutorial.id}`) === '1') {
            setTutorialPrompt(null);
            return undefined;
        }

        tutorialTimerRef.current = setTimeout(() => {
            setTutorialPrompt(tutorial);
            tutorialTimerRef.current = null;
        }, 260);

        return () => clearTutorialTimer();
    }, [location.pathname]);

    useEffect(() => () => {
        clearTransitionTimers();
        clearRouteMotionTimer();
        clearTutorialTimer();
    }, []);

    return (
        <AppTransitionContext.Provider value={playTransition}>
            <div className="safety-ambient-layer" aria-hidden="true">
                {STICKERS.map((sticker) => (
                    <img
                        key={sticker.src}
                        src={sticker.src}
                        alt={sticker.alt}
                        className={sticker.className}
                    />
                ))}
                <div className="ambient-grid-glow"></div>
            </div>

            <div className={`page-route-shell ${routeSettling ? 'is-settling' : ''}`}>
                {children}
            </div>

            <div className={`route-transition-overlay ${overlayVisible ? 'is-visible' : ''}`} aria-hidden={!overlayVisible}>
                <div className="route-transition-card">
                    <img
                        src="/safety-transition.svg"
                        alt="Safety transition animation"
                        className="route-transition-image"
                    />
                    <div>
                        <p className="route-transition-kicker">Safety System Transfer</p>
                        <p className="route-transition-label">{overlayLabel}</p>
                    </div>
                </div>
            </div>

            {tutorialPrompt && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
                    <div className="command-panel relative w-full max-w-4xl rounded-[2rem] p-5 sm:p-6">
                        <button
                            type="button"
                            onClick={() => dismissTutorialPrompt(true)}
                            className="myth-outline-button absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full"
                        >
                            <i className="fas fa-times"></i>
                        </button>

                        <div className="pr-12">
                            <p className="myth-kicker">Module Tutorial</p>
                            <h2 className="mt-2 text-3xl text-white">{tutorialPrompt.title}</h2>
                            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--myth-muted)]">
                                {tutorialPrompt.description}
                            </p>
                            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--myth-gold)]">
                                This prompt appears once for this module.
                            </p>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-[1.6rem] border border-[rgba(242,201,120,0.08)] bg-black">
                            <video
                                key={tutorialPrompt.videoUrl}
                                controls
                                preload="metadata"
                                className="h-auto w-full"
                                src={tutorialPrompt.videoUrl}
                            />
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => dismissTutorialPrompt(true)}
                                className="myth-button myth-button-primary rounded-2xl px-5 py-3 text-xs"
                            >
                                Continue to Module
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    dismissTutorialPrompt(true);
                                    playTransition({
                                        label: 'Opening Tutorials',
                                        action: () => navigate('/tutorials')
                                    });
                                }}
                                className="myth-outline-button rounded-2xl px-5 py-3 text-xs"
                            >
                                Open Tutorial Library
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppTransitionContext.Provider>
    );
}
