import { Test } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { InflowCreditService } from './inflow-credit.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { OrganizationWalletService } from '../services/organization-wallet.service.js';
import { ConfigService } from '../../config/config.service.js';
import { DebitWalletMandateService } from '../debit-mandate/debit-wallet-mandate.service.js';
import { ProviderService } from '../../provider/provider.service.js';
import { TierLimitService } from '../services/tier-limit.service.js';
import { ProviderAccountStatusService } from '../provider-account-status/provider-account-status.service.js';
import { AccountRestrictionNotifyService } from '../account-restriction/account-restriction-notify.service.js';
import { AdminNotificationService } from '../../admin/admin-notification.service.js';
import { SprayTransferLookupService } from '../provider-notification/spray-transfer-lookup.service.js';
import { MixpanelService } from '../../analytics/mixpanel.service.js';

function mockFn<T extends (...args: unknown[]) => unknown>(impl?: T) {
  const fn = (...args: Parameters<T>) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [] as Parameters<T>[];
  return fn as T & { calls: Parameters<T>[] };
}

describe('InflowCreditService', () => {
  let service: InflowCreditService;

  const db = {
    wallet: { findFirst: mockFn() },
    $transaction: mockFn(),
  };

  const sprayLookup = {
    findPendingSprayDebitForReceiver: mockFn(async () => null),
    hasRecentSprayCreditForAmount: mockFn(async () => false),
  };

  beforeEach(async () => {
    db.wallet.findFirst = mockFn(async () => ({ id: 'w-receiver' }));
    db.$transaction = mockFn();
    sprayLookup.findPendingSprayDebitForReceiver = mockFn(async () => null);
    sprayLookup.hasRecentSprayCreditForAmount = mockFn(async () => false);

    const module = await Test.createTestingModule({
      providers: [
        InflowCreditService,
        { provide: DatabaseService, useValue: db },
        { provide: OrganizationWalletService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: DebitWalletMandateService, useValue: {} },
        { provide: ProviderService, useValue: {} },
        { provide: TierLimitService, useValue: {} },
        { provide: ProviderAccountStatusService, useValue: {} },
        { provide: AccountRestrictionNotifyService, useValue: {} },
        { provide: AdminNotificationService, useValue: {} },
        { provide: SprayTransferLookupService, useValue: sprayLookup },
        { provide: MixpanelService, useValue: { track: mockFn(), identify: mockFn(), setOnce: mockFn() } },
      ],
    }).compile();

    service = module.get(InflowCreditService);
  });

  it('skips processBankInflow for event spray narration without funding or fee sweep', async () => {
    const result = await service.processBankInflow({
      accountNumber: '1234567890',
      grossAmount: new Decimal(500),
      providerFee: new Decimal(0),
      providerReference: 'provider-ref-spray-1',
      narration: 'Spray in event FAM AND FRIENDS , EventId: 42fe5e31-9623-4899-b223-17b1d9c39648',
      providerPayload: {},
      webhookEvent: { event: 'transaction-notification', paymentReference: 'provider-ref-spray-1' },
    });

    expect(result.status).toBe('success');
    expect(result.isDuplicate).toBe(true);
    expect(result.walletId).toBe('w-receiver');
    expect(result.transactionId).toBeUndefined();
    expect(db.$transaction.calls.length).toBe(0);
  });

  it('skips processBankInflow when a pending spray debit matches receiver and amount', async () => {
    sprayLookup.findPendingSprayDebitForReceiver = mockFn(async () => ({
      id: 'spray-debit-1',
      reference: 'SPRAY-abc123',
      walletId: 'w-sprayer',
      amount: new Decimal(500),
      metadata: {},
    }));

    const result = await service.processBankInflow({
      accountNumber: '1234567890',
      grossAmount: new Decimal(500),
      providerFee: new Decimal(0),
      providerReference: 'provider-ref-spray-2',
      narration: 'Inflow payment',
      providerPayload: {},
      webhookEvent: { event: 'transaction-notification', paymentReference: 'provider-ref-spray-2' },
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.walletId).toBe('w-receiver');
    expect(db.$transaction.calls.length).toBe(0);
  });
});
