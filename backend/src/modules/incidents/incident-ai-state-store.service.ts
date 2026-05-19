import { Injectable, OnModuleInit } from '@nestjs/common';
import { getDatabase, type Database } from 'firebase-admin/database';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { canUseFirebaseDatabase, getOrInitializeFirebaseAdminApp } from '../../shared/firebase-admin';
import type {
    AnalysisJobRecord,
    AnalysisResultRecord,
    IncidentEvidenceRecord,
    UploadSessionRecord
} from './incident-ai.types';

interface IncidentAiStateSnapshot {
    uploadSessions: Record<string, UploadSessionRecord>;
    evidenceRecords: Record<string, IncidentEvidenceRecord>;
    analysisJobs: Record<string, AnalysisJobRecord>;
    analysisResults: Record<string, AnalysisResultRecord>;
}

type StateProviderMode = 'local' | 'firebase';

@Injectable()
export class IncidentAiStateStoreService implements OnModuleInit {
    private readonly runtimeDir = path.resolve(
        process.cwd(),
        process.env.INCIDENT_AI_RUNTIME_DIR || '.runtime'
    );

    private readonly stateFilePath = path.join(this.runtimeDir, 'state', 'incident-ai-state.json');
    private readonly firebaseRoot = String(process.env.INCIDENT_AI_FIREBASE_ROOT || 'backend/incidentAi').replace(/^\/+|\/+$/g, '');

    private providerMode: StateProviderMode = 'local';
    private database: Database | null = null;

    private state: IncidentAiStateSnapshot = {
        uploadSessions: {},
        evidenceRecords: {},
        analysisJobs: {},
        analysisResults: {}
    };

    private persistChain = Promise.resolve();

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

    async getUploadSession(uploadSessionId: string) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord<UploadSessionRecord>('uploadSessions', uploadSessionId);
        }
        return this.state.uploadSessions[uploadSessionId] || null;
    }

    async setUploadSession(uploadSessionId: string, session: UploadSessionRecord) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('uploadSessions', uploadSessionId, session);
            return;
        }
        this.state.uploadSessions[uploadSessionId] = session;
        await this.persistLocalState();
    }

    async getEvidenceRecord(incidentKey: string) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord<IncidentEvidenceRecord>('evidenceRecords', incidentKey);
        }
        return this.state.evidenceRecords[incidentKey] || null;
    }

    async setEvidenceRecord(incidentKey: string, record: IncidentEvidenceRecord) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('evidenceRecords', incidentKey, record);
            return;
        }
        this.state.evidenceRecords[incidentKey] = record;
        await this.persistLocalState();
    }

    async getAnalysisJob(incidentKey: string) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord<AnalysisJobRecord>('analysisJobs', incidentKey);
        }
        return this.state.analysisJobs[incidentKey] || null;
    }

    async setAnalysisJob(incidentKey: string, record: AnalysisJobRecord) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('analysisJobs', incidentKey, record);
            return;
        }
        this.state.analysisJobs[incidentKey] = record;
        await this.persistLocalState();
    }

    async deleteAnalysisResult(incidentKey: string) {
        if (this.providerMode === 'firebase') {
            await this.deleteFirebaseRecord('analysisResults', incidentKey);
            return;
        }
        delete this.state.analysisResults[incidentKey];
        await this.persistLocalState();
    }

    async getAnalysisResult(incidentKey: string) {
        if (this.providerMode === 'firebase') {
            return this.readFirebaseRecord<AnalysisResultRecord>('analysisResults', incidentKey);
        }
        return this.state.analysisResults[incidentKey] || null;
    }

    async setAnalysisResult(incidentKey: string, result: AnalysisResultRecord) {
        if (this.providerMode === 'firebase') {
            await this.writeFirebaseRecord('analysisResults', incidentKey, result);
            return;
        }
        this.state.analysisResults[incidentKey] = result;
        await this.persistLocalState();
    }

    async listPendingJobs() {
        if (this.providerMode === 'firebase') {
            const allJobs = await this.listFirebaseRecords<AnalysisJobRecord>('analysisJobs');
            return allJobs
                .filter(([, job]) => ['queued', 'processing'].includes(job.status))
                .map(([incidentKey, job]) => ({ incidentKey, job }));
        }

        return Object.entries(this.state.analysisJobs)
            .filter(([, job]) => ['queued', 'processing'].includes(job.status))
            .map(([incidentKey, job]) => ({ incidentKey, job }));
    }

    async claimAnalysisJob(incidentKey: string, workerId: string, leaseMs: number) {
        const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
        const now = new Date().toISOString();

        if (this.providerMode === 'firebase') {
            const ref = this.requireFirebaseDatabase().ref(this.buildFirebasePath('analysisJobs', incidentKey));
            const result = await ref.transaction((current: AnalysisJobRecord | null) => {
                if (!current || !['queued', 'processing'].includes(current.status)) return current;
                const leaseExpired = !current.leaseExpiresAt || current.leaseExpiresAt <= now;
                const sameWorker = current.workerId === workerId;
                if (!leaseExpired && !sameWorker) return;

                return {
                    ...current,
                    status: 'processing',
                    workerId,
                    leaseExpiresAt,
                    updatedAt: now
                };
            });

            if (!result.committed || !result.snapshot.exists()) return null;
            return result.snapshot.val() as AnalysisJobRecord;
        }

        const current = this.state.analysisJobs[incidentKey];
        if (!current || !['queued', 'processing'].includes(current.status)) return null;

        const leaseExpired = !current.leaseExpiresAt || current.leaseExpiresAt <= now;
        const sameWorker = current.workerId === workerId;
        if (!leaseExpired && !sameWorker) return null;

        const claimedJob: AnalysisJobRecord = {
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

    private resolveProviderMode(): StateProviderMode {
        const requested = String(process.env.INCIDENT_AI_STATE_PROVIDER || 'auto').trim().toLowerCase();
        if (requested === 'local') return 'local';
        if (requested === 'firebase') return this.canUseFirebase() ? 'firebase' : 'local';
        return this.canUseFirebase() ? 'firebase' : 'local';
    }

    private canUseFirebase() {
        return canUseFirebaseDatabase();
    }

    private initializeFirebaseDatabase() {
        return getDatabase(getOrInitializeFirebaseAdminApp());
    }

    private buildFirebasePath(bucket: keyof IncidentAiStateSnapshot, key: string) {
        return `${this.firebaseRoot}/${bucket}/${encodeURIComponent(key)}`;
    }

    private requireFirebaseDatabase() {
        if (!this.database) {
            throw new Error('Firebase Admin database is not initialized.');
        }
        return this.database;
    }

    private async readFirebaseRecord<T>(bucket: keyof IncidentAiStateSnapshot, key: string) {
        const snapshot = await this.requireFirebaseDatabase().ref(this.buildFirebasePath(bucket, key)).get();
        return snapshot.exists() ? (snapshot.val() as T) : null;
    }

    private async writeFirebaseRecord(bucket: keyof IncidentAiStateSnapshot, key: string, value: unknown) {
        await this.requireFirebaseDatabase().ref(this.buildFirebasePath(bucket, key)).set(value);
    }

    private async deleteFirebaseRecord(bucket: keyof IncidentAiStateSnapshot, key: string) {
        await this.requireFirebaseDatabase().ref(this.buildFirebasePath(bucket, key)).remove();
    }

    private async listFirebaseRecords<T>(bucket: keyof IncidentAiStateSnapshot) {
        const snapshot = await this.requireFirebaseDatabase().ref(`${this.firebaseRoot}/${bucket}`).get();
        const raw = snapshot.exists() ? (snapshot.val() as Record<string, T>) : {};
        return Object.entries(raw).map(([encodedKey, value]) => [decodeURIComponent(encodedKey), value] as const);
    }

    private async loadLocalState() {
        try {
            const raw = await fs.readFile(this.stateFilePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<IncidentAiStateSnapshot>;
            this.state = {
                uploadSessions: parsed.uploadSessions || {},
                evidenceRecords: parsed.evidenceRecords || {},
                analysisJobs: parsed.analysisJobs || {},
                analysisResults: parsed.analysisResults || {}
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    private async persistLocalState() {
        this.persistChain = this.persistChain.then(async () => {
            await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
            await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8');
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
}
