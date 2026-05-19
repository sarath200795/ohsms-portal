import 'dotenv/config';
import 'reflect-metadata';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import type { INestApplication } from '@nestjs/common';
import { createNestApplication } from './create-nest-app';

setGlobalOptions({
    region: 'asia-south1',
    memory: '2GiB',
    timeoutSeconds: 540,
    cpu: 1,
    concurrency: 20,
    maxInstances: 5
});

let cachedNestApp: INestApplication | null = null;
let cachedHandler: ((req: Parameters<ReturnType<typeof onRequest>>[0], res: Parameters<ReturnType<typeof onRequest>>[1]) => void) | null = null;

const getHandler = async () => {
    if (cachedHandler) return cachedHandler;

    cachedNestApp = await createNestApplication();
    await cachedNestApp.init();
    cachedHandler = cachedNestApp.getHttpAdapter().getInstance();
    return cachedHandler;
};

export const incidentAiApi = onRequest(async (request, response) => {
    const handler = await getHandler();
    if (!handler) {
        throw new Error('Incident AI handler could not be initialized.');
    }
    return handler(request, response);
});
