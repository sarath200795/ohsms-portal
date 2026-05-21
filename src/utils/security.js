const DEFAULT_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const fillRandomBytes = (length) => {
    if (!globalThis.crypto?.getRandomValues) {
        throw new Error('Secure random is not available in this environment.');
    }
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
};

const randomString = (length, alphabet = DEFAULT_PASSWORD_ALPHABET) => (
    Array.from(fillRandomBytes(length), (byte) => alphabet[byte % alphabet.length]).join('')
);

export const generateTemporaryPassword = ({ prefix = 'WE', length = 12 } = {}) => {
    const body = randomString(length);
    return `${prefix}-${body}!7a`;
};

export const generateVendorPortalPassword = () => generateTemporaryPassword({ prefix: 'VEN', length: 14 });

export const requiresPasswordChange = (record) => Boolean(record?.mustChangePassword);

// `data:` MIME types that can execute script when opened in a browser tab.
// Everything else (pdf, images, office docs, video/audio, octet-stream) is fine
// for a download/view link, so we use a denylist to avoid breaking valid files.
const DANGEROUS_DATA_URL_PATTERN = /^data:\s*(?:text\/html|text\/xml|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/(?:x-)?javascript|application\/ecmascript)/i;

// Schemes that are safe to place in an href for user-controlled file links.
const SAFE_URL_SCHEME_PATTERN = /^(?:https?:|mailto:|tel:|blob:)/i;

/**
 * Sanitize a user-controlled URL before binding it to an href.
 * React does not sanitize hrefs, so a stored value like
 * `javascript:...` or `data:text/html,...` would otherwise run when clicked.
 * Returns `undefined` for unsafe values so the link renders inert.
 */
export const safeDocumentHref = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return undefined;

    if (raw.startsWith('data:')) {
        return DANGEROUS_DATA_URL_PATTERN.test(raw) ? undefined : raw;
    }

    // No scheme (relative path, anchor, or query) => safe to keep as-is.
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    if (!hasScheme) return raw;

    return SAFE_URL_SCHEME_PATTERN.test(raw) ? raw : undefined;
};
