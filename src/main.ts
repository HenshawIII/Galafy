import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { createOpenApiDocument } from './swagger/openapi-document.js';
import { config } from 'dotenv';
config();

/** 5MB partner face-image cap as base64 is ~6.7MB; 10MB covers JSON wrapping. */
const JSON_BODY_LIMIT = '10mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
    bodyParser: false, // Re-register below so JSON limit is not stuck at Nest's 100kb default
  });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });

  // Configure Socket.IO adapter for WebSocket support
  app.useWebSocketAdapter(new IoAdapter(app));

  // Browser origins: ops portal + localhost. No Origin = native mobile / non-browser clients.
  const defaultAllowedOrigins = [
    'https://ops.galafy.co',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];
  const extraOrigins = (process.env.ADMIN_ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([...defaultAllowedOrigins, ...extraOrigins]);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.setGlobalPrefix('api');
  // Global validation pipe to validate all incoming requests
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are sent
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Enable implicit type conversion
      },
    }),
  );

  const port = process.env.PORT || 3000;

  const baseUrl = process.env.API_BASE_URL || process.env.APP_URL || `http://localhost:${port}`;

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document);

  // Expose OpenAPI JSON spec endpoint for Postman import
  app.getHttpAdapter().get('/api/docs-json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(document);
  });

  await app.listen(port, '0.0.0.0');

  console.log(`Application is running on: ${baseUrl}/api`);
  console.log(`Swagger documentation available at: ${baseUrl}/api/docs`);
  console.log(`OpenAPI JSON spec available at: ${baseUrl}/api/docs-json`);
  console.log(`WebSocket server available at: ws://localhost:${port}/live`);
}
bootstrap();
