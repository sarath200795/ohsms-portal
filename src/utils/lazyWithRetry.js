import React from 'react';

const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|fetch dynamically imported/i;

export const lazyWithRetry = (importer, key) => {
    const retryKey = `ohsms:lazy-retry:${key}`;

    return React.lazy(async () => {
        try {
            const module = await importer();
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(retryKey);
            }
            return module;
        } catch (error) {
            const message = String(error?.message || error || '');
            const canUseSessionStorage = typeof sessionStorage !== 'undefined';
            const hasRetried = canUseSessionStorage && sessionStorage.getItem(retryKey) === '1';
            const shouldReload = typeof window !== 'undefined' && !import.meta.env.DEV && CHUNK_ERROR_PATTERN.test(message);

            if (shouldReload && !hasRetried) {
                if (canUseSessionStorage) {
                    sessionStorage.setItem(retryKey, '1');
                }
                window.location.reload();
                return new Promise(() => {});
            }

            if (canUseSessionStorage) {
                sessionStorage.removeItem(retryKey);
            }
            throw error;
        }
    });
};
