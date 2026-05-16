/**
 * Backfill: encrypt legacy plaintext tier1PendingBvn and set tier1BvnHash.
 *
 * Usage:
 *   npx ts-node --esm src/scripts/migrate-encrypt-tier1-bvn.ts
 *   npx ts-node --esm src/scripts/migrate-encrypt-tier1-bvn.ts --dry-run
 */
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { BvnCryptoService } from '../common/crypto/bvn-crypto.service.js';

config();

const BVN_PLAIN_PATTERN = /^\d{11}$/;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const prisma = new PrismaClient();
  const crypto = new BvnCryptoService();

  const customers = await prisma.customer.findMany({
    where: { tier1PendingBvn: { not: null } },
    select: { id: true, tier1PendingBvn: true, tier1BvnHash: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const customer of customers) {
    const stored = customer.tier1PendingBvn?.trim() ?? '';
    if (!stored || crypto.isEncrypted(stored)) {
      skipped++;
      continue;
    }
    if (!BVN_PLAIN_PATTERN.test(stored)) {
      console.warn(`Skip customer ${customer.id}: tier1PendingBvn is not plaintext 11-digit BVN`);
      skipped++;
      continue;
    }

    const encrypted = crypto.encrypt(stored);
    const hash = crypto.hash(stored);

    if (dryRun) {
      console.log(`[dry-run] Would encrypt customer ${customer.id}`);
      updated++;
      continue;
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        tier1PendingBvn: encrypted,
        tier1BvnHash: customer.tier1BvnHash ?? hash,
      },
    });
    updated++;
  }

  console.log(`Done. updated=${updated} skipped=${skipped} dryRun=${dryRun}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
