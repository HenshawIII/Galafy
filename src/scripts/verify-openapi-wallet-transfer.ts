/**
 * CI/local check: OpenAPI POST /wallets/transfer/wallet-to-wallet uses InitiateWalletToWalletTransferDto
 * (not ProcessClientTransfer / no securityInfo on client body).
 *
 * Uses a minimal Nest TestingModule (no Redis/DB) — only controller metadata + Swagger.
 */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WalletmoduleController } from '../walletmodule/walletmodule.controller.js';
import { WalletmoduleService } from '../walletmodule/walletmodule.service.js';
import { WalletExportService } from '../walletmodule/services/wallet-export.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { createOpenApiDocument } from '../swagger/openapi-document.js';

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    controllers: [WalletmoduleController],
    providers: [
      { provide: WalletmoduleService, useValue: {} },
      { provide: WalletExportService, useValue: {} },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
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
