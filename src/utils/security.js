const DEFAULT_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const fillRandomBytes = (length) => {
    const bytes = new Uint8Array(length);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
        return bytes;
    }

    bytes.forEach((_, index) => {
        bytes[index] = Math.floor(Math.random() * 256);
    });
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
