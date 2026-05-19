import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { DerivedAudioRecord, DerivedFrameRecord, UploadedFileRecord } from './incident-ai.types';

@Injectable()
export class IncidentAiStorageService {
    private readonly runtimeRoot = path.resolve(
        process.cwd(),
        process.env.INCIDENT_AI_RUNTIME_DIR || '.runtime'
    );

    async saveUploadedFile({
        storagePath,
        kind,
        fileName,
        mimeType,
        buffer,
        sizeBytes
    }: {
        storagePath: string;
        kind: 'photo' | 'video';
        fileName: string;
        mimeType: string;
        buffer: Buffer;
        sizeBytes: number;
    }): Promise<UploadedFileRecord> {
        const absolutePath = this.resolveStoragePath(storagePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, buffer);

        return {
            kind,
            storagePath,
            absolutePath,
            fileName,
            mimeType,
            sizeBytes,
            sha256: createHash('sha256').update(buffer).digest('hex'),
            uploadedAt: new Date().toISOString()
        };
    }

    async fileExists(storagePath: string) {
        try {
            await fs.access(this.resolveStoragePath(storagePath));
            return true;
        } catch {
            return false;
        }
    }

    async writeDerivedFile({
        storagePath,
        buffer,
        mimeType,
        fileName
    }: {
        storagePath: string;
        buffer: Buffer;
        mimeType: string;
        fileName: string;
    }): Promise<DerivedAudioRecord | DerivedFrameRecord> {
        const absolutePath = this.resolveStoragePath(storagePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, buffer);

        if (mimeType.startsWith('audio/')) {
            return {
                storagePath,
                absolutePath,
                mimeType
            };
        }

        return {
            storagePath,
            absolutePath,
            mimeType,
            fileName
        };
    }

    async readFileBuffer(absolutePath: string) {
        return fs.readFile(absolutePath);
    }

    async readFileAsDataUrl(absolutePath: string, mimeType: string) {
        const buffer = await this.readFileBuffer(absolutePath);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    buildDerivedStoragePath(orgId: string, incidentId: string, fileName: string) {
        return `orgs/${orgId}/incidents/${incidentId}/derived/${fileName}`;
    }

    resolveStoragePath(storagePath: string) {
        const normalized = String(storagePath || '')
            .replace(/^[/\\]+/, '')
            .replace(/\.\./g, '');

        return path.join(this.runtimeRoot, 'storage', normalized);
    }
}
