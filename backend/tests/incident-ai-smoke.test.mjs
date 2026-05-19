import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import test, { after, before } from 'node:test';

const backendPort = 4110;
const backendBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
const authHeaders = {
    'x-dev-auth-uid': 'smoke-user',
    'x-dev-auth-email': 'smoke@test.local',
    'x-dev-auth-org-id': 'org-smoke',
    'x-dev-auth-role': 'Global Owner',
    'x-dev-auth-sites': 'GLOBAL,SITE-01'
};

let backendProcess;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadEvidenceFile = async ({ uploadUrl, fileName, mimeType, content }) => {
    const formData = new FormData();
    const blob = new Blob([content], { type: mimeType });
    formData.append('file', blob, fileName);

    const response = await fetch(`http://127.0.0.1:${backendPort}${uploadUrl}`, {
        method: 'POST',
        headers: authHeaders,
        body: formData
    });
    const rawBody = await response.text();
    const body = rawBody ? JSON.parse(rawBody) : null;

    if (!response.ok) {
        throw new Error(`Upload ${uploadUrl} failed with ${response.status}: ${rawBody}`);
    }

    return body;
};

const requestJson = async (path, options = {}) => {
    const response = await fetch(`${backendBaseUrl}${path}`, options);
    const rawBody = await response.text();
    const body = rawBody ? JSON.parse(rawBody) : null;

    if (!response.ok) {
        throw new Error(`Request ${path} failed with ${response.status}: ${rawBody}`);
    }

    return body;
};

const waitForHealthy = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch(`${backendBaseUrl}/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // keep polling until the local server is ready
        }
        await sleep(250);
    }

    throw new Error('Incident AI backend did not become healthy in time.');
};

const startBackend = async () => {
    backendProcess = spawn(process.execPath, ['dist/main.js'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            NODE_ENV: 'development',
            PORT: String(backendPort),
            ALLOW_DEV_AUTH_BYPASS: 'true',
            INCIDENT_AI_STATE_PROVIDER: 'local'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let startupOutput = '';
    backendProcess.stdout?.on('data', (chunk) => {
        startupOutput += chunk.toString();
    });
    backendProcess.stderr?.on('data', (chunk) => {
        startupOutput += chunk.toString();
    });

    backendProcess.once('exit', (code) => {
        if (code !== 0) {
            console.error(startupOutput);
        }
    });

    await waitForHealthy();
};

const stopBackend = async () => {
    if (!backendProcess) return;
    backendProcess.kill();
    await once(backendProcess, 'exit').catch(() => undefined);
    backendProcess = undefined;
};

before(async () => {
    await startBackend();
});

after(async () => {
    await stopBackend();
});

test('incident AI smoke flow completes end to end', async () => {
    const incidentId = 'INC-SMOKE-001';
    const requestHeaders = {
        'Content-Type': 'application/json',
        ...authHeaders
    };

    const uploadSession = await requestJson(`/incidents/${incidentId}/ai-evidence/upload-session`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
            photo: {
                fileName: 'scene-photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 2048
            },
            video: {
                fileName: 'sequence.mp4',
                mimeType: 'video/mp4',
                sizeBytes: 8096
            }
        })
    });

    assert.equal(uploadSession.incidentId, incidentId);
    assert.match(uploadSession.photo.storagePath, /orgs\/org-smoke\/incidents\/INC-SMOKE-001\/evidence\/photo-original\.jpg/);
    assert.match(uploadSession.video.storagePath, /orgs\/org-smoke\/incidents\/INC-SMOKE-001\/evidence\/video-original\.mp4/);

    const photoUpload = await uploadEvidenceFile({
        uploadUrl: uploadSession.photo.uploadUrl,
        fileName: 'scene-photo.jpg',
        mimeType: 'image/jpeg',
        content: 'fake-photo-binary'
    });
    const videoUpload = await uploadEvidenceFile({
        uploadUrl: uploadSession.video.uploadUrl,
        fileName: 'sequence.mp4',
        mimeType: 'video/mp4',
        content: 'fake-video-binary'
    });

    assert.equal(photoUpload.kind, 'photo');
    assert.equal(videoUpload.kind, 'video');

    const confirmEvidence = await requestJson(`/incidents/${incidentId}/ai-evidence/confirm`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
            uploadSessionId: uploadSession.uploadSessionId,
            photo: {
                storagePath: uploadSession.photo.storagePath,
                fileName: 'scene-photo.jpg',
                mimeType: 'image/jpeg'
            },
            video: {
                storagePath: uploadSession.video.storagePath,
                fileName: 'sequence.mp4',
                mimeType: 'video/mp4'
            },
            notes: 'Worker reported sparks, heat, and a damaged guard near the motor.'
        })
    });

    assert.equal(confirmEvidence.evidenceStatus, 'confirmed');
    assert.equal(confirmEvidence.videoAttached, true);
    assert.ok(confirmEvidence.storedEvidence.photo.sha256);

    const analysisStart = await requestJson(`/incidents/${incidentId}/ai-analysis`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
            includeVideo: true,
            includeAudioTranscript: true,
            frameSampleSeconds: 2,
            maxFrames: 6,
            analysisLanguage: 'en',
            incidentContext: {
                title: 'Motor guard damage and spark event',
                description: 'A maintenance technician noticed sparks and stopped the job.',
                equipmentInvolved: 'Packing line motor',
                smartCategory: 'Electrical Safety',
                severity: 'Level C',
                type: 'First Aid injury'
            }
        })
    });

    assert.equal(analysisStart.status, 'queued');

    let latestStatus = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        latestStatus = await requestJson(`/incidents/${incidentId}/ai-analysis/status`, {
            headers: authHeaders
        });

        if (latestStatus.status === 'completed') break;
        await sleep(250);
    }

    assert.ok(latestStatus, 'expected a status payload');
    assert.equal(latestStatus.status, 'completed');
    assert.equal(latestStatus.progressPercent, 100);

    const result = await requestJson(`/incidents/${incidentId}/ai-analysis`, {
        headers: authHeaders
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.provider, 'local');
    assert.deepEqual(result.providersUsed, ['local']);
    assert.ok(result.draft.rootCause.includes('controls were not sufficiently verified'));
    assert.ok(Array.isArray(result.draft.fiveWhys));
    assert.ok(result.draft.fiveWhys.length >= 5);
    assert.ok(Array.isArray(result.draft.capa));
    assert.ok(result.draft.capa.length >= 2);
    assert.ok(result.draft.visibleHazards.some((item) => item.includes('Stored photo evidence')));
    assert.ok(Array.isArray(result.mediaContext?.warnings));

    await stopBackend();
    await startBackend();

    const persistedStatus = await requestJson(`/incidents/${incidentId}/ai-analysis/status`, {
        headers: authHeaders
    });
    const persistedResult = await requestJson(`/incidents/${incidentId}/ai-analysis`, {
        headers: authHeaders
    });

    assert.equal(persistedStatus.status, 'completed');
    assert.equal(persistedResult.status, 'completed');
    assert.ok(persistedResult.draft.rootCause.includes('controls were not sufficiently verified'));
});

test('incident AI accepts video-only evidence', async () => {
    const incidentId = 'INC-SMOKE-VIDEO-ONLY';
    const requestHeaders = {
        'Content-Type': 'application/json',
        ...authHeaders
    };

    const uploadSession = await requestJson(`/incidents/${incidentId}/ai-evidence/upload-session`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
            video: {
                fileName: 'video-only-sequence.mp4',
                mimeType: 'video/mp4',
                sizeBytes: 4096
            }
        })
    });

    assert.equal(uploadSession.incidentId, incidentId);
    assert.equal(uploadSession.photo, undefined);
    assert.match(uploadSession.video.storagePath, /orgs\/org-smoke\/incidents\/INC-SMOKE-VIDEO-ONLY\/evidence\/video-original\.mp4/);

    const videoUpload = await uploadEvidenceFile({
        uploadUrl: uploadSession.video.uploadUrl,
        fileName: 'video-only-sequence.mp4',
        mimeType: 'video/mp4',
        content: 'fake-video-only-binary'
    });

    assert.equal(videoUpload.kind, 'video');

    const confirmEvidence = await requestJson(`/incidents/${incidentId}/ai-evidence/confirm`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
            uploadSessionId: uploadSession.uploadSessionId,
            video: {
                storagePath: uploadSession.video.storagePath,
                fileName: 'video-only-sequence.mp4',
                mimeType: 'video/mp4'
            },
            notes: 'The clip shows the sequence of failure and operator response.'
        })
    });

    assert.equal(confirmEvidence.evidenceStatus, 'confirmed');
    assert.equal(confirmEvidence.photoAttached, false);
    assert.equal(confirmEvidence.videoAttached, true);
    assert.ok(confirmEvidence.storedEvidence.video.sha256);

    const analysisStart = await requestJson(`/incidents/${incidentId}/ai-analysis`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
            includeVideo: true,
            includeAudioTranscript: true,
            frameSampleSeconds: 2,
            maxFrames: 4,
            analysisLanguage: 'en',
            incidentContext: {
                title: 'Video only incident',
                description: 'The available evidence is a short clip without a separate photo.',
                equipmentInvolved: 'Panel isolator',
                smartCategory: 'Electrical Safety',
                severity: 'Level B',
                type: 'Near Miss'
            }
        })
    });

    assert.equal(analysisStart.status, 'queued');

    let latestStatus = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        latestStatus = await requestJson(`/incidents/${incidentId}/ai-analysis/status`, {
            headers: authHeaders
        });

        if (latestStatus.status === 'completed') break;
        await sleep(250);
    }

    assert.ok(latestStatus, 'expected a status payload');
    assert.equal(latestStatus.status, 'completed');

    const result = await requestJson(`/incidents/${incidentId}/ai-analysis`, {
        headers: authHeaders
    });

    assert.equal(result.status, 'completed');
    assert.ok(result.draft.visibleHazards.some((item) => item.includes('Stored video evidence')));
});
