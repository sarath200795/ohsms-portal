"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentAiStateStoreService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("firebase-admin/database");
const node_fs_1 = require("node:fs");
const path = require("node:path");
const firebase_admin_1 = require("../../shared/firebase-admin");
let IncidentAiStateStoreService = class IncidentAiStateStoreService {
    runtimeDir = path.resolve(process.cwd(), process.env.INCIDENT_AI_RUNTIME_DIR || '.runtime');
    stateFilePath = path.join(this.runtimeDir, 'state', 'incident-ai-state.json');
    firebaseRoot = String(process.env.INCIDENT_AI_FIREBASE_ROOT || 'backend/incidentAi').replace(/^\/+|\/+$/g, '');
    providerMode = 'local';
    database = null;
    state = {
        uploadSessions: {},
        evidenceRecords: {},
        analysisJobs: {},
        analysisResults: {}
    };
    persistChain = Promise.resolve();
    async onModuleInit() {
        this.providerMode = this.resolveProviderMode();
        if (this.providerMode === 'firebase') {
            this.database = this.initializeFirebaseDatabase();
            return;
        }
        await this.loadLocalState();
    }
    getProviderMode() {
        return this.providerMode;
    }
    async getUploadSession(uploadSessionId) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord('uploadSessions', uploadSessionId);
        }
        return this.state.uploadSessions[uploadSessionId] || null;
    }
    async setUploadSession(uploadSessionId, session) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('uploadSessions', uploadSessionId, session);
            return;
        }
        this.state.uploadSessions[uploadSessionId] = session;
        await this.persistLocalState();
    }
    async getEvidenceRecord(incidentKey) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord('evidenceRecords', incidentKey);
        }
        return this.state.evidenceRecords[incidentKey] || null;
    }
    async setEvidenceRecord(incidentKey, record) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('evidenceRecords', incidentKey, record);
            return;
        }
        this.state.evidenceRecords[incidentKey] = record;
        await this.persistLocalState();
    }
    async getAnalysisJob(incidentKey) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord('analysisJobs', incidentKey);
        }
        return this.state.analysisJobs[incidentKey] || null;
    }
    async setAnalysisJob(incidentKey, record) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('analysisJobs', incidentKey, record);
            return;
        }
        this.state.analysisJobs[incidentKey] = record;
        await this.persistLocalState();
    }
    async deleteAnalysisResult(incidentKey) {
        if (this.providerMode === 'firebase') {
            await this.deleteFirebaseRecord('analysisResults', incidentKey);
            return;
        }
        delete this.state.analysisResults[incidentKey];
        await this.persistLocalState();
    }
    async getAnalysisResult(incidentKey) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord('analysisResults', incidentKey);
        }
        return this.state.analysisResults[incidentKey] || null;
    }
    async setAnalysisResult(incidentKey, result) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('analysisResults', incidentKey, result);
            return;
        }
        this.state.analysisResults[incidentKey] = result;
        await this.persistLocalState();
    }
    async listPendingJobs() {
        if (this.providerMode === 'firebase') {
            const allJobs = await this.listFirebaseRecords('analysisJobs');
            return allJobs
                .filter(([, job]) => ['queued', 'processing'].includes(job.status))
                .map(([incidentKey, job]) => ({ incidentKey, job }));
        }
        return Object.entries(this.state.analysisJobs)
            .filter(([, job]) => ['queued', 'processing'].includes(job.status))
            .map(([incidentKey, job]) => ({ incidentKey, job }));
    }
    async claimAnalysisJob(incidentKey, workerId, leaseMs) {
        const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
        const now = new Date().toISOString();
        if (this.providerMode === 'firebase') {
            const ref = this.requireFirebaseDatabase().ref(this.buildFirebasePath('analysisJobs', incidentKey));
            const result = await ref.transaction((current) => {
                if (!current || !['queued', 'processing'].includes(current.status))
                    return current;
                const leaseExpired = !current.leaseExpiresAt || current.leaseExpiresAt <= now;
                const sameWorker = current.workerId === workerId;
                if (!leaseExpired && !sameWorker)
                    return;
                return {
                    ...current,
                    status: 'processing',
                    workerId,
                    leaseExpiresAt,
                    updatedAt: now
                };
            });
            if (!result.committed || !result.snapshot.exists())
                return null;
            return result.snapshot.val();
        }
        const current = this.state.analysisJobs[incidentKey];
        if (!current || !['queued', 'processing'].includes(current.status))
            return null;
        const leaseExpired = !current.leaseExpiresAt || current.leaseExpiresAt <= now;
        const sameWorker = current.workerId === workerId;
        if (!leaseExpired && !sameWorker)
            return null;
        const claimedJob = {
            ...current,
            status: 'processing',
            workerId,
            leaseExpiresAt,
            updatedAt: now
        };
        this.state.analysisJobs[incidentKey] = claimedJob;
        await this.persistLocalState();
        return claimedJob;
    }
    resolveProviderMode() {
        const requested = String(process.env.INCIDENT_AI_STATE_PROVIDER || 'auto').trim().toLowerCase();
        if (requested === 'local')
            return 'local';
        if (requested === 'firebase')
            return this.canUseFirebase() ? 'firebase' : 'local';
        return this.canUseFirebase() ? 'firebase' : 'local';
    }
    canUseFirebase() {
        return (0, firebase_admin_1.canUseFirebaseDatabase)();
    }
    initializeFirebaseDatabase() {
        return (0, database_1.getDatabase)((0, firebase_admin_1.getOrInitializeFirebaseAdminApp)());
    }
    buildFirebasePath(bucket, key) {
        return `${this.firebaseRoot}/${bucket}/${encodeURIComponent(key)}`;
    }
    requireFirebaseDatabase() {
        if (!this.database) {
            throw new Error('Firebase Admin database is not initialized.');
        }
        return this.database;
    }
    async readFirebaseRecord(bucket, key) {
        const snapshot = await this.requireFirebaseDatabase().ref(this.buildFirebasePath(bucket, key)).get();
        return snapshot.exists() ? snapshot.val() : null;
    }
    async writeFirebaseRecord(bucket, key, value) {
        await this.requireFirebaseDatabase().ref(this.buildFirebasePath(bucket, key)).set(value);
    }
    async deleteFirebaseRecord(bucket, key) {
        await this.requireFirebaseDatabase().ref(this.buildFirebasePath(bucket, key)).remove();
    }
    async listFirebaseRecords(bucket) {
        const snapshot = await this.requireFirebaseDatabase().ref(`${this.firebaseRoot}/${bucket}`).get();
        const raw = snapshot.exists() ? snapshot.val() : {};
        return Object.entries(raw).map(([encodedKey, value]) => [decodeURIComponent(encodedKey), value]);
    }
    async loadLocalState() {
        try {
            const raw = await node_fs_1.promises.readFile(this.stateFilePath, 'utf8');
            const parsed = JSON.parse(raw);
            this.state = {
                uploadSessions: parsed.uploadSessions || {},
                evidenceRecords: parsed.evidenceRecords || {},
                analysisJobs: parsed.analysisJobs || {},
                analysisResults: parsed.analysisResults || {}
            };
        }
        catch (error) {
            if (error?.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    async persistLocalState() {
        this.persistChain = this.persistChain.then(async () => {
            await node_fs_1.promises.mkdir(path.dirname(this.stateFilePath), { recursive: true });
            await node_fs_1.promises.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8');
        });
        await this.persistChain;
    }
    getHealthSnapshot() {
        return {
            providerMode: this.providerMode,
            firebaseDatabaseConfigured: this.providerMode === 'firebase' ? Boolean(this.database) : this.canUseFirebase(),
            firebaseRoot: this.firebaseRoot,
            localStateFilePath: this.stateFilePath
        };
    }
};
exports.IncidentAiStateStoreService = IncidentAiStateStoreService;
exports.IncidentAiStateStoreService = IncidentAiStateStoreService = __decorate([
    (0, common_1.Injectable)()
], IncidentAiStateStoreService);
