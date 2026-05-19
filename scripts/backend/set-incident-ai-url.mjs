import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectId = process.env.FIREBASE_PROJECT_ID || 'ohsms-3894f';
const region = process.env.INCIDENT_AI_FUNCTION_REGION || 'asia-south1';
const functionName = process.env.INCIDENT_AI_FUNCTION_NAME || 'incidentAiApi';
const explicitUrl = process.argv[2];
const rootEnvPath = resolve(process.cwd(), '.env');

const targetUrl = explicitUrl || `https://${region}-${projectId}.cloudfunctions.net/${functionName}/api/v1`;
const envRaw = readFileSync(rootEnvPath, 'utf8');

const nextEnv = envRaw.match(/^VITE_INCIDENT_AI_API_BASE_URL=/m)
    ? envRaw.replace(/^VITE_INCIDENT_AI_API_BASE_URL=.*$/m, `VITE_INCIDENT_AI_API_BASE_URL=${targetUrl}`)
    : `${envRaw.trimEnd()}\nVITE_INCIDENT_AI_API_BASE_URL=${targetUrl}\n`;

writeFileSync(rootEnvPath, nextEnv, 'utf8');
console.log(`VITE_INCIDENT_AI_API_BASE_URL set to ${targetUrl}`);
