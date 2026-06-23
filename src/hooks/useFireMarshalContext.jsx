// ─────────────────────────────────────────────────────────────────────────────
// Fire Marshal context
//
// Lets any page push live counts into the global FireMarshalAssistant so its
// rule-based answer engine can give specific responses ("3 open incidents",
// "2 CAPA overdue") instead of generic ones.
//
// Pages call useFireMarshalContext({ openIncidents, refillOverdue, ... }) and
// the values get merged into a single object the assistant reads. The hook
// auto-cleans on unmount so stale module data never leaks into another page.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const FireMarshalContextCtx = createContext({
    context: {},
    register: () => () => {},
});

export function FireMarshalProvider({ children }) {
    // Each registered module gets its own slot under a unique id so registering
    // twice doesn't double-count and unmounting cleans up automatically.
    const [slots, setSlots] = useState({});

    const register = useMemo(() => (id, payload) => {
        setSlots((prev) => ({ ...prev, [id]: payload || {} }));
        return () => setSlots((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    const merged = useMemo(() => Object.values(slots).reduce((acc, slot) => ({ ...acc, ...slot }), {}), [slots]);

    const value = useMemo(() => ({ context: merged, register }), [merged, register]);

    return (
        <FireMarshalContextCtx.Provider value={value}>
            {children}
        </FireMarshalContextCtx.Provider>
    );
}

export function useFireMarshalRegister(payload) {
    const ctx = useContext(FireMarshalContextCtx);
    const idRef = useRef(Math.random().toString(36).slice(2));
    const serialized = JSON.stringify(payload || {});

    useEffect(() => {
        const cleanup = ctx.register(idRef.current, payload || {});
        return cleanup;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serialized]);
}

export function useFireMarshalContext() {
    return useContext(FireMarshalContextCtx).context;
}
