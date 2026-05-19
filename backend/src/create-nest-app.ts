import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildCorsOptions, validateBackendRuntimeConfig } from './shared/runtime-config';

export async function createNestApplication() {
    validateBackendRuntimeConfig();

    const app = await NestFactory.create(AppModule, {
        cors: buildCorsOptions()
    });

    app.enableShutdownHooks();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
    }));
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    return app;
}
