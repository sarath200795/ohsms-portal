import { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { safeArrayParse } from '../utils/helpers';

/**
 * Custom hook to fetch targeted Firebase data in parallel.
 * @param {string} orgId - The organization ID.
 * @param {Array<string>} tables - Array of table names to fetch (e.g., ['ptwRecords', 'sites']).
 */
export function useFirebaseData(orgId, tables = []) {
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!orgId || tables.length === 0) {
            setData({});
            setError(null);
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const orgRef = `organizations/${orgId}`;
                
                // Create an array of Firebase get() promises based on requested tables
                const promises = tables.map(table => get(ref(rtdb, `${orgRef}/${table}`)));
                const snapshots = await Promise.all(promises);

                const resultData = {};
                
                // Map the results back to their table names
                snapshots.forEach((snap, index) => {
                    const tableName = tables[index];
                    if (snap.exists()) {
                        // Keep Sites as an object for mapping, parse everything else as safe arrays
                        resultData[tableName] = tableName === 'sites' 
                            ? Object.keys(snap.val()).map(k => ({ code: snap.val()[k].code || k, name: snap.val()[k].name || k }))
                            : safeArrayParse(snap.val());
                    } else {
                        resultData[tableName] = [];
                    }
                });

                setData(resultData);
            } catch (err) {
                console.error("Firebase Fetch Error:", err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [orgId, JSON.stringify(tables)]); // Trigger re-fetch if tables array changes

    return { data, loading, error };
}
