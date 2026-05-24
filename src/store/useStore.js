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

        const unsubscribe = dbSubscribe(
            userPath,
            (liveUser) => {
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
                console.error('[store] DB subscription error:', error);
                set({ isDataLoading: false });
            }
        );

        // Store unsubscribe so clearSession can tear it down cleanly.
        set({ _unsubscribe: unsubscribe });
    },

    // ─── 2. Call on logout ────────────────────────────────────────────────
    clearSession: () => {
        const { _unsubscribe } = get();
        if (typeof _unsubscribe === 'function') _unsubscribe();
        set({ session: null, orgData: null, isDataLoading: true, listenerActive: false, _unsubscribe: null });
    },
}));

export default useStore;
