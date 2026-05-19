import 'dotenv/config';
import 'reflect-metadata';
import { createNestApplication } from './create-nest-app';

async function bootstrap() {
    const app = await createNestApplication();
    const port = Number(process.env.PORT || 4010);
    const host = process.env.HOST || '0.0.0.0';
    await app.listen(port, host);
    console.log(`Incidents AI backend listening on http://${host}:${port}/api/v1`);
}

bootstrap();
