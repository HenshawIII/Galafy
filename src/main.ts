import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module.js';
import { createOpenApiDocument } from './swagger/openapi-document.js';
import { config } from 'dotenv';
config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });

  // Configure Socket.IO adapter for WebSocket support
  app.useWebSocketAdapter(new IoAdapter(app));

  // Enable CORS for mobile apps (allow all origins)
  app.enableCors({
    origin: true, // Allow all origins for mobile apps
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
