import { create } from 'zustand';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../config/firebase';

const useStore = create((set, get) => ({
    session: null,
    orgData: null,          // This will hold the ENTIRE organization's data in memory
    isDataLoading: true,    // Only true on the very first app load
    listenerActive: false,  // Prevents duplicate Firebase connections

    // 1. Call this when any protected page loads
    initializeSession: (sess) => {
        set({ session: sess });
        
        // If we are already connected to Firebase, don't do it again! (This makes navigation instant)
        if (get().listenerActive || !sess?.orgId) return;

        set({ listenerActive: true, isDataLoading: true });

        const orgRef = ref(rtdb, `organizations/${sess.orgId}`);
        
        // Establish a SINGLE real-time connection that updates the memory quietly in the background
        onValue(orgRef, (snap) => {
            if (snap.exists()) {
                set({ orgData: snap.val(), isDataLoading: false });
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