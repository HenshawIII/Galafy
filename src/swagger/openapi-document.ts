import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Public Gala REST vs bank debit-wallet API (ProcessClientTransfer).
 * Clients never send `securityInfo`; the server generates it and stores a hash for the bank auth callback.
 */
export const GALA_SWAGGER_PUBLIC_VS_PROVIDER = `

---

### Transfers and payouts: Gala API vs bank (debit-wallet)

| Layer | Caller | Body |
|-------|--------|------|
| **Gala REST** (\`/api/wallets/...\`) | Your app (Bearer JWT) | User fields only: e.g. wallet virtual account numbers, amount, bank code for payouts. **No \`securityInfo\`.** |
| **ProcessClientTransfer** (bank) | Gala server only | Full mandate payload including \`securityInfo\`, \`amount\` (kobo), bank routing fields, \`transactionReference\`, \`useCustomNarration\`. |

**Wallet-to-wallet:** \`POST /api/wallets/transfer/wallet-to-wallet\` — single step; server builds \`securityInfo\` internally.

**Payout to external bank:** \`POST /api/wallets/payout/initiate\` then \`POST /api/wallets/payout/confirm\` (OTP + payout PIN); server calls ProcessClientTransfer for the net amount and again for admin fee sweep when applicable.

**Bank → Gala webhooks (not in this Swagger UI):** mandate check \`POST /api/provider/transaction-auth-callback\`; settlement \`POST /api/provider/transaction-callback\`. Configure these URLs with your banking partner; \`securityInfo\` is validated against stored transaction hashes.

**Env:** \`DEBIT_WALLET_MANDATE_SECRET\` (mandate HMAC), \`PROVIDER_DEBIT_WALLET_ACCESS_KEY\` / \`PROVIDER_DEBIT_WALLET_APIM_KEY\` (debit-wallet API).
`;

export function createOpenApiDocument(app: INestApplication) {
  const port = process.env.PORT || 3000;
  const baseUrl = process.env.API_BASE_URL || process.env.APP_URL || `http://localhost:${port}`;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gala API')
    .setDescription(
      `API documentation for Gala payment and event management platform

**Download OpenAPI Spec:** [JSON](/api/docs-json) (for Postman import)
${GALA_SWAGGER_PUBLIC_VS_PROVIDER}`,
    )
    .setVersion('1.0')
    .addServer(baseUrl, 'Current server')
    .addTag('users', 'User management endpoints')
    .addTag('auth', 'Authentication endpoints')
    .addTag('customers', 'Customer and KYC management endpoints')
    .addTag('wallets', 'Wallet management endpoints')
    .addTag('payments', 'Payment and payout endpoints')
    .addTag('notifications', 'Notification management endpoints')
    .addTag('sprays', 'Live spray  endpoints for events')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token obtained from login endpoint. Format: Bearer <token>',
      },
      'bearer',
    )
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}
