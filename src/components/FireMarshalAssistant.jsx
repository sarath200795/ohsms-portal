// ─────────────────────────────────────────────────────────────────────────────
// Fire Marshal "Sam" — global safety assistant for OHSMS.
//
// Ported from sarath200795/fire-marshal/src/components/Assistant.jsx.
// Same exact SVG character (hard hat + hi-vis vest), same animation modes
// (idle / walk / think / scratch / wave / search / sleep), same wander
// behaviour, same draggable bubble, same per-page tips.
//
// Differences from the original:
//  • No three.js / 3D avatar fallback — we stick with the 2D SVG Sam.
//  • Per-page guides come from utils/fireMarshalAssistant.js (OHSMS modules).
//  • No "guided tour" auto-walk — OHSMS has too many module shapes for one
//    canned tour; user can ask Sam for help on each page instead.
//  • Live counts come from useFireMarshalContext() rather than a FleetContext.
// ─────────────────────────────────────────────────────────────────────────────

import React, { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion, useMotionValue, animate } from 'framer-motion';

import { answer, pageGuide, suggestedQuestions } from '../utils/fireMarshalAssistant.js';
import { useFireMarshalContext } from '../hooks/useFireMarshalContext.jsx';
import { readStoredSession } from '../utils/session.js';

// 3D character is heavy (three.js) — load it only when Sam mounts.
const FireMarshalCharacter3D = lazy(() => import('./FireMarshalCharacter3D.jsx'));

// If WebGL/three fails to load (or throws), fall back to the 2D SVG Sam.
class AvatarBoundary extends Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() { /* swallow — fallback handles it */ }
    render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

const loop = (d) => ({ duration: d, repeat: Infinity, ease: 'easeInOut' });
const IDLE_SLEEP_MS = 3 * 60 * 1000;
const POST_LOGIN_QUIET_MS = 30_000; // Sam holds position for 30s after login before wandering.
const INITIAL_LEFT_X = 16;          // Spawn near the left edge so the callout has room to render.

// ── Sam's colours (verbatim from fire-marshal) ───────────────────────────────
const SKIN = '#e8b48f', SKIN_D = '#c98b62';
const HAT  = '#f4b400', HAT_D  = '#c98a00';
const VEST = '#e11d1d', VEST_D = '#9c1414';
const STRIPE = '#fde047';
const TROUSER = '#1e293b', SHOE = '#0b1220';

// ── 2D SVG character with 7 animation modes ──────────────────────────────────
function Character({ mode = 'idle' }) {
    const walking = mode === 'walk';
    const sleeping = mode === 'sleep';

    const legL = walking ? { rotate: [0, 24, 0, -24, 0] } : { rotate: 0 };
    const legR = walking ? { rotate: [0, -24, 0, 24, 0] } : { rotate: 0 };
    const legT = walking ? loop(0.6) : { duration: 0.3 };

    let uAL = { rotate: 0 }, fAL = { rotate: 0 }, uALT = { duration: 0.4 }, fALT = { duration: 0.4 };
    let uAR = { rotate: 0 }, fAR = { rotate: 0 }, uART = { duration: 0.4 }, fART = { duration: 0.4 };
    let head = { rotate: 0 }, headT = { duration: 0.4 };

    if (sleeping) {
        uAL = { rotate: 4 }; uAR = { rotate: -4 }; head = { rotate: 12 };
    } else if (walking) {
        uAL = { rotate: [0, -18, 0, 18, 0] }; uALT = loop(0.6);
        uAR = { rotate: [0, 18, 0, -18, 0] }; uART = loop(0.6);
    } else if (mode === 'think') {
        uAR = { rotate: -42 }; fAR = { rotate: -95 }; head = { rotate: -6 };
    } else if (mode === 'scratch') {
        uAR = { rotate: -150 }; fAR = { rotate: [-34, -52, -34] }; fART = loop(0.4); head = { rotate: -4 };
    } else if (mode === 'wave') {
        uAR = { rotate: -150 }; fAR = { rotate: [-12, 22, -12] }; fART = loop(0.5);
    } else {
        uAL = { rotate: [0, 3, 0] }; uALT = loop(3.2);
        uAR = { rotate: [0, -3, 0] }; uART = loop(3.2);
        if (mode === 'search') { uAR = { rotate: -34 }; fAR = { rotate: -34 }; head = { rotate: [-9, 9, -9] }; headT = loop(1.6); }
    }

    const bob = walking ? { y: [0, -2, 0] } : { y: [0, -1.2, 0] };
    const bobT = walking ? loop(0.6) : loop(sleeping ? 3.6 : 2.8);
    const blink = { scaleY: [1, 1, 0.1, 1] };
    const blinkT = { duration: 0.32, times: [0, 0.85, 0.92, 1], repeat: Infinity, repeatDelay: 3 };

    const Arm = ({ shoulder, elbow, upper, fore, uT, fT }) => (
        <motion.g style={{ transformOrigin: `${shoulder[0]}px ${shoulder[1]}px` }} animate={upper} transition={uT}>
            <rect x={shoulder[0] - 2.75} y={shoulder[1]} width="5.5" height={elbow[1] - shoulder[1]} rx="2.7" fill={VEST} stroke={VEST_D} strokeWidth="0.7" />
            <motion.g style={{ transformOrigin: `${elbow[0]}px ${elbow[1]}px` }} animate={fore} transition={fT}>
                <rect x={elbow[0] - 2.75} y={elbow[1]} width="5.5" height="14" rx="2.7" fill={VEST} stroke={VEST_D} strokeWidth="0.7" />
                <circle cx={elbow[0]} cy={elbow[1] + 16} r="3" fill={SKIN} stroke={SKIN_D} strokeWidth="0.6" />
            </motion.g>
        </motion.g>
    );

    return (
        <svg width="62" height="116" viewBox="0 0 64 120" fill="none" aria-hidden="true">
            <motion.g animate={bob} transition={bobT}>
                <motion.g style={{ transformOrigin: '28px 74px' }} animate={legL} transition={legT}>
                    <rect x="24.5" y="74" width="6.5" height="32" rx="2.4" fill={TROUSER} />
                    <rect x="22.5" y="104" width="11" height="6.5" rx="3" fill={SHOE} />
                </motion.g>
                <motion.g style={{ transformOrigin: '36px 74px' }} animate={legR} transition={legT}>
                    <rect x="33" y="74" width="6.5" height="32" rx="2.4" fill="#0f172a" />
                    <rect x="30.5" y="104" width="11" height="6.5" rx="3" fill={SHOE} />
                </motion.g>

                <rect x="22" y="33" width="20" height="42" rx="6" fill="#f3e7df" />
                <path d="M23 41h7l2 5 2-5h7v33a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3z" fill={VEST} stroke={VEST_D} strokeWidth="0.8" />
                <rect x="25" y="58" width="14" height="2.6" fill={STRIPE} />
                <rect x="27.5" y="44" width="2.4" height="31" fill={STRIPE} />
                <rect x="34.1" y="44" width="2.4" height="31" fill={STRIPE} />
                <rect x="29" y="29" width="6" height="6" fill={SKIN} />

                <Arm shoulder={[24, 39]} elbow={[24, 54]} upper={uAL} fore={fAL} uT={uALT} fT={fALT} />
                <Arm shoulder={[40, 39]} elbow={[40, 54]} upper={uAR} fore={fAR} uT={uART} fT={fART} />

                <motion.g style={{ transformOrigin: '32px 31px' }} animate={head} transition={headT}>
                    <circle cx="23.5" cy="23" r="2" fill={SKIN} stroke={SKIN_D} strokeWidth="0.5" />
                    <circle cx="40.5" cy="23" r="2" fill={SKIN} stroke={SKIN_D} strokeWidth="0.5" />
                    <circle cx="32" cy="22" r="9.2" fill={SKIN} stroke={SKIN_D} strokeWidth="0.6" />
                    <path d="M23.5 20c0-3 2-5 4-5l-1 6z" fill="#4a3526" />
                    <path d="M40.5 20c0-3-2-5-4-5l1 6z" fill="#4a3526" />
                    {sleeping ? (
                        <>
                            <path d="M27 22.4q1.6 1.4 3.2 0" stroke={SKIN_D} strokeWidth="0.9" strokeLinecap="round" fill="none" />
                            <path d="M33.8 22.4q1.6 1.4 3.2 0" stroke={SKIN_D} strokeWidth="0.9" strokeLinecap="round" fill="none" />
                        </>
                    ) : (
                        <motion.g style={{ transformOrigin: '32px 22px' }} animate={blink} transition={blinkT}>
                            <circle cx="28.6" cy="22" r="1.5" fill="#fff" /><circle cx="29" cy="22.2" r="0.9" fill="#1f2937" />
                            <circle cx="35.4" cy="22" r="1.5" fill="#fff" /><circle cx="35.8" cy="22.2" r="0.9" fill="#1f2937" />
                        </motion.g>
                    )}
                    <path d="M27 18.6c1-0.6 2.4-0.6 3.4 0" stroke="#4a3526" strokeWidth="0.8" strokeLinecap="round" />
                    <path d="M34 18.6c1-0.6 2.4-0.6 3.4 0" stroke="#4a3526" strokeWidth="0.8" strokeLinecap="round" />
                    {!sleeping && <path d="M29 26.5c1.6 1.4 4.4 1.4 6 0" stroke={SKIN_D} strokeWidth="0.9" strokeLinecap="round" fill="none" />}
                    <path d="M21 17a11 9.5 0 0 1 22 0z" fill={HAT} />
                    <rect x="19" y="15.6" width="26" height="2.8" rx="1.4" fill={HAT_D} />
                    <rect x="31" y="8.6" width="2" height="7" fill={HAT_D} />
                </motion.g>

                {mode === 'think' && (
                    <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0.2, 1, 0.2] }} transition={loop(1.4)}>
                        <circle cx="46" cy="16" r="1.4" fill="#94a3b8" />
                        <circle cx="50" cy="11" r="2"   fill="#94a3b8" />
                        <circle cx="54" cy="6"  r="2.6" fill="#94a3b8" />
                    </motion.g>
                )}
                {sleeping && (
                    <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0], y: [0, -10] }} transition={loop(2.2)} fill="#94a3b8" fontFamily="sans-serif" fontWeight="800">
                        <text x="44" y="14" fontSize="6">z</text>
                        <text x="48" y="9"  fontSize="8">Z</text>
                    </motion.g>
                )}
            </motion.g>
        </svg>
    );
}

function Bubble({ from, children }) {
    const mine = from === 'user';
    return (
        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
                className="max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm"
                style={{
                    background: mine ? 'var(--myth-ember, #f97316)' : 'rgba(248,250,252,0.95)',
                    color: mine ? '#fff' : 'var(--myth-ink, #0f172a)',
                }}
            >
                {children}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FireMarshalAssistant() {
    const location = useLocation();
    const navigate = useNavigate();
    const reduced = useReducedMotion();
    const fmContext = useFireMarshalContext();

    // Per-user storage namespace — falls back to "anon" for public/landing pages.
    const session = readStoredSession();
    const uid = session?.uid || 'anon';

    const [enabled, setEnabled] = useState(() => ls.get(`fm:guide:enabled:${uid}`) !== '0');
    const [open, setOpen]     = useState(false);
    const [tip, setTip]       = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput]   = useState('');
    const scrollRef = useRef(null);

    const [mode, setMode]     = useState('idle');
    const [facing, setFacing] = useState(-1);
    const [asleep, setAsleep] = useState(false);
    const [pinned, setPinned] = useState(() => ls.get(`fm:guide:pinned:${uid}`) === '1');
    // bubbleSide reflects which side of Sam the callout / chat panel should
    // anchor to so they never overflow off-screen when Sam is dragged near a
    // viewport edge. 'right' = bubble to Sam's right (default, Sam on left);
    // 'left'  = bubble to Sam's left (Sam dragged to the right half).
    const [bubbleSide, setBubbleSide] = useState('right');

    // Restore drag position from localStorage, but clamp into the current
    // viewport so a position saved on a wider monitor doesn't render Sam
    // off-screen with no recovery path.
    const savedPos = useMemo(() => {
        try { return JSON.parse(ls.get(`fm:guide:pos:${uid}`) || 'null'); }
        catch { return null; }
    }, [uid]);
    const initialPos = useMemo(() => {
        const vw = typeof window === 'undefined' ? 1000 : window.innerWidth;
        const vh = typeof window === 'undefined' ? 800  : window.innerHeight;
        // Container is position:fixed bottom:16 left:0; mx is the x translate
        // and my is the y translate (negative = up from baseline). For fresh
        // sessions Sam spawns on the LEFT so the callout bubble (260px wide,
        // anchored to his right) has room to render fully in the viewport.
        const safeX = Math.min(Math.max(savedPos?.x ?? INITIAL_LEFT_X, 0), Math.max(0, vw - 96));
        const safeY = Math.min(Math.max(savedPos?.y ?? 0, -(vh - 140)), 0);
        return { x: safeX, y: safeY };
    }, [savedPos]);
    const mx = useMotionValue(initialPos.x);
    const my = useMotionValue(initialPos.y);

    // If the viewport shrinks (rotation / resize) and Sam ends up out of
    // bounds, snap him back into view.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const reclamp = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const clampedX = Math.min(Math.max(mx.get(), 0), Math.max(0, vw - 96));
            const clampedY = Math.min(Math.max(my.get(), -(vh - 140)), 0);
            if (clampedX !== mx.get()) mx.set(clampedX);
            if (clampedY !== my.get()) my.set(clampedY);
        };
        window.addEventListener('resize', reclamp);
        window.addEventListener('orientationchange', reclamp);
        return () => {
            window.removeEventListener('resize', reclamp);
            window.removeEventListener('orientationchange', reclamp);
        };
    }, [mx, my]);

    const lastRef    = useRef(Date.now());
    const asleepRef  = useRef(false);
    useEffect(() => { asleepRef.current = asleep; }, [asleep]);

    const guide = useMemo(() => pageGuide(location.pathname), [location.pathname]);
    const chips = useMemo(() => suggestedQuestions(location.pathname), [location.pathname]);
    const ctx = useMemo(() => ({ ...fmContext, pathname: location.pathname }), [fmContext, location.pathname]);

    // Idle → sleep after 3 minutes; any activity wakes Sam.
    useEffect(() => {
        if (!enabled) return undefined;
        const bump = () => { lastRef.current = Date.now(); if (asleepRef.current) setAsleep(false); };
        const evs = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
        const iv = setInterval(() => { if (Date.now() - lastRef.current > IDLE_SLEEP_MS) setAsleep(true); }, 15000);
        return () => {
            evs.forEach((e) => window.removeEventListener(e, bump));
            clearInterval(iv);
        };
    }, [enabled]);

    // Movement / pose state machine — Sam wanders unless open/tipped/pinned.
    //
    // After login Sam holds on the left for POST_LOGIN_QUIET_MS so the welcome
    // callout has time to be read. The 'loginAt' timestamp is keyed per uid in
    // sessionStorage — survives route changes within the tab, resets per fresh
    // login.
    useEffect(() => {
        if (!enabled) return undefined;
        if (asleep)  { setMode('sleep'); return undefined; }
        if (open) {
            // Chat open: Sam waves but stays in place — don't tow him across
            // the viewport (was causing the chat panel to render off-screen
            // when Sam was already near the right edge).
            setMode('wave');
            return undefined;
        }
        if (tip) {
            // Tip showing: Sam pauses where he is so the callout (anchored to
            // his right side) stays in view. Previously he slid to the right
            // edge here, which pushed the 260px-wide bubble off-screen.
            setMode('idle');
            return undefined;
        }
        if (reduced || pinned) { setMode('idle'); return undefined; }

        // Compute remaining post-login quiet time.
        let loginAt = 0;
        try {
            const stored = sessionStorage.getItem(`fm:guide:loginAt:${uid}`);
            loginAt = stored ? Number(stored) : 0;
            if (!loginAt && session?.uid) {
                loginAt = Date.now();
                sessionStorage.setItem(`fm:guide:loginAt:${uid}`, String(loginAt));
            }
        } catch { /* sessionStorage unavailable — fall through with loginAt=0 */ }
        const elapsed = loginAt ? Date.now() - loginAt : POST_LOGIN_QUIET_MS;
        const initialDelay = Math.max(POST_LOGIN_QUIET_MS - elapsed, 1400);

        let alive = true;
        let timer;
        let anim;
        const rand = (a, b) => a + Math.random() * (b - a);
        const step = () => {
            if (!alive) return;
            const from = mx.get();
            const maxX = Math.max(90, (window.innerWidth || 1000) - 120);
            const target = Math.round(rand(20, maxX));
            const dur = Math.min(6, Math.max(1.2, Math.abs(target - from) / 110));
            setFacing(target >= from ? 1 : -1);
            setMode('walk');
            anim = animate(mx, target, { duration: dur, ease: 'linear' });
            timer = setTimeout(() => {
                if (!alive) return;
                setMode(['idle', 'search', 'think', 'scratch', 'wave'][Math.floor(Math.random() * 5)]);
                timer = setTimeout(step, rand(3200, 6000));
            }, dur * 1000 + 150);
        };
        timer = setTimeout(step, initialDelay);
        return () => { alive = false; clearTimeout(timer); if (anim?.stop) anim.stop(); };
    }, [enabled, asleep, open, tip, reduced, pinned, mx, my, uid, session?.uid]);

    // First-load greeting + per-page tip bubble.
    //
    // Greeting stays on-screen until the user dismisses it (or opens chat) —
    // it pairs with the 30-second post-login quiet window in the movement
    // effect, so the callout has time to actually be read.
    //
    // Both flags are keyed on `loginAt` so a fresh login always re-shows the
    // callouts, but within a single login the user isn't nagged by tips they
    // already dismissed. `loginAt` is set by the movement effect; if it hasn't
    // been set yet (very first tick after mount), we set it here so the
    // greeting still fires.
    useEffect(() => {
        if (!enabled || open) return undefined;

        let loginAt;
        try {
            loginAt = sessionStorage.getItem(`fm:guide:loginAt:${uid}`);
            if (!loginAt) {
                loginAt = String(Date.now());
                sessionStorage.setItem(`fm:guide:loginAt:${uid}`, loginAt);
            }
        } catch {
            loginAt = 'no-storage';
        }

        const greetKey = `fm:guide:greeted:${uid}:${loginAt}`;
        const greeted = (() => { try { return sessionStorage.getItem(greetKey) === '1'; } catch { return false; } })();
        if (!greeted) {
            const t = setTimeout(() => {
                setTip({ greeting: true, title: "Hi! I'm Sam 🧯", text: "Tap me anytime — I'll explain any module and tell you what needs attention. Drag me around, pin me, or hide me." });
                try { sessionStorage.setItem(greetKey, '1'); } catch { /* ignore */ }
            }, 1200);
            return () => clearTimeout(t);
        }

        // Per-page tip. Also keyed on loginAt so new logins re-show the guide
        // for each page; within a single login, only shown once per page.
        const seenKey = `fm:guide:tip:${uid}:${loginAt}:${guide.title}`;
        const alreadySeen = (() => { try { return sessionStorage.getItem(seenKey) === '1'; } catch { return false; } })();
        if (!alreadySeen) {
            const t = setTimeout(() => setTip({ title: guide.title, text: guide.tips[0] }), 900);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [location.pathname, open, uid, guide, enabled]);

    // Persist drag position so Sam doesn't jump back on every reload. Also
    // track which half of the viewport Sam is on so the callout can flip
    // sides to stay visible.
    useEffect(() => {
        const recomputeSide = () => {
            const vw = typeof window === 'undefined' ? 1000 : window.innerWidth;
            // Account for bubble width (~260) + gap (~68). If Sam's right
            // edge + bubble would overflow, flip the bubble to Sam's left.
            const overflowsRight = mx.get() + 96 + 268 > vw;
            setBubbleSide((cur) => (overflowsRight ? 'left' : 'right') === cur ? cur : (overflowsRight ? 'left' : 'right'));
        };
        const unsubX = mx.on('change', () => { save(); recomputeSide(); });
        const unsubY = my.on('change', save);
        function save() {
            try { ls.set(`fm:guide:pos:${uid}`, JSON.stringify({ x: mx.get(), y: my.get() })); }
            catch { /* ignore */ }
        }
        recomputeSide();
        window.addEventListener('resize', recomputeSide);
        return () => {
            unsubX();
            unsubY();
            window.removeEventListener('resize', recomputeSide);
        };
    }, [mx, my, uid]);

    // Auto-scroll chat to bottom.
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages.length, open]);

    const send = (text) => {
        const q = text.trim();
        if (!q) return;
        setMessages((prev) => [...prev, { from: 'user', text: q }]);
        setInput('');
        setMode('think');
        const reply = answer(q, ctx);
        setTimeout(() => {
            setMessages((prev) => [...prev, { from: 'sam', text: reply.text }]);
            setMode('wave');
            if (reply.action?.type === 'navigate' && reply.action.to) {
                setTimeout(() => navigate(reply.action.to), 700);
            }
        }, 260);
    };

    const dismissTip = () => {
        if (tip?.title) {
            // Mirror the read side — sessionStorage keyed on loginAt so a
            // fresh login re-shows the tip, but within the login it stays
            // dismissed. Also stamp the legacy localStorage key so users
            // who have never logged out don't get every per-page tip a
            // second time before the sessionStorage key catches up.
            let loginAt = 'no-storage';
            try { loginAt = sessionStorage.getItem(`fm:guide:loginAt:${uid}`) || 'no-storage'; } catch { /* ignore */ }
            try { sessionStorage.setItem(`fm:guide:tip:${uid}:${loginAt}:${tip.title}`, '1'); } catch { /* ignore */ }
        }
        setTip(null);
    };

    const togglePinned = () => {
        const next = !pinned;
        setPinned(next);
        ls.set(`fm:guide:pinned:${uid}`, next ? '1' : '0');
    };

    const disable = () => {
        setEnabled(false);
        ls.set(`fm:guide:enabled:${uid}`, '0');
    };

    if (!enabled) {
        // Subtle re-enable handle so user can bring Sam back.
        return (
            <button
                type="button"
                onClick={() => { setEnabled(true); ls.set(`fm:guide:enabled:${uid}`, '1'); }}
                className="fixed bottom-4 right-4 z-[200] flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg"
                style={{ background: 'var(--myth-ember, #f97316)' }}
                title="Bring Sam back"
                aria-label="Bring Sam back"
            >
                🧯
            </button>
        );
    }

    return (
        <motion.div
            drag
            dragMomentum={false}
            dragElastic={0.04}
            style={{ x: mx, y: my, position: 'fixed', bottom: 16, left: 0, zIndex: 200, touchAction: 'none' }}
            className="select-none"
        >
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-label="Open Sam — safety assistant"
                    className="block cursor-grab active:cursor-grabbing"
                    style={{ background: 'transparent', border: 'none', padding: 0 }}
                >
                    <AvatarBoundary fallback={<Character mode={mode} />}>
                        <Suspense fallback={<Character mode={mode} />}>
                            <FireMarshalCharacter3D mode={mode} facing={facing} size={78} />
                        </Suspense>
                    </AvatarBoundary>
                </button>
            </div>

            {/* Per-page tip bubble — flips to Sam's left when he's on the
                right half of the viewport so the 260px-wide callout stays
                on-screen. */}
            <AnimatePresence>
                {tip && !open && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={`absolute bottom-[110px] w-[260px] rounded-2xl border p-3 text-sm shadow-xl ${bubbleSide === 'right' ? 'left-[68px]' : 'right-[68px]'}`}
                        style={{
                            background: '#ffffff',
                            borderColor: 'rgba(15,23,42,0.08)',
                            color: 'var(--myth-ink, #0f172a)',
                        }}
                    >
                        <div className="mb-1 flex items-start justify-between gap-2">
                            <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--myth-ember, #f97316)' }}>
                                {tip.title}
                            </p>
                            <button
                                type="button"
                                onClick={dismissTip}
                                className="text-xs text-slate-400 hover:text-slate-700"
                                aria-label="Dismiss tip"
                            >
                                ✕
                            </button>
                        </div>
                        <p className="leading-snug">{tip.text}</p>
                        <button
                            type="button"
                            onClick={() => { dismissTip(); setOpen(true); }}
                            className="mt-2 text-xs font-semibold underline"
                            style={{ color: 'var(--myth-ember, #f97316)' }}
                        >
                            Ask Sam →
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0,  scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.98 }}
                        className={`absolute bottom-[110px] flex w-[340px] max-w-[88vw] flex-col rounded-2xl border shadow-2xl ${bubbleSide === 'right' ? 'left-[68px]' : 'right-[68px]'}`}
                        style={{
                            background: '#ffffff',
                            borderColor: 'rgba(15,23,42,0.08)',
                            color: 'var(--myth-ink, #0f172a)',
                            maxHeight: '70vh',
                        }}
                    >
                        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
                            <div className="flex items-center gap-2">
                                <span className="text-base">🧯</span>
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--myth-ember, #f97316)' }}>Sam</p>
                                    <p className="text-[11px] text-slate-500">{guide.title}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={togglePinned}
                                    className="text-xs text-slate-500 hover:text-slate-800"
                                    title={pinned ? 'Unpin' : 'Pin (stop wandering)'}
                                >
                                    {pinned ? '📍' : '📌'}
                                </button>
                                <button
                                    type="button"
                                    onClick={disable}
                                    className="text-xs text-slate-500 hover:text-slate-800"
                                    title="Hide Sam"
                                >
                                    🙈
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="text-xs text-slate-500 hover:text-slate-800"
                                    title="Close"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3" style={{ minHeight: 140 }}>
                            {messages.length === 0 && (
                                <Bubble from="sam">
                                    {guide.tips[0]}
                                </Bubble>
                            )}
                            {messages.map((m, i) => (
                                <Bubble key={i} from={m.from}>{m.text}</Bubble>
                            ))}
                        </div>

                        {chips.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 border-t px-3 py-2" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
                                {chips.map((q) => (
                                    <button
                                        key={q}
                                        type="button"
                                        onClick={() => send(q)}
                                        className="rounded-full border px-2.5 py-1 text-[11px]"
                                        style={{ borderColor: 'rgba(15,23,42,0.12)', color: 'var(--myth-ink, #0f172a)' }}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}

                        <form
                            className="flex items-center gap-2 border-t px-3 py-2"
                            style={{ borderColor: 'rgba(15,23,42,0.06)' }}
                            onSubmit={(e) => { e.preventDefault(); send(input); }}
                        >
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask Sam…"
                                className="flex-1 rounded-full border px-3 py-1.5 text-sm outline-none"
                                style={{ borderColor: 'rgba(15,23,42,0.12)' }}
                            />
                            <button
                                type="submit"
                                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                                style={{ background: 'var(--myth-ember, #f97316)' }}
                            >
                                Send
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
