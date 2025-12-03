import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import {config} from 'dotenv';
config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });
  app.enableCors();
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
  
  // Get base URL from environment or default to localhost
  const baseUrl = process.env.API_BASE_URL || process.env.APP_URL || `http://localhost:${port}`;
  
  // Swagger/OpenAPI documentation setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gala API')
    .setDescription('API documentation for Gala payment and event management platform')
    .setVersion('1.0')
    .addServer(baseUrl, 'Current server')
    .addTag('users', 'User management endpoints')
    .addTag('auth', 'Authentication endpoints')
    .addTag('customers', 'Customer and KYC management endpoints')
    .addTag('wallets', 'Wallet management endpoints')
    .addTag('payments', 'Payment and payout endpoints')
    .addTag('notifications', 'Notification management endpoints')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  
  await app.listen(port, '0.0.0.0');
  
  console.log(`Application is running on: ${baseUrl}/api`);
  console.log(`Swagger documentation available at: ${baseUrl}/api/docs`);
}
bootstrap();
