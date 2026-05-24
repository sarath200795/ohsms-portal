/**
 * useDbData — hook to fetch multiple organisation collections in parallel.
 *
 * Previously named useFirebaseData; renamed to reflect the database-agnostic
 * architecture, but the old name is also exported for backward compatibility.
 *
 * @param {string}   orgId
 * @param {string[]} tables  e.g. ['ptwRecords', 'sites']
 */

import { useEffect, useMemo, useState } from 'react';
import { dbGet } from '../services/db/index.js';
import { safeArrayParse } from '../utils/helpers';

export function useDbData(orgId, tables = []) {
    const [data, setData]       = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    const tablesKey = useMemo(
        () => JSON.stringify(Array.isArray(tables) ? tables : []),
        [tables]
    );

    useEffect(() => {
        const requestedTables = tablesKey ? JSON.parse(tablesKey) : [];

        if (!orgId || requestedTables.length === 0) {
            setData({});
            setError(null);
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const promises = requestedTables.map((table) =>
                    dbGet(`organizations/${orgId}/${table}`)
                );
                const results = await Promise.all(promises);

                const resultData = {};
                results.forEach((value, index) => {
                    const tableName = requestedTables[index];
                    if (value !== null && value !== undefined) {
                        resultData[tableName] =
                            tableName === 'sites'
                                ? Object.keys(value).map((k) => ({
                                      code: value[k].code || k,
                                      name: value[k].name || k,
                                  }))
                                : safeArrayParse(value);
                    } else {
                        resultData[tableName] = [];
                    }
                });

                setData(resultData);
            } catch (err) {
                console.error('[useDbData] fetch error:', err);
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [orgId, tablesKey]);

    return { data, loading, error };
}

// ─── backward-compat alias ────────────────────────────────────────────────────
export const useFirebaseData = useDbData;
