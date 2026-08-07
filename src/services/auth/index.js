import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirebaseApp } from '../db/firebaseAdapter.js';
import { dbGet } from '../db/index.js';
import { normalizeSessionPermissions } from '../../utils/permissions.js';
import { writeStoredSession, clearStoredSession } from '../../utils/session.js';

function auth() {
  return getAuth(getFirebaseApp());
}

/**
 * Sign in, resolve the user's org via userDirectory/{uid}/orgId, load their
 * profile from organizations/{orgId}/users/{uid}, and persist a normalized
 * session. Throws with a user-facing message on any failure.
 */
async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth(), email.trim(), password);
  const { uid } = credential.user;

  const orgId = await dbGet(`userDirectory/${uid}/orgId`);
  if (!orgId) {
    await signOut(auth());
    throw new Error('Your account is not linked to an organization. Contact your administrator.');
  }

  const profile = await dbGet(`organizations/${orgId}/users/${uid}`);
  if (!profile) {
    await signOut(auth());
    throw new Error('Your user profile was not found. Contact your administrator.');
  }
  if (profile.status && profile.status !== 'Active') {
    await signOut(auth());
    throw new Error('Your account is inactive. Contact your administrator.');
  }

  const session = normalizeSessionPermissions({
    ...profile,
    uid,
    orgId,
    email: credential.user.email || profile.email,
  });
  writeStoredSession(session);
  return session;
}

async function logout() {
  clearStoredSession();
  try {
    await signOut(auth());
  } catch {
    /* already signed out or firebase unreachable — session is cleared either way */
  }
}

const authService = { login, logout };
export default authService;
