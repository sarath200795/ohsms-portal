import { handleUpload } from '@vercel/blob/client';
import { getIncidentAiRuntime, resolveAuthContext } from '../server/incident-ai/runtime.js';

const json = (payload, status = 200, extraHeaders = {}) => new Response(JSON.stringify(payload), {
    status,
    headers: {
        'Content-Type': 'application/json',
        ...extraHeaders
    }
});

const noContent = (status = 204, extraHeaders = {}) => new Response(null, {
    status,
    headers: extraHeaders
});

const getErrorStatus = (error) => {
    if (typeof error?.getStatus === 'function') return error.getStatus();
    if (typeof error?.statusCode === 'number') return error.statusCode;

    const message = String(error?.message || '').toLowerCase();
    if (message.includes('missing bearer token')) return 401;
    if (message.includes('not found')) return 404;
    if (message.includes('not completed yet') || message.includes('already queued') || message.includes('has not been uploaded') || message.includes('is required before')) return 409;
    if (message.includes('forbidden') || message.includes('organization context')) return 403;
    if (message.includes('required') || message.includes('must be')) return 400;

    return 500;
};

const getRelativeApiPath = (request) => {
    const url = new URL(request.url);
    const rewrittenPath = String(url.searchParams.get('path') || '').trim();
    if (rewrittenPath) {
        return `/${rewrittenPath.replace(/^\/+/, '')}`;
    }

    return url.pathname.replace(/^\/api\/v1/, '') || '/';
};

const createFilePayload = async (file) => ({
    buffer: Buffer.from(await file.arrayBuffer()),
    size: Number(file.size || 0),
    originalname: file.name || 'upload.bin',
    mimetype: file.type || 'application/octet-stream'
});

const buildHealthPayload = (runtime) => ({
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
        auth: runtime.authService.getHealthSnapshot(),
        state: runtime.stateStore.getHealthSnapshot(),
        worker: runtime.workerService.getHealthSnapshot(),
        media: runtime.mediaService.getHealthSnapshot(),
        storage: {
            provider: 'vercel-blob',
            blobTokenConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
        }
    }
});

const parseJsonBody = async (request) => {
    try {
        return await request.json();
    } catch {
        return {};
    }
};

const runAnalysisToCompletion = async (runtime, payload, authContext) => {
    await runtime.workerService.runJob(payload.incidentKey);

    const status = await runtime.incidentService.getAnalysisStatus(payload.incidentId, authContext);
    if (status.status !== 'completed') {
        throw new Error(status.failureMessage || 'Incident AI analysis did not complete.');
    }

    const result = await runtime.incidentService.getAnalysisResult(payload.incidentId, authContext);
    return {
        incidentId: payload.incidentId,
        jobId: payload.jobId,
        status: status.status,
        result
    };
};

const routeRequest = async (request) => {
    const runtime = await getIncidentAiRuntime();
    const relativePath = getRelativeApiPath(request);
    const apiBaseUrl = `${new URL(request.url).origin}/api/v1`;

    if (request.method === 'GET' && relativePath === '/health/ready') {
        return json(buildHealthPayload(runtime));
    }

    const blobClientUploadMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-evidence\/blob-client-upload$/);
    if (request.method === 'POST' && blobClientUploadMatch) {
        const incidentId = blobClientUploadMatch[1];
        const body = await parseJsonBody(request);

        const payload = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname, clientPayload) => {
                return runtime.incidentService.buildClientUploadTokenConfig(
                    incidentId,
                    clientPayload,
                    pathname
                );
            },
            onUploadCompleted: async () => {
                // We register the final blob through an authenticated follow-up call
                // from the frontend so the upload session is updated deterministically.
            }
        });

        return json(payload);
    }

    const authContext = await resolveAuthContext(request, runtime.authService, runtime.mockAuthService);

    const uploadSessionMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-evidence\/upload-session$/);
    if (request.method === 'POST' && uploadSessionMatch) {
        const body = await request.json();
        const payload = await runtime.incidentService.createUploadSession(uploadSessionMatch[1], body, authContext, apiBaseUrl);
        return json(payload);
    }

    const uploadFileMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-evidence\/upload\/([^/]+)\/(photo|video)$/);
    if (request.method === 'POST' && uploadFileMatch) {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
            return json({ error: 'A file upload is required.' }, 400);
        }

        const payload = await runtime.incidentService.uploadEvidenceFile(
            uploadFileMatch[1],
            uploadFileMatch[2],
            uploadFileMatch[3],
            await createFilePayload(file),
            authContext
        );
        return json(payload);
    }

    const uploadCompleteMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-evidence\/upload-complete$/);
    if (request.method === 'POST' && uploadCompleteMatch) {
        const body = await request.json();
        const payload = await runtime.incidentService.registerUploadedBlob(uploadCompleteMatch[1], body, authContext);
        return json(payload);
    }

    const confirmMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-evidence\/confirm$/);
    if (request.method === 'POST' && confirmMatch) {
        const body = await request.json();
        const payload = await runtime.incidentService.confirmEvidence(confirmMatch[1], body, authContext);
        return json(payload);
    }

    const statusMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-analysis\/status$/);
    if (request.method === 'GET' && statusMatch) {
        const payload = await runtime.incidentService.getAnalysisStatus(statusMatch[1], authContext);
        return json(payload);
    }

    const retryMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-analysis\/retry$/);
    if (request.method === 'POST' && retryMatch) {
        const body = await request.json();
        const payload = await runtime.incidentService.retryAnalysis(retryMatch[1], body, authContext);
        return json(await runAnalysisToCompletion(runtime, payload, authContext));
    }

    const analysisMatch = relativePath.match(/^\/incidents\/([^/]+)\/ai-analysis$/);
    if (request.method === 'POST' && analysisMatch) {
        const body = await request.json();
        const payload = await runtime.incidentService.startAnalysis(analysisMatch[1], body, authContext);
        return json(await runAnalysisToCompletion(runtime, payload, authContext));
    }

    if (request.method === 'GET' && analysisMatch) {
        const payload = await runtime.incidentService.getAnalysisResult(analysisMatch[1], authContext);
        return json(payload);
    }

    return json({
        error: `No Incident AI Vercel route matched ${request.method} ${relativePath}.`
    }, 404);
};

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') {
            return noContent(204, {
                Allow: 'GET,POST,OPTIONS'
            });
        }

        try {
            return await routeRequest(request);
        } catch (error) {
            console.error('Incident AI Vercel API error:', error);
            const status = getErrorStatus(error);
            // Expected client errors (4xx) carry safe, actionable messages.
            // Unexpected server errors (5xx) may contain internal details
            // (URLs, stack hints) — return a generic message to the caller.
            const safeMessage = status >= 500
                ? 'Incident AI request failed.'
                : (error?.message || 'Incident AI request failed.');
            return json({ error: safeMessage }, status);
        }
    }
};
