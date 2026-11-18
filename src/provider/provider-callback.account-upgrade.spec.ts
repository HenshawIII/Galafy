import { WebhookProcessingStatus } from '../../generated/prisma/enums.js';
import { ProviderCallbackService } from './provider-callback.service.js';

function createMockFn<T extends (...args: any[]) => any>() {
  const calls: Parameters<T>[] = [];
  const fn = ((...args: Parameters<T>) => {
    calls.push(args);
    return (fn as any).impl ? (fn as any).impl(...args) : undefined;
  }) as T & { calls: Parameters<T>[]; impl?: T; mockResolvedValue: (value: any) => void };
  fn.calls = calls;
  fn.mockResolvedValue = (value: any) => {
    (fn as any).impl = (async () => value) as T;
  };
  return fn;
}

describe('ProviderCallbackService.handleAccountUpgradeCallback', () => {
  const databaseService = {
    providerWebhookEvent: {
      create: createMockFn(),
      update: createMockFn(),
    },
    customer: {
      findFirst: createMockFn(),
    },
    wallet: {
      findFirst: createMockFn(),
    },
  };

  const customerKycService = {
    completeTier3FromProviderWebhook: createMockFn(),
    markTier3AddressVerificationFailedFromProviderWebhook: createMockFn(),
  };

  const mixpanel = { track: createMockFn(), identify: createMockFn() };
  const emailService = { sendKycFailureComplianceEmail: createMockFn() };

  let service: ProviderCallbackService;

  beforeEach(() => {
    databaseService.providerWebhookEvent.create.calls.length = 0;
    databaseService.providerWebhookEvent.update.calls.length = 0;
    databaseService.customer.findFirst.calls.length = 0;
    databaseService.wallet.findFirst.calls.length = 0;
    customerKycService.completeTier3FromProviderWebhook.calls.length = 0;
    customerKycService.markTier3AddressVerificationFailedFromProviderWebhook.calls.length = 0;

    databaseService.providerWebhookEvent.create.mockResolvedValue({ id: 'evt-1' });
    databaseService.providerWebhookEvent.update.mockResolvedValue({});
    databaseService.customer.findFirst.mockResolvedValue(null);
    databaseService.wallet.findFirst.mockResolvedValue(null);
    customerKycService.completeTier3FromProviderWebhook.mockResolvedValue({ alreadyCompleted: false });
    customerKycService.markTier3AddressVerificationFailedFromProviderWebhook.mockResolvedValue({
      ignored: false,
    });

    service = new ProviderCallbackService(
      databaseService as any,
      mixpanel as any,
      emailService as any,
      customerKycService as any,
    );
  });

  const successPayload = {
    title: 'Account Upgraded Successfully',
    message: 'Address has been verified and account upgraded successfully for the account with details below',
    data: {
      email: 'user@alat.ng',
      nuban: '0447131004',
      nubanName: 'JANE DOE',
      type: 1,
      nubanStatus: 'Active',
      phoneNumber: '07011223344',
    },
    requestType: 2,
  };

  it('always returns received:true and persists the webhook event', async () => {
    const result = await service.handleAccountUpgradeCallback(successPayload);
    expect(result).toEqual({ received: true });
    expect(databaseService.providerWebhookEvent.create.calls.length).toBe(1);
    expect(databaseService.providerWebhookEvent.create.calls[0]?.[0]).toMatchObject({
      data: {
        event: 'account-upgrade',
        paymentReference: 'upgrade-0447131004',
        processingStatus: WebhookProcessingStatus.PENDING,
      },
    });
  });

  it('resolves by tier1Nuban first and completes Tier 3 on success', async () => {
    databaseService.customer.findFirst.mockResolvedValue({ id: 'cust-1' });

    await service.handleAccountUpgradeCallback(successPayload);

    expect(databaseService.customer.findFirst.calls[0]?.[0]).toMatchObject({
      where: { tier1Nuban: '0447131004' },
    });
    expect(databaseService.wallet.findFirst.calls.length).toBe(0);
    expect(customerKycService.completeTier3FromProviderWebhook.calls[0]?.[0]).toBe('cust-1');
    expect(databaseService.providerWebhookEvent.update.calls.at(-1)?.[0]).toMatchObject({
      data: { processingStatus: WebhookProcessingStatus.PROCESSED },
    });
  });

  it('falls back to wallet virtualAccountNumber when tier1Nuban miss', async () => {
    databaseService.customer.findFirst.mockResolvedValue(null);
    databaseService.wallet.findFirst.mockResolvedValue({ customerId: 'cust-2' });

    await service.handleAccountUpgradeCallback(successPayload);

    expect(databaseService.wallet.findFirst.calls[0]?.[0]).toMatchObject({
      where: { virtualAccountNumber: '0447131004' },
    });
    expect(customerKycService.completeTier3FromProviderWebhook.calls[0]?.[0]).toBe('cust-2');
  });

  it('marks address verification failed on failure title', async () => {
    databaseService.customer.findFirst.mockResolvedValue({ id: 'cust-1' });

    await service.handleAccountUpgradeCallback({
      ...successPayload,
      title: 'Address verification failed',
      message: 'Address verification failed for customer with details below',
    });

    expect(customerKycService.completeTier3FromProviderWebhook.calls.length).toBe(0);
    expect(
      customerKycService.markTier3AddressVerificationFailedFromProviderWebhook.calls[0]?.[0],
    ).toBe('cust-1');
  });

  it('does not mutate KYC on unknown outcome but still acknowledges', async () => {
    databaseService.customer.findFirst.mockResolvedValue({ id: 'cust-1' });

    const result = await service.handleAccountUpgradeCallback({
      ...successPayload,
      title: 'Something else',
      message: 'No matching copy',
    });

    expect(result).toEqual({ received: true });
    expect(customerKycService.completeTier3FromProviderWebhook.calls.length).toBe(0);
    expect(customerKycService.markTier3AddressVerificationFailedFromProviderWebhook.calls.length).toBe(0);
  });

  it('soft-fails when nuban is missing but still returns received:true', async () => {
    const result = await service.handleAccountUpgradeCallback({
      title: 'Account Upgraded Successfully',
      data: { email: 'user@alat.ng' },
      requestType: 2,
    });

    expect(result).toEqual({ received: true });
    expect(customerKycService.completeTier3FromProviderWebhook.calls.length).toBe(0);
    expect(databaseService.providerWebhookEvent.update.calls.at(-1)?.[0]).toMatchObject({
      data: { processingStatus: WebhookProcessingStatus.FAILED },
    });
  });
});
