import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { PaymentsService } from './payments.service.js';
import {
  GetWalletByIdDto,
  GetOrganizationTransactionsDto,
  WalletToWalletRequeryDto,
  ReverseTransactionDto,
  CloseWalletDto,
  RestrictByAccountIdDto,
  BankAccountNameEnquiryDto,
  InterBankTransferDto,
  TransactionStatusRequeryDto,
} from './dto/payments.dto.js';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('wallets/:walletId')
  @ApiOperation({ summary: 'Get wallet by ID' })
  @ApiParam({ name: 'walletId', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet found' })
  async getWalletById(@Param('walletId') walletId: string) {
    return this.paymentsService.getWalletById({ walletId });
  }

  @Get('organization/transactions')
  @ApiOperation({ summary: 'Get organization wallet transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getOrganizationTransactions(@Query() query: GetOrganizationTransactionsDto) {
    return this.paymentsService.getOrganizationTransactions(query);
  }

  /**
   * Requery wallet to wallet transaction
   * GET /payments/transactions/wallet-to-wallet/requery/:transactionReference
   */
  @Get('transactions/wallet-to-wallet/requery/:transactionReference')
  async walletToWalletRequery(@Param('transactionReference') transactionReference: string) {
    return this.paymentsService.walletToWalletRequery({ transactionReference });
  }

  /**
   * Reverse a transaction
   * PUT /payments/transactions/reverse
   */
  @Put('transactions/reverse')
  async reverseTransaction(@Body(ValidationPipe) reverseDto: ReverseTransactionDto) {
    return this.paymentsService.reverseTransaction(reverseDto);
  }

  /**
   * Close a wallet
   * POST /payments/wallets/close
   */
  @Post('wallets/close')
  async closeWallet(@Body(ValidationPipe) closeWalletDto: CloseWalletDto) {
    return this.paymentsService.closeWallet(closeWalletDto);
  }

  /**
   * Restrict wallet by account ID
   * PATCH /payments/wallets/restrict/:accountId/:restrictionType
   */
  @Patch('wallets/restrict/:accountId/:restrictionType')
  async restrictByAccountId(
    @Param('accountId') accountId: string,
    @Param('restrictionType') restrictionType: string,
  ) {
    return this.paymentsService.restrictByAccountId({ accountId, restrictionType });
  }

  // ==================== PAYOUT ENDPOINTS ====================

  @Get('payouts/banks')
  @ApiOperation({ summary: 'Get list of banks available for payouts' })
  @ApiResponse({ status: 200, description: 'List of banks retrieved successfully' })
  async getBanks() {
    return this.paymentsService.getBanks();
  }

  @Post('payouts/name-enquiry')
  @ApiOperation({ summary: 'Validate bank account details (name enquiry)' })
  @ApiBody({ type: BankAccountNameEnquiryDto })
  @ApiResponse({ status: 200, description: 'Account name retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Name enquiry failed' })
  async bankAccountNameEnquiry(@Body(ValidationPipe) enquiryDto: BankAccountNameEnquiryDto) {
    return this.paymentsService.bankAccountNameEnquiry(enquiryDto);
  }

  @Post('payouts/inter-bank-transfer')
  @ApiOperation({ summary: 'Initiate inter-bank transfer (payout)' })
  @ApiBody({ type: InterBankTransferDto })
  @ApiResponse({ status: 200, description: 'Transfer initiated successfully' })
  @ApiResponse({ status: 400, description: 'Transfer failed' })
  async interBankTransfer(@Body(ValidationPipe) transferDto: InterBankTransferDto) {
    return this.paymentsService.interBankTransfer(transferDto);
  }

  /**
   * Transaction status re-query
   * GET /payments/payouts/status/:transactionRef
   */
  @Get('payouts/status/:transactionRef')
  async transactionStatusRequery(@Param('transactionRef') transactionRef: string) {
    return this.paymentsService.transactionStatusRequery({ transactionRef });
  }
}
