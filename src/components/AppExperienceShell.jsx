import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

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
    const routeKey = `${location.pathname}${location.search}`;
    const previousRouteRef = useRef(routeKey);
    const skipNextRouteEffectRef = useRef(false);
    const timersRef = useRef([]);
    const routeMotionTimerRef = useRef(null);
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [overlayLabel, setOverlayLabel] = useState(getTransitionLabel(location.pathname));
    const [routeSettling, setRouteSettling] = useState(false);

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
            if (typeof action === 'function') action();
        }, leadMs);

        const hideTimer = setTimeout(() => {
            setOverlayVisible(false);
        }, leadMs + tailMs);

        timersRef.current = [actionTimer, hideTimer];
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

        timersRef.current = [hideTimer];

        return () => clearTransitionTimers();
    }, [routeKey, transitionLabel]);

    useEffect(() => () => {
        clearTransitionTimers();
        clearRouteMotionTimer();
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
        </AppTransitionContext.Provider>
    );
}
