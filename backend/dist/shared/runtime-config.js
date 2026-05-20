"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBackendRuntimeConfig = exports.buildCorsOptions = exports.getIncidentAiMaxUploadBytes = exports.parseCsvEnv = exports.isDevAuthBypassEnabled = exports.isTrue = void 0;
const firebase_admin_1 = require("./firebase-admin");
const truthy = new Set(['1', 'true', 'yes', 'on']);
const readEnv = (key, fallback = '') => String(process.env[key] || fallback).trim();
const isTrue = (value, fallback = false) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized)
        return fallback;
    return truthy.has(normalized);
};
exports.isTrue = isTrue;
const isDevAuthBypassEnabled = () => (0, exports.isTrue)(process.env.ALLOW_DEV_AUTH_BYPASS, false);
exports.isDevAuthBypassEnabled = isDevAuthBypassEnabled;
const parseCsvEnv = (key) => readEnv(key)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
exports.parseCsvEnv = parseCsvEnv;
const getIncidentAiMaxUploadBytes = () => {
    const maxUploadMb = Number(readEnv('INCIDENT_AI_MAX_UPLOAD_MB', readEnv('INCIDENT_AI_MAX_VIDEO_MB', '100')));
    return Math.max(1, maxUploadMb) * 1024 * 1024;
};
exports.getIncidentAiMaxUploadBytes = getIncidentAiMaxUploadBytes;
const buildCorsOptions = () => {
    const origins = (0, exports.parseCsvEnv)('INCIDENT_AI_CORS_ORIGINS');
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
exports.buildCorsOptions = buildCorsOptions;
const validateBackendRuntimeConfig = () => {
    const issues = [];
    const nodeEnv = readEnv('NODE_ENV', 'development').toLowerCase();
    const isProduction = nodeEnv === 'production';
    const stateProvider = readEnv('INCIDENT_AI_STATE_PROVIDER', 'auto').toLowerCase();
    const devBypass = (0, exports.isDevAuthBypassEnabled)();
    const firebaseAdminConfigured = (0, firebase_admin_1.hasFirebaseAdminCredentials)();
    const firebaseDatabaseUrl = (0, firebase_admin_1.getFirebaseDatabaseUrl)();
    if (isProduction && devBypass) {
        issues.push('ALLOW_DEV_AUTH_BYPASS must be false in production.');
    }
    if (isProduction && !firebaseAdminConfigured) {
        issues.push('Firebase Admin credentials are required in production.');
    }
    if (isProduction && !firebaseDatabaseUrl) {
        issues.push('FIREBASE_DATABASE_URL is required in production.');
    }
    if (stateProvider === 'firebase' && !(0, firebase_admin_1.canUseFirebaseDatabase)()) {
        issues.push('INCIDENT_AI_STATE_PROVIDER=firebase requires Firebase Admin credentials and FIREBASE_DATABASE_URL.');
    }
    if (issues.length > 0) {
        throw new Error(`Backend runtime configuration is invalid:\n- ${issues.join('\n- ')}`);
    }
};
exports.validateBackendRuntimeConfig = validateBackendRuntimeConfig;
