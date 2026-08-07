import { getRestConfig } from '../../config/firebase.js';

// Generic REST adapter. Expects a Firebase-RTDB-compatible JSON API:
//   GET/PUT/PATCH/DELETE {base}/{path}   and POST {base}/{path} → { name: newId }
// Subscriptions degrade to polling since plain REST has no push channel.

const POLL_INTERVAL_MS = 15000;

function endpoint(path) {
  const { baseUrl } = getRestConfig();
  return `${baseUrl.replace(/\/$/, '')}/${path}`;
}

async function request(path, options = {}) {
  const { authToken } = getRestConfig();
  const res = await fetch(endpoint(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`REST ${options.method || 'GET'} ${path} failed: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const restAdapter = {
  get: (path) => request(path),
  set: (path, value) => request(path, { method: 'PUT', body: JSON.stringify(value) }),
  update: (path, value) => request(path, { method: 'PATCH', body: JSON.stringify(value) }),
  async push(path, value) {
    const result = await request(path, { method: 'POST', body: JSON.stringify(value) });
    return result?.name ?? result?.id ?? null;
  },
  remove: (path) => request(path, { method: 'DELETE' }),
  subscribe(path, callback) {
    let active = true;
    const poll = () =>
      request(path)
        .then((value) => active && callback(value))
        .catch(() => active && callback(null));
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  },
};
