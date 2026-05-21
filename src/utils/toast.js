// Lightweight, dependency-free toast/notification manager.
//
// Why this exists: the app historically used ~333 native `alert()` calls for
// user feedback. Native alerts are blocking, unbranded, easy to miss, and feel
// broken on mobile. `installAlertBridge()` reroutes every `alert()` to a
// non-blocking toast with zero per-call-site edits, and is fully reversible via
// `restoreNativeAlert()`. New code should call `showToast()` directly.

let listeners = new Set();
let toasts = [];
let idSeq = 0;

const emit = () => {
    listeners.forEach((listener) => {
        try {
            listener(toasts);
        } catch {
            // a broken listener must not break the emitter
        }
    });
};

export const subscribeToasts = (listener) => {
    listeners.add(listener);
    listener(toasts);
    return () => {
        listeners.delete(listener);
    };
};

export const dismissToast = (id) => {
    toasts = toasts.filter((toast) => toast.id !== id);
    emit();
};

export const clearToasts = () => {
    toasts = [];
    emit();
};

// Best-effort severity inference from the message text so legacy `alert()`
// strings still get sensible colour/icon treatment.
const inferType = (message) => {
    const text = String(message || '').toLowerCase();
    if (/(fail|error|invalid|denied|unable|not allowed|wrong|cannot|can't|could not|security|must be|required)/.test(text)) {
        return 'error';
    }
    if (/(success|saved|updated|created|added|sent|approved|completed|complete|deleted|removed|generated)/.test(text)) {
        return 'success';
    }
    if (/(pending|please wait|warning|expire|expiring|overdue|due|reminder|deactivat)/.test(text)) {
        return 'warning';
    }
    return 'info';
};

export const showToast = (message, options = {}) => {
    const text = String(message ?? '').trim();
    if (!text) return undefined;

    const type = options.type || inferType(text);
    const duration = options.duration ?? (type === 'error' ? 7000 : 4200);
    const id = (idSeq += 1);

    // Cap visible toasts so a burst can't flood the screen.
    toasts = [...toasts, { id, text, type }].slice(-5);
    emit();

    if (duration > 0 && typeof window !== 'undefined') {
        window.setTimeout(() => dismissToast(id), duration);
    }

    return id;
};

// --- Native alert() bridge (reversible) ---
let nativeAlert = null;

export const installAlertBridge = () => {
    if (typeof window === 'undefined' || nativeAlert) return;
    nativeAlert = window.alert.bind(window);
    window.alert = (message) => {
        showToast(message);
    };
};

export const restoreNativeAlert = () => {
    if (typeof window !== 'undefined' && nativeAlert) {
        window.alert = nativeAlert;
        nativeAlert = null;
    }
};
