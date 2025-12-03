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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { WalletmoduleService } from './walletmodule.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { GetWalletHistoryDto } from './dto/wallet-query.dto.js';
import { WalletToWalletTransferDto, FastWalletTransferDto } from './dto/wallet-transfer.dto.js';

@ApiTags('wallets')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletmoduleController {
  constructor(private readonly walletmoduleService: WalletmoduleService) {}

  @Post('customer/:customerId')
  @ApiOperation({ summary: 'Create a new wallet for a customer (requires Tier 1+)' })
  @ApiParam({ name: 'customerId', description: 'Customer ID' })
  @ApiBody({ type: CreateWalletDto })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 400, description: 'Customer tier too low or wallet creation failed' })
  async createWallet(
    @Param('customerId') customerId: string,
    @Body(ValidationPipe) createWalletDto: CreateWalletDto,
  ) {
    return this.walletmoduleService.createWallet(customerId, createWalletDto);
  }

  @Get('customer/:customerId')
  async getCustomerWallets(@Param('customerId') customerId: string) {
    return this.walletmoduleService.getCustomerWallets(customerId);
  }

  @Get('account/:accountNumber')
  async getWalletByAccountNumber(@Param('accountNumber') accountNumber: string) {
    return this.walletmoduleService.getWalletByAccountNumber(accountNumber);
  }

  @Get(':id')
  async getWalletById(@Param('id') id: string) {
    return this.walletmoduleService.getWalletById(id);
  }

  @Get(':id/history')
  async getWalletHistory(
    @Param('id') id: string,
    @Query() query: GetWalletHistoryDto,
  ) {
    const page = query.page ? parseInt(query.page) : undefined;
    const limit = query.limit ? parseInt(query.limit) : undefined;
    return this.walletmoduleService.getWalletHistory(id, page, limit);
  }

  @Put('transfer/wallet-to-wallet')
  @ApiOperation({ summary: 'Transfer funds between wallets' })
  @ApiBody({ type: WalletToWalletTransferDto })
  @ApiResponse({ status: 200, description: 'Transfer successful' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or transfer failed' })
  async walletToWalletTransfer(@Body(ValidationPipe) transferDto: WalletToWalletTransferDto) {
    return this.walletmoduleService.walletToWalletTransfer(transferDto);
  }

  @Put('transfer/fast')
  @ApiOperation({ summary: 'Fast transfer from wallet to external bank account' })
  @ApiBody({ type: FastWalletTransferDto })
  @ApiResponse({ status: 200, description: 'Transfer initiated successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or transfer failed' })
  async fastWalletTransfer(@Body(ValidationPipe) transferDto: FastWalletTransferDto) {
    return this.walletmoduleService.fastWalletTransfer(transferDto);
  }
}
