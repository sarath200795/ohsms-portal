import { randomUUID } from 'node:crypto';

const normalizeKind = (kind) => {
    const normalized = String(kind || '').trim().toLowerCase();
    if (normalized === 'photo' || normalized === 'video') return normalized;
    throw new Error('Upload kind must be either photo or video.');
};

export class VercelIncidentAiService {
    constructor(storageService, stateStore) {
        this.storageService = storageService;
        this.stateStore = stateStore;
    }

    async createUploadSession(incidentId, body, authContext, apiBaseUrl) {
        this.ensureAccess(incidentId, authContext);
        if (!body.photo && !body.video) {
            throw new Error('At least one media file descriptor is required to create an upload session.');
        }

        const uploadSessionId = this.buildId('upl');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
        const session = {
            uploadSessionId,
            incidentId,
            orgId: authContext.orgId,
            createdBy: authContext.uid,
            createdAt: now.toISOString(),
            expiresAt,
            photo: body.photo
                ? this.buildUploadTarget(authContext.orgId, incidentId, uploadSessionId, 'photo', body.photo.fileName, body.photo.mimeType, apiBaseUrl)
                : undefined,
            video: body.video
                ? this.buildUploadTarget(authContext.orgId, incidentId, uploadSessionId, 'video', body.video.fileName, body.video.mimeType, apiBaseUrl)
                : undefined,
            uploadedFiles: {}
        };

        await this.stateStore.setUploadSession(uploadSessionId, session);
        return {
            incidentId,
            uploadSessionId,
            photo: session.photo,
            video: session.video,
            expiresAt
        };
    }

    async uploadEvidenceFile(incidentId, uploadSessionId, kind, file, authContext) {
        this.ensureAccess(incidentId, authContext);
        const normalizedKind = normalizeKind(kind);
        const session = await this.requireUploadSession(uploadSessionId, incidentId, authContext.orgId);
        const uploadTarget = normalizedKind === 'photo' ? session.photo : session.video;

        if (!uploadTarget) {
            throw new Error(`No ${normalizedKind} upload target was created for this incident.`);
        }
        if (!file?.buffer || !file?.size) {
            throw new Error('Uploaded file payload is required.');
        }

        const uploadedRecord = await this.storageService.saveUploadedFile({
            storagePath: uploadTarget.storagePath,
            kind: normalizedKind,
            fileName: file.originalname || `${normalizedKind}-upload`,
            mimeType: file.mimetype || uploadTarget.headers['Content-Type'] || 'application/octet-stream',
            buffer: file.buffer,
            sizeBytes: file.size
        });

        session.uploadedFiles[normalizedKind] = uploadedRecord;
        await this.stateStore.setUploadSession(uploadSessionId, session);
        return {
            incidentId,
            uploadSessionId,
            kind: normalizedKind,
            storagePath: uploadedRecord.storagePath,
            sizeBytes: uploadedRecord.sizeBytes,
            uploadedAt: uploadedRecord.uploadedAt,
            blobUrl: uploadedRecord.blobUrl
        };
    }

    async buildClientUploadTokenConfig(incidentId, clientPayload, pathname) {
        const payload = this.parseClientUploadPayload(clientPayload);
        const session = await this.requireUploadSessionByIncident(payload.uploadSessionId, incidentId);
        const normalizedKind = normalizeKind(payload.kind);
        const uploadTarget = normalizedKind === 'photo' ? session.photo : session.video;

        if (!uploadTarget) {
            throw new Error(`No ${normalizedKind} upload target was created for this incident.`);
        }
        if (String(pathname || '').trim() !== uploadTarget.storagePath) {
            throw new Error('Client upload path does not match the authorized evidence target.');
        }
        if (payload.clientUploadToken !== uploadTarget.clientUploadToken) {
            throw new Error('Client upload token is invalid or expired for this evidence target.');
        }

        return {
            allowedContentTypes: normalizedKind === 'photo'
                ? ['image/*']
                : ['video/*'],
            maximumSizeInBytes: normalizedKind === 'photo'
                ? 25 * 1024 * 1024
                : 250 * 1024 * 1024,
            allowOverwrite: true,
            tokenPayload: JSON.stringify({
                orgId: session.orgId,
                incidentId,
                uploadSessionId: payload.uploadSessionId,
                kind: normalizedKind,
                fileName: payload.fileName || `${normalizedKind}-upload`,
                mimeType: payload.mimeType || uploadTarget.headers['Content-Type'] || 'application/octet-stream',
                sizeBytes: Number(payload.sizeBytes || 0),
                storagePath: uploadTarget.storagePath
            })
        };
    }

    async registerUploadedBlob(incidentId, body, authContext) {
        this.ensureAccess(incidentId, authContext);

        const normalizedKind = normalizeKind(body.kind);
        const session = await this.requireUploadSession(body.uploadSessionId, incidentId, authContext.orgId);
        const uploadTarget = normalizedKind === 'photo' ? session.photo : session.video;

        if (!uploadTarget) {
            throw new Error(`No ${normalizedKind} upload target was created for this incident.`);
        }
        if (String(body.pathname || '').trim() !== uploadTarget.storagePath) {
            throw new Error('Uploaded blob path does not match the authorized evidence target.');
        }
        if (!String(body.url || '').trim()) {
            throw new Error('Uploaded blob URL is required.');
        }

        const uploadedRecord = {
            kind: normalizedKind,
            storagePath: uploadTarget.storagePath,
            absolutePath: null,
            blobUrl: String(body.url || '').trim(),
            fileName: body.fileName || `${normalizedKind}-upload`,
            mimeType: body.contentType || uploadTarget.headers['Content-Type'] || 'application/octet-stream',
            sizeBytes: Number(body.sizeBytes || 0),
            sha256: String(body.etag || '').trim(),
            uploadedAt: new Date().toISOString()
        };

        session.uploadedFiles[normalizedKind] = uploadedRecord;
        await this.stateStore.setUploadSession(body.uploadSessionId, session);

        return {
            incidentId,
            uploadSessionId: body.uploadSessionId,
            kind: normalizedKind,
            storagePath: uploadedRecord.storagePath,
            sizeBytes: uploadedRecord.sizeBytes,
            uploadedAt: uploadedRecord.uploadedAt,
            blobUrl: uploadedRecord.blobUrl
        };
    }

    async confirmEvidence(incidentId, body, authContext) {
        this.ensureAccess(incidentId, authContext);
        const uploadSession = await this.requireUploadSession(body.uploadSessionId, incidentId, authContext.orgId);

        if (!body.photo && !body.video) {
            throw new Error('At least one confirmed media file is required before evidence can be saved.');
        }

        const uploadedPhoto = body.photo ? this.requireUploadedFile(uploadSession, 'photo') : undefined;
        const uploadedVideo = body.video ? this.requireUploadedFile(uploadSession, 'video') : undefined;

        const record = {
            incidentId,
            orgId: authContext.orgId,
            photo: body.photo,
            video: body.video,
            notes: body.notes?.trim() || '',
            confirmedAt: new Date().toISOString(),
            uploaded: {
                ...(uploadedPhoto ? { photo: uploadedPhoto } : {}),
                ...(uploadedVideo ? { video: uploadedVideo } : {})
            }
        };

        await this.stateStore.setEvidenceRecord(this.incidentKey(authContext.orgId, incidentId), record);
        return {
            incidentId,
            evidenceStatus: 'confirmed',
            photoAttached: Boolean(body.photo),
            videoAttached: Boolean(body.video),
            storedEvidence: {
                ...(uploadedPhoto ? {
                    photo: {
                        sizeBytes: uploadedPhoto.sizeBytes,
                        sha256: uploadedPhoto.sha256
                    }
                } : {}),
                ...(uploadedVideo ? {
                    video: {
                        sizeBytes: uploadedVideo.sizeBytes,
                        sha256: uploadedVideo.sha256
                    }
                } : {})
            }
        };
    }

    async startAnalysis(incidentId, body, authContext) {
        this.ensureAccess(incidentId, authContext);
        const evidence = await this.requireEvidence(authContext.orgId, incidentId);
        const incidentKey = this.incidentKey(authContext.orgId, incidentId);
        const existingJob = await this.stateStore.getAnalysisJob(incidentKey);

        if (existingJob && ['queued', 'processing'].includes(existingJob.status) && !body.forceRerun) {
            throw new Error('An incident AI analysis job is already queued or processing for this record.');
        }

        const jobId = this.buildId('job');
        const now = new Date().toISOString();
        const job = {
            incidentId,
            orgId: authContext.orgId,
            jobId,
            status: 'queued',
            stage: 'queued',
            progressPercent: 0,
            startedAt: now,
            updatedAt: now,
            requestedBy: authContext.uid,
            request: {
                forceRerun: body.forceRerun,
                includeVideo: body.includeVideo,
                includeAudioTranscript: body.includeAudioTranscript,
                frameSampleSeconds: body.frameSampleSeconds,
                maxFrames: body.maxFrames,
                analysisLanguage: body.analysisLanguage,
                incidentContext: body.incidentContext ? { ...body.incidentContext } : undefined
            }
        };

        await this.stateStore.setAnalysisJob(incidentKey, job);
        await this.stateStore.deleteAnalysisResult(incidentKey);
        return {
            incidentId: evidence.incidentId,
            jobId,
            status: 'queued',
            incidentKey
        };
    }

    async getAnalysisStatus(incidentId, authContext) {
        this.ensureAccess(incidentId, authContext);
        const job = await this.stateStore.getAnalysisJob(this.incidentKey(authContext.orgId, incidentId));
        if (!job) {
            throw new Error('No incident AI analysis job found for this incident.');
        }

        return {
            incidentId: job.incidentId,
            jobId: job.jobId,
            status: job.status,
            stage: job.stage,
            progressPercent: job.progressPercent,
            startedAt: job.startedAt,
            updatedAt: job.updatedAt,
            completedAt: job.completedAt,
            failureMessage: job.failureMessage || ''
        };
    }

    async getAnalysisResult(incidentId, authContext) {
        this.ensureAccess(incidentId, authContext);
        const key = this.incidentKey(authContext.orgId, incidentId);
        const job = await this.stateStore.getAnalysisJob(key);
        const result = await this.stateStore.getAnalysisResult(key);

        if (!job) {
            throw new Error('No incident AI analysis job found for this incident.');
        }
        if (job.status !== 'completed' || !result) {
            throw new Error('Incident AI analysis is not completed yet.');
        }

        return result;
    }

    async retryAnalysis(incidentId, body, authContext) {
        const currentResult = await this.stateStore.getAnalysisResult(this.incidentKey(authContext.orgId, incidentId));
        return this.startAnalysis(incidentId, {
            forceRerun: true,
            frameSampleSeconds: body.override?.frameSampleSeconds,
            maxFrames: body.override?.maxFrames,
            includeAudioTranscript: true,
            includeVideo: true,
            analysisLanguage: 'en',
            incidentContext: {
                description: body.reason || currentResult?.draft?.eventSummary || 'Retry requested for incident AI analysis.'
            }
        }, authContext);
    }

    incidentKey(orgId, incidentId) {
        return `${orgId}::${incidentId}`;
    }

    ensureAccess(incidentId, authContext) {
        if (!authContext?.orgId) {
            throw new Error('Missing organization context.');
        }
        if (!String(incidentId || '').trim()) {
            throw new Error('Incident ID is required.');
        }
    }

    async requireUploadSession(uploadSessionId, incidentId, orgId) {
        const uploadSession = await this.stateStore.getUploadSession(uploadSessionId);
        if (!uploadSession || uploadSession.incidentId !== incidentId || uploadSession.orgId !== orgId) {
            throw new Error('Upload session not found for this incident.');
        }
        return uploadSession;
    }

    async requireUploadSessionByIncident(uploadSessionId, incidentId) {
        const uploadSession = await this.stateStore.getUploadSession(uploadSessionId);
        if (!uploadSession || uploadSession.incidentId !== incidentId) {
            throw new Error('Upload session not found for this incident.');
        }
        return uploadSession;
    }

    requireUploadedFile(uploadSession, kind) {
        const file = uploadSession.uploadedFiles[kind];
        if (!file) {
            throw new Error(`The ${kind} evidence file has not been uploaded yet.`);
        }
        return file;
    }

    async requireEvidence(orgId, incidentId) {
        const evidence = await this.stateStore.getEvidenceRecord(this.incidentKey(orgId, incidentId));
        if (!evidence?.photo && !evidence?.video) {
            throw new Error('Confirmed incident photo or video evidence is required before AI analysis can start.');
        }
        return evidence;
    }

    buildId(prefix) {
        return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }

    buildUploadTarget(orgId, incidentId, uploadSessionId, kind, fileName, mimeType, apiBaseUrl) {
        const extension = fileName.includes('.') ? fileName.split('.').pop() : (kind === 'photo' ? 'jpg' : 'mp4');
        const normalizedName = `${kind}-original.${extension}`;
        const storagePath = `orgs/${orgId}/incidents/${incidentId}/evidence/${normalizedName}`;
        return {
            storagePath,
            uploadUrl: `${apiBaseUrl}/incidents/${encodeURIComponent(incidentId)}/ai-evidence/upload/${encodeURIComponent(uploadSessionId)}/${kind}`,
            blobClientUploadUrl: `${apiBaseUrl}/incidents/${encodeURIComponent(incidentId)}/ai-evidence/blob-client-upload`,
            clientUploadToken: this.buildId(`blob_${kind}`),
            headers: {
                'Content-Type': mimeType
            }
        };
    }

    parseClientUploadPayload(clientPayload) {
        const payload = typeof clientPayload === 'string' && clientPayload
            ? JSON.parse(clientPayload)
            : (clientPayload || {});

        if (!payload?.uploadSessionId) {
            throw new Error('Upload session ID is required for Blob client uploads.');
        }

        return payload;
    }
}
