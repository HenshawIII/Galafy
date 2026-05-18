import {
  BadRequestException,
  forwardRef,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  TransactionType,
  TransactionDirection,
  TransactionStatus,
  FundingStatus,
  FundingChannel,
} from '../../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { normalizeToKobo } from '../utils/money.util.js';
import { calculateFundingFee } from '../utils/fee.util.js';
import { OrganizationWalletService } from '../services/organization-wallet.service.js';
import { ConfigService } from '../../config/config.service.js';
import { ProviderService } from '../../provider/provider.service.js';
import { DebitWalletMandateService } from '../debit-mandate/debit-wallet-mandate.service.js';
import { buildStableProviderRef } from '../utils/provider-transaction-reference.util.js';

const DEFAULT_PROVIDER_BANK_CODE = '035';
const DEFAULT_PROVIDER_BANK_NAME = 'WEMA BANK';

export type BankInflowProcessInput = {
  accountNumber: string;
  grossAmount: Decimal;
  providerFee: Decimal;
  providerReference: string;
  narration: string;
  senderName?: string;
  senderBank?: string;
  providerPayload: unknown;
  webhookEvent: { event: string; paymentReference: string };
};

export type BankInflowProcessResult = {
  status: 'success';
  message: string;
  transactionId?: string;
  fundingTransactionId?: string;
  isDuplicate: boolean;
  walletId?: string;
};

@Injectable()
export class InflowCreditService {
  private readonly logger = new Logger(InflowCreditService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly organizationWalletService: OrganizationWalletService,
    private readonly configService: ConfigService,
    private readonly debitWalletMandateService: DebitWalletMandateService,
    @Inject(forwardRef(() => ProviderService))
    private readonly providerService: ProviderService,
  ) {}

  async processBankInflow(input: BankInflowProcessInput): Promise<BankInflowProcessResult> {
    const {
      accountNumber,
      grossAmount,
      providerFee,
      providerReference,
      narration,
      senderName,
      senderBank,
      providerPayload,
      webhookEvent,
    } = input;

    this.logger.log(
      `INFLOW start: account=${accountNumber}, providerReference=${providerReference}, grossAmount=${grossAmount.toString()}, providerFee=${providerFee.toString()}, event=${webhookEvent.event}`,
    );

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
    });

    if (!wallet) {
      this.logger.error(
        `INFLOW failed at initial wallet lookup: account=${accountNumber}, providerReference=${providerReference}`,
      );
      throw new NotFoundException(`Wallet not found for account number: ${accountNumber}`);
    }
    this.logger.log(
      `INFLOW wallet resolved: account=${accountNumber}, walletId=${wallet.id}, providerReference=${providerReference}`,
    );

    type FeeSweepPayload = {
      amount: Decimal;
      feeSweepReference: string;
      userVirtualAccount: string;
      orgVirtualAccount: string;
      orgBankCode: string;
      orgBankName: string;
      securityInfo: string;
    };

    let result: (BankInflowProcessResult & { pendingFeeSweep: FeeSweepPayload | null }) | undefined;
    try {
      result = await this.databaseService.$transaction(
        async (tx: Prisma.TransactionClient) => {
          this.logger.log(`INFLOW transaction opened: providerReference=${providerReference}, walletId=${wallet.id}`);

          const w = await tx.wallet.findFirst({
            where: { virtualAccountNumber: accountNumber },
            include: {
              customer: {
                include: {
                  user: true,
                },
              },
            },
          });

          if (!w) {
            this.logger.error(
              `INFLOW failed in transaction wallet lookup: account=${accountNumber}, providerReference=${providerReference}`,
            );
            throw new NotFoundException(`Wallet not found for account number: ${accountNumber}`);
          }

          await tx.$queryRaw`
            SELECT id FROM "Wallet" WHERE id = ${w.id} FOR UPDATE
          `;
          this.logger.log(`INFLOW wallet lock acquired: walletId=${w.id}, providerReference=${providerReference}`);

          const existingFunding = await tx.fundingTransaction.findUnique({
            where: { providerReference },
            include: {
              transaction: true,
            },
          });

          if (existingFunding) {
            this.logger.log(
              `INFLOW already processed (idempotency): ${providerReference} - returning existing transaction`,
            );
            return {
              status: 'success' as const,
              message: 'Webhook already processed (idempotent)',
              transactionId: existingFunding.transactionId,
              fundingTransactionId: existingFunding.id,
              isDuplicate: true,
              walletId: w.id,
              pendingFeeSweep: null as FeeSweepPayload | null,
            };
          }

          const { fee: adminFee, netAmount, feePercentage } = await calculateFundingFee(grossAmount, this.configService);
          this.logger.log(
            `INFLOW fee computed: providerReference=${providerReference}, adminFee=${adminFee.toString()}, netAmount=${netAmount.toString()}, feePercentage=${feePercentage.toString()}`,
          );

          const adminWalletAccountNumber = this.organizationWalletService.getAdminWalletAccountNumber();

          const lockedUserWallet = await tx.wallet.findUnique({
            where: { id: w.id },
            select: {
              id: true,
              availableBalance: true,
              ledgerBalance: true,
              currencyId: true,
              customerId: true,
              virtualAccountNumber: true,
            },
          });

          if (!lockedUserWallet) {
            throw new NotFoundException('User wallet not found after lock');
          }

          if (!lockedUserWallet.virtualAccountNumber) {
            throw new BadRequestException('User wallet does not have a virtual account number');
          }

          const userTransactionRef = `INFLOW-${randomUUID()}`;
          const feeSweepReference = buildStableProviderRef('FEE', providerReference);
          const groupReference = `GRP-${randomUUID()}`;

          const newUserAvailableBalanceAfterCredit = normalizeToKobo(
            lockedUserWallet.availableBalance.plus(grossAmount),
          );
          const newUserLedgerBalanceAfterCredit = normalizeToKobo(lockedUserWallet.ledgerBalance.plus(grossAmount));

          await tx.wallet.update({
            where: { id: w.id },
            data: {
              availableBalance: newUserAvailableBalanceAfterCredit,
              ledgerBalance: newUserLedgerBalanceAfterCredit,
            },
          });
          this.logger.log(
            `INFLOW wallet balances credited: walletId=${w.id}, providerReference=${providerReference}, creditedGross=${grossAmount.toString()}`,
          );

          const orgWallet = await this.organizationWalletService.getAdminWalletRecord();
          const orgVirtualAccount = orgWallet?.virtualAccountNumber || adminWalletAccountNumber;
          const orgBankCode = orgWallet?.virtualBankCode?.trim() || DEFAULT_PROVIDER_BANK_CODE;
          const orgBankName = orgWallet?.virtualBankName?.trim() || DEFAULT_PROVIDER_BANK_NAME;

          const normalizedFeePercentage = feePercentage.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);

          if (normalizedFeePercentage.gte(new Decimal('10'))) {
            this.logger.error(
              `Fee percentage ${normalizedFeePercentage.toString()} exceeds maximum allowed value (9.9999). ` +
                `This might indicate an incorrectly configured env variable. Expected decimal (e.g., 0.10 for 10%), not percentage (e.g., 10).`,
            );
            throw new BadRequestException(
              `Invalid fee percentage: ${normalizedFeePercentage.toString()}. ` +
                `Fee percentage must be less than 10. Please check ADMIN_FUNDING_FEE environment variable.`,
            );
          }
          this.logger.log(
            `INFLOW configuration validated: providerReference=${providerReference}, normalizedFeePercentage=${normalizedFeePercentage.toString()}`,
          );

          const userTransaction = await tx.transaction.create({
            data: {
              walletId: w.id,
              type: TransactionType.INFLOW,
              direction: TransactionDirection.CREDIT,
              status: adminFee.gt(0) ? TransactionStatus.PROCESSING : TransactionStatus.SUCCESS,
              amount: netAmount,
              currencyId: w.currencyId,
              reference: userTransactionRef,
              externalReference: providerReference,
              groupReference,
              narration,
              metadata: {
                senderName,
                senderBank,
                providerFee: providerFee.toString(),
                adminFee: adminFee.toString(),
                grossAmount: grossAmount.toString(),
                feePercentage: feePercentage.toString(),
                feeType: 'funding',
                feeTransferReference: feeSweepReference,
                feeSweepPending: adminFee.gt(0),
                internalLedger: true,
              },
            },
          });

          const fundingTransaction = await tx.fundingTransaction.create({
            data: {
              walletId: w.id,
              amount: grossAmount,
              fee: adminFee,
              channel: FundingChannel.BANK_TRANSFER,
              status: FundingStatus.SUCCESS,
              transactionId: userTransaction.id,
              providerReference,
              providerPayload: providerPayload as any,
            },
          });

          this.logger.log(
            `💰 FUNDING TRANSACTION: GrossAmount=${grossAmount.toString()}, ` +
              `NetAmount=${netAmount.toString()}, AdminFee=${adminFee.toString()}, ` +
              `ProviderFee=${providerFee.toString()}, ` +
              `WalletId=${w.id}, AccountNumber=${accountNumber}, ` +
              `TxId=${userTransaction.id}, FundingTxId=${fundingTransaction.id}, ` +
              `ProviderRef=${providerReference}, InternalRef=${userTransactionRef}, ` +
              `SenderName="${senderName ?? ''}", SenderBank="${senderBank ?? ''}", ` +
              `Description="${narration}"`,
          );

          const adminFeeRow = await tx.adminFee.create({
            data: {
              walletId: w.id,
              customerId: lockedUserWallet.customerId,
              amount: adminFee,
              feeType: 'funding',
              feePercentage: normalizedFeePercentage,
              relatedTransactionId: userTransaction.id,
              fundingTransactionId: fundingTransaction.id,
              status: adminFee.gt(0) ? 'PENDING' : 'COLLECTED',
              grossAmount: grossAmount,
              netAmount: netAmount,
              adminWalletAccountNumber: adminWalletAccountNumber,
              metadata: {
                providerReference,
                providerFee: providerFee.toString(),
                threshold: grossAmount.lte(new Decimal('100000.00')) ? 'below_100k' : 'above_100k',
                senderName,
                senderBank,
                feeTransferReference: feeSweepReference,
                internalLedger: true,
              },
            },
          });

          let feeSweepSecurityInfo: string | null = null;
          if (adminFee.gt(0)) {
            const adminFeeKobo = normalizeToKobo(adminFee);
            const amountNormalized = adminFeeKobo.toFixed(2);
            const { securityInfo, securityInfoHash } = this.debitWalletMandateService.generateInflowFeeSweepMandate({
              feeSweepReference,
              walletId: w.id,
              amountNormalized,
              userVirtualAccount: lockedUserWallet.virtualAccountNumber,
              orgVirtualAccount,
              orgBankCode,
            });
            feeSweepSecurityInfo = securityInfo;
            await tx.transaction.create({
              data: {
                walletId: w.id,
                type: TransactionType.ADJUSTMENT,
                direction: TransactionDirection.DEBIT,
                status: TransactionStatus.PENDING,
                amount: adminFee,
                currencyId: w.currencyId,
                reference: feeSweepReference,
                externalReference: providerReference,
                groupReference,
                securityInfoHash,
                destinationAccountNumber: orgVirtualAccount,
                destinationAccountName: 'Organization',
                narration: `Admin funding fee (inflow ${providerReference})`,
                metadata: {
                  inflowAdminFeeSweep: true,
                  inflowTransactionId: userTransaction.id,
                  adminFeeId: adminFeeRow.id,
                  providerReference,
                },
              },
            });
          }

          await tx.providerWebhookEvent.create({
            data: {
              event: webhookEvent.event,
              paymentReference: webhookEvent.paymentReference,
              payload: providerPayload as any,
              processingStatus: 'PROCESSED',
            },
          });

          this.logger.log(
            `INFLOW processed: ${providerReference} - Gross: ${grossAmount.toString()}, Fee: ${adminFee.toString()}, Net: ${netAmount.toString()} to wallet ${w.id}`,
          );

          const feeSweepPayload: FeeSweepPayload | null =
            adminFee.gt(0) && feeSweepSecurityInfo
              ? {
                  amount: adminFee,
                  feeSweepReference,
                  userVirtualAccount: lockedUserWallet.virtualAccountNumber,
                  orgVirtualAccount,
                  orgBankCode,
                  orgBankName,
                  securityInfo: feeSweepSecurityInfo,
                }
              : null;

          return {
            status: 'success' as const,
            message: 'Webhook processed successfully',
            transactionId: userTransaction.id,
            fundingTransactionId: fundingTransaction.id,
            isDuplicate: false,
            walletId: w.id,
            pendingFeeSweep: feeSweepPayload,
          };
        },
        {
          timeout: 10000,
        },
      );
      this.logger.log(
        `INFLOW transaction committed: providerReference=${providerReference}, walletId=${wallet.id}, duplicate=${result.isDuplicate}`,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `INFLOW transaction failed: providerReference=${providerReference}, account=${accountNumber}, walletId=${wallet.id}, message=${errorMessage}`,
        errorStack,
      );
      throw error;
    }

    if (!result) {
      throw new BadRequestException(
        `Inflow processing did not produce a result for providerReference=${providerReference}`,
      );
    }

    const { pendingFeeSweep, ...clientResult } = result;

    if (pendingFeeSweep && !clientResult.isDuplicate) {
      try {
        await this.providerService.processClientTransfer({
          securityInfo: pendingFeeSweep.securityInfo,
          amount: normalizeToKobo(pendingFeeSweep.amount).toNumber(),
          destinationBankCode: pendingFeeSweep.orgBankCode,
          destinationBankName: pendingFeeSweep.orgBankName,
          destinationAccountNumber: pendingFeeSweep.orgVirtualAccount,
          destinationAccountName: 'Organization',
          sourceAccountNumber: pendingFeeSweep.userVirtualAccount,
          narration: `Admin funding fee ${pendingFeeSweep.feeSweepReference}`,
          transactionReference: pendingFeeSweep.feeSweepReference,
          useCustomNarration: true,
        });
      } catch (e: unknown) {
        const feeSweepErrorMessage = e instanceof Error ? e.message : String(e);
        const httpStatusSuffix =
          e instanceof HttpException ? ` httpStatus=${e.getStatus()}` : '';
        const responsePayloadSuffix = (() => {
          if (!(e instanceof HttpException)) return '';
          const r = e.getResponse();
          if (typeof r === 'string') return '';
          try {
            const s = JSON.stringify(r);
            return s.length > 2000 ? ` response=${s.slice(0, 2000)}...` : ` response=${s}`;
          } catch {
            return '';
          }
        })();
        this.logger.error(
          `Inflow fee sweep ProcessClientTransfer failed for ${pendingFeeSweep.feeSweepReference}: ${feeSweepErrorMessage}${httpStatusSuffix}${responsePayloadSuffix}`,
          e instanceof Error ? e.stack : undefined,
        );
        await this.databaseService.transaction.update({
          where: { reference: pendingFeeSweep.feeSweepReference },
          data: {
            status: TransactionStatus.FAILED,
            providerStatus: 'FAILED',
            providerCallbackReceivedAt: new Date(),
          },
        });
      }
    }

    return clientResult as BankInflowProcessResult;
  }
}
