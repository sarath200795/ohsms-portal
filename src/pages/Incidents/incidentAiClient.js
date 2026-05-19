import { readStoredSession } from '../../utils/session';
import { auth } from '../../config/firebase';

const env = typeof import.meta !== 'undefined' ? import.meta.env : {};

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getDefaultApiBaseUrl = () => {
    const configured = trimTrailingSlash(env.VITE_INCIDENT_AI_API_BASE_URL);
    if (configured) return configured;
    if (env.DEV) return 'http://localhost:4010/api/v1';
    return '';
};

const parseJsonSafely = async (response) => {
    const raw = await response.text();
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
};

const resolveUploadUrl = (apiBaseUrl, uploadUrl) => {
    if (/^https?:\/\//i.test(String(uploadUrl || ''))) return uploadUrl;
    const apiOrigin = new URL(apiBaseUrl).origin;
    return new URL(uploadUrl, apiOrigin).toString();
};

const dataUrlToBlob = async (dataUrl) => {
    const response = await fetch(String(dataUrl || ''));
    return response.blob();
};

const parseMimeTypeFromDataUrl = (dataUrl, fallbackMimeType) => {
    const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i);
    return match?.[1] || fallbackMimeType;
};

const estimateDataUrlSize = (dataUrl) => {
    const base64 = String(dataUrl || '').split(',')[1] || '';
    if (!base64) return 1;
    const padding = (base64.match(/=*$/)?.[0] || '').length;
    return Math.max(1, Math.floor((base64.length * 3) / 4) - padding);
};

const inferExtension = (mimeType, fallbackExtension) => {
    const normalized = String(mimeType || '').toLowerCase();
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    if (normalized.includes('mp4')) return 'mp4';
    if (normalized.includes('quicktime')) return 'mov';
    if (normalized.includes('mpeg')) return 'mpeg';
    return fallbackExtension;
};

const buildFileDescriptor = ({ dataUrl, fileName, fallbackBaseName, fallbackMimeType, fallbackExtension }) => {
    if (!dataUrl && !fileName) return null;

    const mimeType = parseMimeTypeFromDataUrl(dataUrl, fallbackMimeType);
    const normalizedFileName = fileName || `${fallbackBaseName}.${inferExtension(mimeType, fallbackExtension)}`;

    return {
        fileName: normalizedFileName,
        mimeType,
        sizeBytes: estimateDataUrlSize(dataUrl)
    };
};

const buildConfirmedEvidenceFile = (uploadTarget, descriptor) => ({
    storagePath: uploadTarget.storagePath,
    fileName: descriptor.fileName,
    mimeType: descriptor.mimeType
});

const buildDevAuthHeaders = (session = readStoredSession()) => ({
    'x-dev-auth-uid': session?.uid || 'frontend-dev-user',
    'x-dev-auth-email': session?.email || 'test1@email.com',
    'x-dev-auth-org-id': session?.orgId || 'demo-org',
    'x-dev-auth-role': session?.role || 'Global Owner',
    'x-dev-auth-sites': [session?.assignedSite, ...(session?.accessibleSites || [])]
        .filter(Boolean)
        .join(',') || 'GLOBAL'
});

const buildAuthHeaders = async (session = readStoredSession()) => {
    const headers = {};

    if (session?.orgId) {
        headers['x-ohsms-org-id'] = session.orgId;
    }

    if (typeof auth?.authStateReady === 'function') {
        await auth.authStateReady();
    }

    try {
        const currentUser = auth?.currentUser;
        if (currentUser) {
            const token = await currentUser.getIdToken();
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }
        }
    } catch {
        // keep local fallback behavior below when the dev backend is used
    }

    if (!headers.Authorization && env.DEV) {
        Object.assign(headers, buildDevAuthHeaders(session));
    }

    return headers;
};

const requestJson = async (url, { method = 'GET', body, session } = {}) => {
    const headers = await buildAuthHeaders(session);

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const payload = await parseJsonSafely(response);
    if (!response.ok) {
        const errorMessage = typeof payload === 'string'
            ? payload
            : payload?.message || payload?.error || `Incident AI backend request failed with status ${response.status}.`;
        throw new Error(errorMessage);
    }

    return payload;
};

const uploadBinaryEvidence = async ({
    uploadUrl,
    descriptor,
    dataUrl,
    session,
    apiBaseUrl
}) => {
    const formData = new FormData();
    const blob = await dataUrlToBlob(dataUrl);
    formData.append('file', blob, descriptor.fileName);
    const headers = await buildAuthHeaders(session);

    const response = await fetch(resolveUploadUrl(apiBaseUrl, uploadUrl), {
        method: 'POST',
        headers,
        body: formData
    });

    const payload = await parseJsonSafely(response);
    if (!response.ok) {
        const errorMessage = typeof payload === 'string'
            ? payload
            : payload?.message || payload?.error || `Incident AI upload failed with status ${response.status}.`;
        throw new Error(errorMessage);
    }

    return payload;
};

const formatStageLabel = (stage) => {
    const normalized = String(stage || '').trim();
    if (!normalized) return 'Analyzing evidence...';
    if (normalized === 'completed') return 'Analysis complete';
    return normalized
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

export const getIncidentAiApiBaseUrl = () => getDefaultApiBaseUrl();
export const isIncidentAiBackendEnabled = () => Boolean(getDefaultApiBaseUrl());

export async function runIncidentAiBackendAnalysis({
    incidentId,
    incidentData,
    session = readStoredSession(),
    onStatusChange
}) {
    const apiBaseUrl = getDefaultApiBaseUrl();
    if (!apiBaseUrl) {
        throw new Error('Incident AI backend URL is not configured.');
    }

    const photoDescriptor = buildFileDescriptor({
        dataUrl: incidentData?.imageEvidence,
        fileName: incidentData?.imageEvidenceName,
        fallbackBaseName: 'incident-photo',
        fallbackMimeType: 'image/jpeg',
        fallbackExtension: 'jpg'
    });
    const videoDescriptor = buildFileDescriptor({
        dataUrl: incidentData?.videoEvidence,
        fileName: incidentData?.videoEvidenceName,
        fallbackBaseName: 'incident-video',
        fallbackMimeType: 'video/mp4',
        fallbackExtension: 'mp4'
    });

    if (!photoDescriptor && !videoDescriptor) {
        throw new Error('A photo or video descriptor is required before Incident AI analysis can start.');
    }

    onStatusChange?.('Preparing upload session');
    const uploadSession = await requestJson(`${apiBaseUrl}/incidents/${encodeURIComponent(incidentId)}/ai-evidence/upload-session`, {
        method: 'POST',
        session,
        body: {
            ...(photoDescriptor ? { photo: photoDescriptor } : {}),
            ...(videoDescriptor ? { video: videoDescriptor } : {})
        }
    });

    if (photoDescriptor && uploadSession.photo && incidentData?.imageEvidence) {
        onStatusChange?.('Uploading photo evidence');
        await uploadBinaryEvidence({
            uploadUrl: uploadSession.photo.uploadUrl,
            descriptor: photoDescriptor,
            dataUrl: incidentData?.imageEvidence,
            session,
            apiBaseUrl
        });
    }

    if (videoDescriptor && uploadSession.video && incidentData?.videoEvidence) {
        onStatusChange?.('Uploading video evidence');
        await uploadBinaryEvidence({
            uploadUrl: uploadSession.video.uploadUrl,
            descriptor: videoDescriptor,
            dataUrl: incidentData.videoEvidence,
            session,
            apiBaseUrl
        });
    }

    onStatusChange?.('Confirming evidence');
    await requestJson(`${apiBaseUrl}/incidents/${encodeURIComponent(incidentId)}/ai-evidence/confirm`, {
        method: 'POST',
        session,
        body: {
            uploadSessionId: uploadSession.uploadSessionId,
            ...(photoDescriptor && uploadSession.photo
                ? { photo: buildConfirmedEvidenceFile(uploadSession.photo, photoDescriptor) }
                : {}),
            ...(videoDescriptor && uploadSession.video
                ? { video: buildConfirmedEvidenceFile(uploadSession.video, videoDescriptor) }
                : {}),
            notes: incidentData?.evidenceObservations || incidentData?.description || ''
        }
    });

    onStatusChange?.('Starting AI analysis');
    await requestJson(`${apiBaseUrl}/incidents/${encodeURIComponent(incidentId)}/ai-analysis`, {
        method: 'POST',
        session,
        body: {
            includeVideo: Boolean(videoDescriptor),
            includeAudioTranscript: Boolean(videoDescriptor),
            frameSampleSeconds: 2,
            maxFrames: 8,
            analysisLanguage: 'en',
            incidentContext: {
                title: incidentData?.title || '',
                description: incidentData?.description || '',
                equipmentInvolved: incidentData?.equipmentInvolved || '',
                immediateAction: incidentData?.immediateAction || '',
                smartCategory: incidentData?.smartType || '',
                severity: incidentData?.severity || '',
                type: incidentData?.type || ''
            }
        }
    });

    let latestStatus = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        latestStatus = await requestJson(`${apiBaseUrl}/incidents/${encodeURIComponent(incidentId)}/ai-analysis/status`, {
            session
        });
        onStatusChange?.(formatStageLabel(latestStatus?.stage));

        if (latestStatus?.status === 'completed') {
            break;
        }
        await sleep(350);
    }

    if (latestStatus?.status !== 'completed') {
        throw new Error('Incident AI analysis did not complete in time.');
    }

    onStatusChange?.('Collecting results');
    const result = await requestJson(`${apiBaseUrl}/incidents/${encodeURIComponent(incidentId)}/ai-analysis`, {
        session
    });
    onStatusChange?.('Analysis complete');

    return result;
}
