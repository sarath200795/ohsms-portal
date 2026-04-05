import React, { useEffect, useMemo, useRef, useState } from 'react';
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

export default function AppExperienceShell({ children }) {
    const location = useLocation();
    const routeKey = `${location.pathname}${location.search}`;
    const previousRouteRef = useRef(routeKey);
    const [overlayVisible, setOverlayVisible] = useState(false);

    const transitionLabel = useMemo(
        () => getTransitionLabel(location.pathname),
        [location.pathname]
    );

    useEffect(() => {
        if (previousRouteRef.current === routeKey) return undefined;

        previousRouteRef.current = routeKey;
        setOverlayVisible(true);

        const timer = setTimeout(() => {
            setOverlayVisible(false);
        }, 700);

        return () => clearTimeout(timer);
    }, [routeKey]);

    return (
        <>
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

            <div key={routeKey} className="page-route-shell">
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
                        <p className="route-transition-label">{transitionLabel}</p>
                    </div>
                </div>
            </div>
        </>
    );
}
