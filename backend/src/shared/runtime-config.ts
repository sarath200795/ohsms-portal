import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { canUseFirebaseDatabase, getFirebaseDatabaseUrl, hasFirebaseAdminCredentials } from './firebase-admin';

const truthy = new Set(['1', 'true', 'yes', 'on']);

const readEnv = (key: string, fallback = '') => String(process.env[key] || fallback).trim();

export const isTrue = (value: string | undefined | null, fallback = false) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return fallback;
    return truthy.has(normalized);
};

export const isDevAuthBypassEnabled = () => isTrue(process.env.ALLOW_DEV_AUTH_BYPASS, false);

export const parseCsvEnv = (key: string) => readEnv(key)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const getIncidentAiMaxUploadBytes = () => {
    const maxUploadMb = Number(readEnv('INCIDENT_AI_MAX_UPLOAD_MB', readEnv('INCIDENT_AI_MAX_VIDEO_MB', '100')));
    return Math.max(1, maxUploadMb) * 1024 * 1024;
};

export const buildCorsOptions = (): CorsOptions | boolean => {
    const origins = parseCsvEnv('INCIDENT_AI_CORS_ORIGINS');
    if (origins.length === 0) {
        return true;
    }

    return {
        origin(origin, callback) {
            if (!origin || origins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error(`Origin ${origin} is not allowed by INCIDENT_AI_CORS_ORIGINS.`), false);
        }
    };
};

export const validateBackendRuntimeConfig = () => {
    const issues: string[] = [];
    const nodeEnv = readEnv('NODE_ENV', 'development').toLowerCase();
    const isProduction = nodeEnv === 'production';
    const stateProvider = readEnv('INCIDENT_AI_STATE_PROVIDER', 'auto').toLowerCase();
    const devBypass = isDevAuthBypassEnabled();
    const firebaseAdminConfigured = hasFirebaseAdminCredentials();
    const firebaseDatabaseUrl = getFirebaseDatabaseUrl();

    if (isProduction && devBypass) {
        issues.push('ALLOW_DEV_AUTH_BYPASS must be false in production.');
    }

    if (isProduction && !firebaseAdminConfigured) {
        issues.push('Firebase Admin credentials are required in production.');
    }

    if (isProduction && !firebaseDatabaseUrl) {
        issues.push('FIREBASE_DATABASE_URL is required in production.');
    }

    if (stateProvider === 'firebase' && !canUseFirebaseDatabase()) {
        issues.push('INCIDENT_AI_STATE_PROVIDER=firebase requires Firebase Admin credentials and FIREBASE_DATABASE_URL.');
    }

    if (issues.length > 0) {
        throw new Error(`Backend runtime configuration is invalid:\n- ${issues.join('\n- ')}`);
    }
};
