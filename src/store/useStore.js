import { create } from 'zustand';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { haveModulesChanged } from '../utils/permissions';
import { normalizeSessionData, normalizeUserStatus, writeStoredSession } from '../utils/session';

const useStore = create((set, get) => ({
    session: null,
    orgData: null,
    isDataLoading: true,    // Only true on the very first app load
    listenerActive: false,  // Prevents duplicate Firebase connections

    // 1. Call this when any protected page loads
    initializeSession: (sess) => {
        const normalizedSession = normalizeSessionData(sess);
        set({ session: normalizedSession });

        if (sess && JSON.stringify(sess) !== JSON.stringify(normalizedSession)) {
            writeStoredSession(normalizedSession);
        }
        
        // If we are already connected to Firebase, don't do it again! (This makes navigation instant)
        if (get().listenerActive || !normalizedSession?.orgId) return;

        set({ listenerActive: true, isDataLoading: true });

        if (!normalizedSession.uid) {
            set({ listenerActive: false, isDataLoading: false });
            return;
        }

        const userRef = ref(rtdb, `organizations/${normalizedSession.orgId}/users/${normalizedSession.uid}`);
        
        // Keep the signed-in user's permission snapshot fresh without reading the full organization tree.
        onValue(userRef, (snap) => {
            if (snap.exists()) {
                const currentSession = get().session;
                const liveUser = snap.val();

                if (currentSession && liveUser) {
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
                        passwordUpdatedAt: liveUser.passwordUpdatedAt || currentSession.passwordUpdatedAt || ''
                    });

                    const statusChanged = normalizeUserStatus(liveUser.status || '') !== normalizeUserStatus(currentSession.status || '');
                    const modulesChanged = haveModulesChanged(currentSession.accessibleModules || [], refreshedSession.accessibleModules || []);
                    const sitesChanged = JSON.stringify(currentSession.accessibleSites || []) !== JSON.stringify(refreshedSession.accessibleSites || []);
                    const roleChanged = String(currentSession.role || '') !== String(refreshedSession.role || '');
                    const assignedSiteChanged = String(currentSession.assignedSite || '') !== String(refreshedSession.assignedSite || '');
                    const passwordPolicyChanged = Boolean(currentSession.mustChangePassword) !== Boolean(refreshedSession.mustChangePassword)
                        || Boolean(currentSession.temporaryPasswordIssued) !== Boolean(refreshedSession.temporaryPasswordIssued)
                        || String(currentSession.passwordUpdatedAt || '') !== String(refreshedSession.passwordUpdatedAt || '');

                    if (statusChanged || modulesChanged || sitesChanged || roleChanged || assignedSiteChanged || passwordPolicyChanged) {
                        const nextSession = refreshedSession;
                        writeStoredSession(nextSession);
                        set({ session: nextSession });
                    }
                }

                set({ orgData: { currentUser: liveUser }, isDataLoading: false });
            } else {
                set({ orgData: null, isDataLoading: false });
            }
        }, (error) => {
            console.error("Global DB Listener Error:", error);
            set({ isDataLoading: false });
        });
    },

    // 2. Call this on Logout
    clearSession: () => {
        const sess = get().session;
        if (sess?.orgId && sess?.uid) {
            off(ref(rtdb, `organizations/${sess.orgId}/users/${sess.uid}`)); // Sever the DB connection securely
        }
        set({ session: null, orgData: null, isDataLoading: true, listenerActive: false });
    }
}));

export default useStore;
