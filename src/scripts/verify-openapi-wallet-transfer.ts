/**
 * CI/local check: OpenAPI POST /wallets/transfer/wallet-to-wallet uses InitiateWalletToWalletTransferDto
 * (not ProcessClientTransfer / no securityInfo on client body).
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { createOpenApiDocument } from '../swagger/openapi-document.js';

async function main(): Promise<void> {
  config();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const doc = createOpenApiDocument(app);
  await app.close();

  const paths = doc.paths ?? {};
  const pathKeys = Object.keys(paths);
  const w2wPath = pathKeys.find(
    (k) => k.endsWith('/wallets/transfer/wallet-to-wallet') || k === '/api/wallets/transfer/wallet-to-wallet',
  );
  if (!w2wPath) {
    console.error('verify-openapi: missing wallet-to-wallet path. Candidates:', pathKeys.filter((k) => k.includes('wallet')));
    process.exit(1);
  }

  const post = paths[w2wPath]?.post;
  if (!post) {
    console.error('verify-openapi: no POST for', w2wPath);
    process.exit(1);
  }

  const rb = post.requestBody;
  const schemaRef =
    rb && typeof rb === 'object' && 'content' in rb
      ? (rb as { content?: Record<string, { schema?: { $ref?: string } }> }).content?.['application/json']?.schema?.$ref
      : undefined;
  if (!schemaRef || !schemaRef.includes('InitiateWalletToWalletTransferDto')) {
    console.error('verify-openapi: expected requestBody $ref to InitiateWalletToWalletTransferDto, got', schemaRef);
    process.exit(1);
  }

  const schemaName = schemaRef.replace('#/components/schemas/', '');
  const schema = doc.components?.schemas?.[schemaName] as { properties?: Record<string, unknown> } | undefined;
  const props = schema?.properties ? Object.keys(schema.properties) : [];

  for (const required of ['fromWalletId', 'toWalletId', 'amount']) {
    if (!props.includes(required)) {
      console.error(`verify-openapi: schema ${schemaName} missing property ${required}, has:`, props);
      process.exit(1);
    }
  }
  if (props.includes('securityInfo')) {
    console.error('verify-openapi: client request schema must not include securityInfo');
    process.exit(1);
  }

  console.log(`verify-openapi: OK POST ${w2wPath} -> ${schemaName} (${props.join(', ')})`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
