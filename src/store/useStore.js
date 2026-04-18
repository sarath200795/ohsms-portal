import { create } from 'zustand';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { haveModulesChanged, normalizeSessionPermissions } from '../utils/permissions';

const useStore = create((set, get) => ({
    session: null,
    orgData: null,          // This will hold the ENTIRE organization's data in memory
    isDataLoading: true,    // Only true on the very first app load
    listenerActive: false,  // Prevents duplicate Firebase connections

    // 1. Call this when any protected page loads
    initializeSession: (sess) => {
        const normalizedSession = normalizeSessionPermissions(sess);
        set({ session: normalizedSession });

        if (sess && JSON.stringify(sess) !== JSON.stringify(normalizedSession)) {
            sessionStorage.setItem('isoSession', JSON.stringify(normalizedSession));
        }
        
        // If we are already connected to Firebase, don't do it again! (This makes navigation instant)
        if (get().listenerActive || !normalizedSession?.orgId) return;

        set({ listenerActive: true, isDataLoading: true });

        const orgRef = ref(rtdb, `organizations/${normalizedSession.orgId}`);
        
        // Establish a SINGLE real-time connection that updates the memory quietly in the background
        onValue(orgRef, (snap) => {
            if (snap.exists()) {
                const orgData = snap.val();
                const currentSession = get().session;
                const liveUser = currentSession?.uid ? orgData?.users?.[currentSession.uid] : null;

                if (currentSession && liveUser) {
                    const refreshedSession = normalizeSessionPermissions({
                        ...currentSession,
                        name: liveUser.name || currentSession.name || currentSession.email?.split('@')[0] || 'User',
                        role: liveUser.role || currentSession.role || 'User',
                        assignedSite: liveUser.assignedSite || 'GLOBAL',
                        accessibleSites: liveUser.accessibleSites || [],
                        accessibleModules: liveUser.accessibleModules || []
                    });

                    const statusChanged = String(liveUser.status || '') !== String(currentSession.status || '');
                    const modulesChanged = haveModulesChanged(currentSession.accessibleModules || [], refreshedSession.accessibleModules || []);
                    const sitesChanged = JSON.stringify(currentSession.accessibleSites || []) !== JSON.stringify(refreshedSession.accessibleSites || []);
                    const roleChanged = String(currentSession.role || '') !== String(refreshedSession.role || '');
                    const assignedSiteChanged = String(currentSession.assignedSite || '') !== String(refreshedSession.assignedSite || '');

                    if (statusChanged || modulesChanged || sitesChanged || roleChanged || assignedSiteChanged) {
                        const nextSession = {
                            ...refreshedSession,
                            status: liveUser.status || currentSession.status || 'Active'
                        };
                        sessionStorage.setItem('isoSession', JSON.stringify(nextSession));
                        set({ session: nextSession });
                    }
                }

                set({ orgData, isDataLoading: false });
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
        if (sess?.orgId) {
            off(ref(rtdb, `organizations/${sess.orgId}`)); // Sever the DB connection securely
        }
        set({ session: null, orgData: null, isDataLoading: true, listenerActive: false });
    }
}));

export default useStore;
