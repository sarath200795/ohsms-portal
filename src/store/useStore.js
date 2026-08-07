import { create } from 'zustand';
import { dbSubscribe } from '../services/db/index.js';
import { normalizeSessionPermissions, isSessionActive } from '../utils/permissions.js';
import { writeStoredSession, clearStoredSession } from '../utils/session.js';

let unsubscribeUser = null;

/**
 * Live session store. `initializeSession` opens a realtime listener on the
 * user's profile node so permission changes apply without re-login; a
 * deactivated account is signed out immediately.
 */
const useStore = create((set, get) => ({
  session: null,

  initializeSession(session) {
    if (!isSessionActive(session)) return;
    const current = get().session;
    if (current?.uid === session.uid && unsubscribeUser) {
      return; // already live for this user
    }
    unsubscribeUser?.();
    set({ session });

    unsubscribeUser = dbSubscribe(
      `organizations/${session.orgId}/users/${session.uid}`,
      (profile) => {
        if (!profile || (profile.status && profile.status !== 'Active')) {
          get().clearSession();
          return;
        }
        const fresh = normalizeSessionPermissions({
          ...profile,
          uid: session.uid,
          orgId: session.orgId,
          email: profile.email || session.email,
        });
        writeStoredSession(fresh);
        set({ session: fresh });
      },
    );
  },

  clearSession() {
    unsubscribeUser?.();
    unsubscribeUser = null;
    clearStoredSession();
    set({ session: null });
  },
}));

export default useStore;
