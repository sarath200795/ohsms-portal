import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBHqeQN4s9PA5UUDfLtAajVkoRK2BrRjwk",
  authDomain: "ohsms-3894f.firebaseapp.com",
  databaseURL: "https://ohsms-3894f-default-rtdb.firebaseio.com/", 
  projectId: "ohsms-3894f",
  storageBucket: "ohsms-3894f.firebasestorage.app",
  messagingSenderId: "871919638023",
  appId: "1:871919638023:web:69d325f99f71af7a337ca2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Authentication 
export const auth = getAuth(app);

// Initialize Realtime Database
const databaseInstance = getDatabase(app);

// EXPORT TWICE TO FIX ALL ERRORS:
// Export as 'rtdb' for all the newly built modules (PTW, Audit, Capa, etc.)
export const rtdb = databaseInstance;

// Export as 'db' for older modules (Standards, etc.)
export const db = databaseInstance;