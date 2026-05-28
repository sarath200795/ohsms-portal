/**
 * Global Zustand store
 *
 * Maintains the signed-in session and keeps the current user's permissions
 * fresh via a real-time subscription (Firebase listener or REST poll,
 * depending on the active adapter).
 */

import { create } from 'zustand';
import { dbSubscribe, orgPath } from '../services/db/index.js';
import { haveModulesChanged } from '../utils/permissions';
import { normalizeSessionData, normalizeUserStatus, writeStoredSession } from '../utils/session';

const useStore = create((set, get) => ({
    session: null,
    orgData: null,
    isDataLoading: true,
    listenerActive: false,

    // ─── 1. Call on every protected page load ─────────────────────────────
    initializeSession: (sess) => {
        const normalizedSession = normalizeSessionData(sess);
        set({ session: normalizedSession });

        if (sess && JSON.stringify(sess) !== JSON.stringify(normalizedSession)) {
            writeStoredSession(normalizedSession);
        }

        // Don't open a second subscription if one is already active.
        if (get().listenerActive || !normalizedSession?.orgId) return;

        set({ listenerActive: true, isDataLoading: true });

        if (!normalizedSession.uid) {
            set({ listenerActive: false, isDataLoading: false });
            return;
        }

        // Keep the signed-in user's permission snapshot fresh.
        const userPath = orgPath(normalizedSession.orgId, 'users', normalizedSession.uid);

        // Safety net: if the WebSocket subscription never delivers a value within
        // 8 s (e.g. RTDB WebSocket blocked by CSP, network, or regional URL
        // mismatch), unblock the UI using the session data already in the store
        // so users aren't stuck on a loading screen forever.
        // The real-time listener continues running in the background — if the
        // connection is later established it will call clearTimeout (no-op once
        // the timer has already fired) and refresh data normally.
        const _fallbackTimer = setTimeout(() => {
            if (!get().isDataLoading) return; // already resolved by the subscription
            console.warn(
                '[store] dbSubscribe did not fire within 8 s — unblocking UI with ' +
                'session data. Real-time permission updates will resume once the ' +
                'WebSocket connection is established.'
            );
            const s = get().session;
            set({
                orgData: {
                    currentUser: {
                        name:                    s?.name || '',
                        role:                    s?.role || 'User',
                        status:                  s?.status || 'Active',
                        assignedSite:            s?.assignedSite || 'GLOBAL',
                        accessibleSites:         s?.accessibleSites || [],
                        accessibleModules:       s?.accessibleModules || [],
                        mustChangePassword:      Boolean(s?.mustChangePassword),
                        temporaryPasswordIssued: Boolean(s?.temporaryPasswordIssued),
                        temporaryPasswordIssuedAt: s?.temporaryPasswordIssuedAt || '',
                        passwordUpdatedAt:       s?.passwordUpdatedAt || '',
                    },
                },
                isDataLoading: false,
            });
        }, 8000);

        const unsubscribe = dbSubscribe(
            userPath,
            (liveUser) => {
                clearTimeout(_fallbackTimer);

                if (!liveUser) {
                    set({ orgData: null, isDataLoading: false });
                    return;
                }

                const currentSession = get().session;

                if (currentSession) {
                    const refreshedSession = normalizeSessionData({
                        ...currentSession,
                        name: liveUser.name || currentSession.name || currentSession.email?.split('@')[0] || 'User',
                        role: liveUser.role || currentSession.role || 'User',
                        status: liveUser.status || currentSession.status || 'Active',
                        assignedSite: liveUser.assignedSite || 'GLOBAL',
                        accessibleSites: liveUser.accessibleSites || [],
                        accessibleModules: liveUser.accessibleModules || [],
                        mustChangePassword: Boolean(liveUser.mustChangePassword),
                        temporaryPasswordIssued: Boolean(liveUser.temporaryPasswordIssued),
                        temporaryPasswordIssuedAt: liveUser.temporaryPasswordIssuedAt || '',
                        passwordUpdatedAt: liveUser.passwordUpdatedAt || currentSession.passwordUpdatedAt || '',
                    });

                    const changed =
                        normalizeUserStatus(liveUser.status || '') !== normalizeUserStatus(currentSession.status || '') ||
                        haveModulesChanged(currentSession.accessibleModules || [], refreshedSession.accessibleModules || []) ||
                        JSON.stringify(currentSession.accessibleSites || []) !== JSON.stringify(refreshedSession.accessibleSites || []) ||
                        String(currentSession.role || '') !== String(refreshedSession.role || '') ||
                        String(currentSession.assignedSite || '') !== String(refreshedSession.assignedSite || '') ||
                        Boolean(currentSession.mustChangePassword) !== Boolean(refreshedSession.mustChangePassword) ||
                        Boolean(currentSession.temporaryPasswordIssued) !== Boolean(refreshedSession.temporaryPasswordIssued) ||
                        String(currentSession.passwordUpdatedAt || '') !== String(refreshedSession.passwordUpdatedAt || '');

                    if (changed) {
                        writeStoredSession(refreshedSession);
                        set({ session: refreshedSession });
                    }
                }

                set({ orgData: { currentUser: liveUser }, isDataLoading: false });
            },
            (error) => {
                clearTimeout(_fallbackTimer);
                console.error('[store] DB subscription error:', error);
                set({ isDataLoading: false });
            }
        );

        // Store unsubscribe AND fallback timer so clearSession can tear both down.
        set({ _unsubscribe: unsubscribe, _fallbackTimer });
    },

    // ─── 2. Call on logout ────────────────────────────────────────────────
    clearSession: () => {
        const { _unsubscribe, _fallbackTimer } = get();
        if (typeof _unsubscribe === 'function') _unsubscribe();
        if (_fallbackTimer) clearTimeout(_fallbackTimer);
        set({ session: null, orgData: null, isDataLoading: true, listenerActive: false, _unsubscribe: null, _fallbackTimer: null });
    },
}));

export default useStore;
