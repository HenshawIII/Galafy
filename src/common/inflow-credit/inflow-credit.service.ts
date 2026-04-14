import {
  BadRequestException,
  forwardRef,
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

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet not found for account number: ${accountNumber}`);
    }

    type FeeSweepPayload = {
      amount: Decimal;
      feeSweepReference: string;
      userVirtualAccount: string;
      orgVirtualAccount: string;
      orgBankCode: string;
      orgBankName: string;
    };

    const result = await this.databaseService.$transaction(
      async (tx: Prisma.TransactionClient) => {
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
          this.logger.warn(`Wallet not found for account number: ${accountNumber}`);
          throw new NotFoundException(`Wallet not found for account number: ${accountNumber}`);
        }

        await tx.$queryRaw`
          SELECT id FROM "Wallet" WHERE id = ${w.id} FOR UPDATE
        `;

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
        const feeSweepReference = `FEE-${providerReference}`;
        const groupReference = `GRP-${randomUUID()}`;

        const newUserAvailableBalanceAfterCredit = normalizeToKobo(lockedUserWallet.availableBalance.plus(grossAmount));
        const newUserLedgerBalanceAfterCredit = normalizeToKobo(lockedUserWallet.ledgerBalance.plus(grossAmount));

        await tx.wallet.update({
          where: { id: w.id },
          data: {
            availableBalance: newUserAvailableBalanceAfterCredit,
            ledgerBalance: newUserLedgerBalanceAfterCredit,
          },
        });

        const orgWallet = await this.organizationWalletService.getAdminWalletRecord();
        if (!orgWallet) {
          throw new BadRequestException(
            'Organization wallet record not found in database. Set ORGANIZATION_WALLET to a virtual account that exists in the Wallet table.',
          );
        }
        if (!orgWallet.virtualBankCode) {
          throw new BadRequestException(
            'Organization wallet is missing virtualBankCode, which is required for the inflow fee sweep.',
          );
        }

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

        if (adminFee.gt(0)) {
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
              destinationAccountNumber: orgWallet.virtualAccountNumber,
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

        const feeSweepPayload: FeeSweepPayload | null = adminFee.gt(0)
          ? {
              amount: adminFee,
              feeSweepReference,
              userVirtualAccount: lockedUserWallet.virtualAccountNumber,
              orgVirtualAccount: orgWallet.virtualAccountNumber,
              orgBankCode: orgWallet.virtualBankCode,
              orgBankName: orgWallet.virtualBankName?.trim() || 'Wallet',
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

    const { pendingFeeSweep, ...clientResult } = result;

    if (pendingFeeSweep && !clientResult.isDuplicate) {
      const feeSecurity = process.env.INFLOW_FEE_SWEEP_SECURITY_INFO?.trim();
      if (!feeSecurity) {
        this.logger.error(
          `INFLOW_FEE_SWEEP_SECURITY_INFO is not set; fee sweep aborted for ref=${pendingFeeSweep.feeSweepReference}. User DB balance reflects gross until reconciled.`,
        );
        await this.databaseService.transaction.update({
          where: { reference: pendingFeeSweep.feeSweepReference },
          data: {
            status: TransactionStatus.FAILED,
            providerStatus: 'FAILED',
            providerCallbackReceivedAt: new Date(),
          },
        });
      } else {
        try {
          await this.providerService.processClientTransfer({
            securityInfo: feeSecurity,
            amount: pendingFeeSweep.amount.toNumber(),
            destinationBankCode: pendingFeeSweep.orgBankCode,
            destinationBankName: pendingFeeSweep.orgBankName,
            destinationAccountNumber: pendingFeeSweep.orgVirtualAccount,
            destinationAccountName: 'Organization',
            sourceAccountNumber: pendingFeeSweep.userVirtualAccount,
            narration: `Admin funding fee ${pendingFeeSweep.feeSweepReference}`,
            transactionReference: pendingFeeSweep.feeSweepReference,
            useCustomNarration: true,
          });
        } catch (e: any) {
          this.logger.error(
            `Inflow fee sweep ProcessClientTransfer failed for ${pendingFeeSweep.feeSweepReference}: ${e?.message ?? e}`,
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
    }

    return clientResult as BankInflowProcessResult;
  }
}
