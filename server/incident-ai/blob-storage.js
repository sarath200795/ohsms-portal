import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { head, put } from '@vercel/blob';

const sanitizeStoragePath = (value) => String(value || '')
    .replace(/^[/\\]+/, '')
    .replace(/\.\./g, '');

const ensureDirectory = async (filePath) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
};

export class VercelBlobIncidentAiStorageService {
    constructor() {
        this.runtimeRoot = path.join(os.tmpdir(), 'ohsms-incident-ai');
        this.blobToken = process.env.BLOB_READ_WRITE_TOKEN || '';
    }

    buildDerivedStoragePath(orgId, incidentId, fileName) {
        return `orgs/${orgId}/incidents/${incidentId}/derived/${fileName}`;
    }

    resolveStoragePath(storagePath) {
        return path.join(this.runtimeRoot, sanitizeStoragePath(storagePath));
    }

    async saveUploadedFile({ storagePath, kind, fileName, mimeType, buffer, sizeBytes }) {
        const normalizedPath = sanitizeStoragePath(storagePath);
        const blob = await put(normalizedPath, buffer, {
            access: 'private',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: mimeType
        });

        const absolutePath = await this.writeLocalCache(normalizedPath, buffer);

        return {
            kind,
            storagePath: normalizedPath,
            absolutePath,
            blobUrl: blob.url,
            fileName,
            mimeType,
            sizeBytes,
            sha256: createHash('sha256').update(buffer).digest('hex'),
            uploadedAt: new Date().toISOString()
        };
    }

    async fileExists(storagePath) {
        try {
            await head(sanitizeStoragePath(storagePath), {
                access: 'private',
                token: this.blobToken || undefined
            });
            return true;
        } catch {
            return false;
        }
    }

    async writeDerivedFile({ storagePath, buffer, mimeType, fileName }) {
        const normalizedPath = sanitizeStoragePath(storagePath);
        const blob = await put(normalizedPath, buffer, {
            access: 'private',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: mimeType
        });
        const absolutePath = await this.writeLocalCache(normalizedPath, buffer);

        if (mimeType.startsWith('audio/')) {
            return {
                storagePath: normalizedPath,
                absolutePath,
                blobUrl: blob.url,
                mimeType
            };
        }

        return {
            storagePath: normalizedPath,
            absolutePath,
            blobUrl: blob.url,
            mimeType,
            fileName
        };
    }

    async ensureLocalFile(fileRecord) {
        if (fileRecord?.absolutePath) {
            try {
                await fs.access(fileRecord.absolutePath);
                return fileRecord.absolutePath;
            } catch {
                // continue to rehydrate from blob
            }
        }

        const blobUrl = String(fileRecord?.blobUrl || '').trim();
        if (!blobUrl) {
            throw new Error(`Blob URL is missing for storage path ${fileRecord?.storagePath || 'unknown'}.`);
        }

        const response = await fetch(blobUrl, {
            headers: this.blobToken ? {
                Authorization: `Bearer ${this.blobToken}`
            } : undefined
        });

        if (!response.ok) {
            throw new Error(`Unable to fetch blob ${blobUrl}. Status ${response.status}.`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const absolutePath = await this.writeLocalCache(fileRecord.storagePath, buffer);
        fileRecord.absolutePath = absolutePath;
        return absolutePath;
    }

    async readFileBuffer(fileRef) {
        if (typeof fileRef === 'string') {
            return fs.readFile(fileRef);
        }

        const absolutePath = await this.ensureLocalFile(fileRef);
        return fs.readFile(absolutePath);
    }

    async readFileAsDataUrl(fileRef, mimeType) {
        const buffer = await this.readFileBuffer(fileRef);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    async writeLocalCache(storagePath, buffer) {
        const absolutePath = this.resolveStoragePath(storagePath);
        await ensureDirectory(absolutePath);
        await fs.writeFile(absolutePath, buffer);
        return absolutePath;
    }
}
