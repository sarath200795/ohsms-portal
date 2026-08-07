import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue,
} from 'firebase/database';
import { getFirebaseConfig } from '../../config/firebase.js';

let db = null;

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(getFirebaseConfig());
}

function database() {
  if (!db) db = getDatabase(getFirebaseApp());
  return db;
}

export const firebaseAdapter = {
  async get(path) {
    const snap = await get(ref(database(), path));
    return snap.exists() ? snap.val() : null;
  },
  async set(path, value) {
    await set(ref(database(), path), value);
  },
  async update(path, value) {
    await update(ref(database(), path), value);
  },
  async push(path, value) {
    const node = await push(ref(database(), path), value);
    return node.key;
  },
  async remove(path) {
    await remove(ref(database(), path));
  },
  subscribe(path, callback) {
    return onValue(
      ref(database(), path),
      (snap) => callback(snap.exists() ? snap.val() : null),
      () => callback(null),
    );
  },
};
