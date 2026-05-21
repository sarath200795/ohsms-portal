import { useCallback, useEffect, useMemo, useState } from 'react';
import { rtdb } from '../config/firebase';
import { readOrgChildren } from '../utils/orgData';
import { readStoredSession } from '../utils/session';
import { buildReminders, summarizeReminders, REMINDER_COLLECTIONS } from '../utils/reminders';

// Loads the collections the reminders engine needs (already site-scoped to the
// signed-in user by readOrgChildren) and returns normalized attention items.
export function useReminders() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        const session = readStoredSession();
        if (!session?.orgId) {
            setItems([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const data = await readOrgChildren(rtdb, session.orgId, REMINDER_COLLECTIONS, { session });
            setItems(buildReminders(data));
            setError(null);
        } catch (err) {
            console.error('Failed to load reminders:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            const session = readStoredSession();
            if (!session?.orgId) {
                if (active) setLoading(false);
                return;
            }
            try {
                const data = await readOrgChildren(rtdb, session.orgId, REMINDER_COLLECTIONS, { session });
                if (active) {
                    setItems(buildReminders(data));
                    setError(null);
                }
            } catch (err) {
                console.error('Failed to load reminders:', err);
                if (active) setError(err);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const summary = useMemo(() => summarizeReminders(items), [items]);

    return { items, summary, loading, error, refresh: load };
}
