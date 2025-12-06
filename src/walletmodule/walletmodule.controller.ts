import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ValidationPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth, ApiUnauthorizedResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { WalletmoduleService } from './walletmodule.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { GetWalletHistoryDto } from './dto/wallet-query.dto.js';
import { WalletToWalletTransferDto, FastWalletTransferDto } from './dto/wallet-transfer.dto.js';

@ApiTags('wallets')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class WalletmoduleController {
  constructor(private readonly walletmoduleService: WalletmoduleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new wallet for the authenticated user (requires Tier 1+)' })
  @ApiBody({})
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 400, description: 'Customer tier too low or wallet creation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async createWallet(
    @Request() req: any,
    @Body(ValidationPipe) createWalletDto: CreateWalletDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.walletmoduleService.createWalletByUserId(userId, createWalletDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all wallets for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Wallets retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async getCustomerWallets(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.walletmoduleService.getCustomerWalletsByUserId(userId);
  }

  @Get('account/:accountNumber')
  @ApiExcludeEndpoint()
  async getWalletByAccountNumber(@Param('accountNumber') accountNumber: string) {
    return this.walletmoduleService.getWalletByAccountNumber(accountNumber);
  }

  @Get(':id')
  @ApiExcludeEndpoint()
  async getWalletById(@Param('id') id: string) {
    return this.walletmoduleService.getWalletById(id);
  }

  @Get('account/:accountNumber/history')
  @ApiOperation({ summary: 'Get wallet transaction history by account number' })
  @ApiParam({ name: 'accountNumber', description: 'Wallet account number', example: '9719913297' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (YYYY-MM-DD)', example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (YYYY-MM-DD)', example: '2025-01-31' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: '1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page', example: '10' })
  @ApiResponse({ status: 200, description: 'Wallet history retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async getWalletHistory(
    @Param('accountNumber') accountNumber: string,
    @Query() query: GetWalletHistoryDto,
  ) {
    const page = query.page ? parseInt(query.page) : undefined;
    const limit = query.limit ? parseInt(query.limit) : undefined;
    return this.walletmoduleService.getWalletHistory(
      accountNumber,
      query.startDate,
      query.endDate,
      page,
      limit,
    );
  }

  @Put('transfer/wallet-to-wallet')
  @ApiOperation({ summary: 'Transfer funds between wallets' })
  @ApiBody({ schema: {  properties: { fromWalletId: { type: 'string' }, toWalletId: { type: 'string' }, amount: { type: 'number' } ,description: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Transfer successful' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or transfer failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async walletToWalletTransfer(@Body(ValidationPipe) transferDto: WalletToWalletTransferDto) {
    return this.walletmoduleService.walletToWalletTransfer(transferDto);
  }

  @Put('payout')
  @ApiOperation({ summary: 'Wallet payout to external bank account' })
  @ApiBody({ schema: {  properties: { fromWalletId: { type: 'string' }, toAccountNumber: { type: 'string' },bankCode: { type: 'string' }, amount: { type: 'number' } ,description: { type: 'string' },recipientName: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Payout initiated successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or payout failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async walletpayout(@Body(ValidationPipe) transferDto: FastWalletTransferDto) {
    return this.walletmoduleService.walletpayout(transferDto);
  }
}
