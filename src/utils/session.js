import { normalizeSessionPermissions, isSessionActive } from './permissions.js';

export const SESSION_KEY = 'isoSession';

// Injectable storage so Node unit tests can pass a fake sessionStorage.
function storage(override) {
  if (override) return override;
  if (typeof sessionStorage !== 'undefined') return sessionStorage;
  return null;
}

export function writeStoredSession(rawSession, storageOverride) {
  const store = storage(storageOverride);
  if (!store) return null;
  const normalized = normalizeSessionPermissions(rawSession);
  store.setItem(SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

export function readStoredSession(storageOverride) {
  const store = storage(storageOverride);
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const normalized = normalizeSessionPermissions(parsed);
    return isSessionActive(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function clearStoredSession(storageOverride) {
  storage(storageOverride)?.removeItem(SESSION_KEY);
}
