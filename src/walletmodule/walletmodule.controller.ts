import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  ValidationPipe,
  UseGuards,
  Request,
  Res,
  Header,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth, ApiUnauthorizedResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { WalletmoduleService } from './walletmodule.service.js';
import { WalletExportService } from './services/wallet-export.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { GetWalletHistoryDto } from './dto/wallet-query.dto.js';
import { ExportWalletHistoryDto } from './dto/export-wallet-history.dto.js';
import { WalletToWalletTransferDto, FastWalletTransferDto } from './dto/wallet-transfer.dto.js';
import { SetPayoutPinDto, UpdatePayoutPinDto, InitiatePayoutDto, ConfirmPayoutDto, ResetPayoutPinDto } from './dto/payout-security.dto.js';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto.js';
import { extractDeviceInfo } from '../common/utils/request.util.js';
import type { Request as ExpressRequest } from 'express';

@ApiTags('wallets')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class WalletmoduleController {
  constructor(
    private readonly walletmoduleService: WalletmoduleService,
    private readonly walletExportService: WalletExportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new wallet for the authenticated user (requires Tier 1+)' })
  @ApiBody({})
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 400, description: 'Customer tier too low or wallet creation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async createWallet(
    @Request() req: any,
    @Req() expressReq: ExpressRequest,
    @Body(ValidationPipe) createWalletDto: CreateWalletDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }

    // Extract device information from request
    const deviceInfo = extractDeviceInfo(expressReq, createWalletDto);

    return this.walletmoduleService.createWalletByUserId(userId, createWalletDto, deviceInfo);
  }

  @Get()
  @ApiOperation({ summary: 'Get wallet for the authenticated user ' })
  @ApiResponse({ status: 200, description: 'Wallet retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Customer or wallet not found' })
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
  @ApiOperation({ 
    summary: 'Get wallet transaction history by account number',
    description: 'Retrieves transaction history with support for search, status filtering, and amount range filtering',
  })
  @ApiParam({ name: 'accountNumber', description: 'Wallet account number', example: '9719913297' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (YYYY-MM-DD)', example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (YYYY-MM-DD)', example: '2025-01-31' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: '1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page', example: '10' })
  @ApiQuery({ name: 'query', required: false, description: 'Search query to filter by transaction description', example: 'payment' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by transaction status', enum: ['all', 'successful', 'pending', 'failed'], example: 'all' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by transaction type', enum: ['all', 'inflow', 'spray', 'payout', 'refund', 'adjustment'], example: 'all' })
  @ApiQuery({ name: 'minAmount', required: false, description: 'Minimum transaction amount', type: Number, example: 10 })
  @ApiQuery({ name: 'maxAmount', required: false, description: 'Maximum transaction amount', type: Number, example: 500 })
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
      query.query,
      query.status,
      query.minAmount,
      query.maxAmount,
      query.type,
    );
  }

  @Get('account/:accountNumber/export')
  @ApiOperation({ summary: 'Export wallet transaction history as CSV or PDF' })
  @ApiParam({ name: 'accountNumber', description: 'Wallet account number', example: '9719913297' })
  @ApiQuery({ name: 'format', required: true, description: 'Export format', enum: ['csv', 'pdf'], example: 'csv' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date (YYYY-MM-DD)', example: '2025-01-01' })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date (YYYY-MM-DD)', example: '2025-01-31' })
  @ApiResponse({ status: 200, description: 'File exported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date range or format' })
  @ApiResponse({ status: 404, description: 'Wallet not found or no transactions found' })
  @ApiResponse({ status: 401, description: 'Unauthorized - You do not have permission to export this wallet' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async exportWalletHistory(
    @Request() req: any,
    @Param('accountNumber') accountNumber: string,
    @Query(ValidationPipe) query: ExportWalletHistoryDto,
    @Res() res: Response,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }

    const { buffer, filename, mimeType } = await this.walletExportService.exportWalletHistory(
      accountNumber,
      userId,
      query.format,
      query.startDate,
      query.endDate,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
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
  @ApiExcludeEndpoint()
  @ApiBody({ schema: {  properties: { fromWalletId: { type: 'string' }, toAccountNumber: { type: 'string' },bankCode: { type: 'string' }, amount: { type: 'number' } ,description: { type: 'string' },recipientName: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Payout initiated successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or payout failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async walletpayout(@Body(ValidationPipe) transferDto: FastWalletTransferDto) {
    return this.walletmoduleService.walletpayout(transferDto);
  }

  @Post('payout/set-pin')
  @ApiOperation({ summary: 'Set payout PIN (first time setup only, 4 digits)' })
  @ApiBody({ type: SetPayoutPinDto })
  @ApiResponse({ status: 200, description: 'Payout PIN set successfully' })
  @ApiResponse({ status: 400, description: 'Invalid PIN format or PIN already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async setPayoutPin(
    @Request() req: any,
    @Body(ValidationPipe) setPinDto: SetPayoutPinDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    await this.walletmoduleService.setPayoutPin(userId, setPinDto.pin);
    return { success: true, message: 'Payout PIN set successfully' };
  }

  @Post('payout/reset-pin')
  @ApiOperation({ summary: 'Reset payout PIN - Sends OTP to email address' })
  @ApiBody({ type: ResetPayoutPinDto })
  @ApiResponse({ status: 200, description: 'If the email exists and PIN is set, a PIN reset OTP has been sent' })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  async resetPayoutPin(
    @Body(ValidationPipe) resetPinDto: ResetPayoutPinDto,
  ) {
    return this.walletmoduleService.resetPayoutPin(resetPinDto.emailAddress);
  }

  @Patch('payout/update-pin')
  @ApiOperation({ summary: 'Update payout PIN (requires OTP verification, 4 digits)' })
  @ApiBody({ type: UpdatePayoutPinDto })
  @ApiResponse({ status: 200, description: 'Payout PIN updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid PIN format, PIN not set, or invalid/expired OTP' })
  @ApiResponse({ status: 401, description: 'Invalid OTP' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async updatePayoutPin(
    @Request() req: any,
    @Body(ValidationPipe) updatePinDto: UpdatePayoutPinDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    await this.walletmoduleService.updatePayoutPin(userId, updatePinDto.otp, updatePinDto.newPin);
    return { success: true, message: 'Payout PIN updated successfully' };
  }

  @Post('payout/initiate')
  @ApiOperation({ summary: 'Initiate payout - Step 1: Validates request and sends OTP to email' })
  @ApiBody({ type: InitiatePayoutDto })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP sent successfully. Use the OTP and PIN to confirm the payout.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        expiresIn: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request, insufficient balance, or wallet not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async initiatePayout(
    @Request() req: any,
    @Body(ValidationPipe) initiateDto: InitiatePayoutDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.walletmoduleService.initiatePayout(userId, initiateDto);
  }

  @Post('payout/confirm')
  @ApiOperation({ summary: 'Confirm payout - Step 2: Verifies OTP and PIN, then executes the payout' })
  @ApiBody({ type: ConfirmPayoutDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Payout confirmed and executed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        transactionRef: { type: 'string' },
        fromWalletId: { type: 'string' },
        toAccountNumber: { type: 'string' },
        amount: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid OTP, expired OTP, or no pending payout found' })
  @ApiResponse({ status: 401, description: 'Invalid PIN or OTP' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async confirmPayout(
    @Request() req: any,
    @Body(ValidationPipe) confirmDto: ConfirmPayoutDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.walletmoduleService.confirmPayout(userId, confirmDto.otp, confirmDto.pin);
  }

  @Put('bank-account')
  @ApiOperation({ summary: 'Update or add bank account details' })
  @ApiBody({ type: UpdateBankAccountDto })
  @ApiResponse({ status: 200, description: 'Bank account updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid bank account details' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async updateBankAccount(
    @Request() req: any,
    @Body(ValidationPipe) updateDto: UpdateBankAccountDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.walletmoduleService.updateBankAccount(userId, updateDto);
  }
}
