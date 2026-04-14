import { Controller, Get, Post, Body, ValidationPipe, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BankDirectoryService } from './bank-directory.service.js';
import { BankAccountNameEnquiryDto } from '../payments/dto/payments.dto.js';

@ApiTags('bank-directory')
@Controller('bank-directory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class BankDirectoryController {
  constructor(private readonly bankDirectoryService: BankDirectoryService) {}

  @Get('banks')
  @ApiOperation({ summary: 'Get list of banks available for payouts' })
  @ApiResponse({ status: 200, description: 'List of banks retrieved successfully' })
  async getBanks() {
    return this.bankDirectoryService.getBanks();
  }

  @Post('name-enquiry')
  @ApiOperation({ summary: 'Validate bank account details (name enquiry)' })
  @ApiBody({ type: BankAccountNameEnquiryDto })
  @ApiResponse({ status: 200, description: 'Account name retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Name enquiry failed' })
  async bankAccountNameEnquiry(@Body(ValidationPipe) enquiryDto: BankAccountNameEnquiryDto) {
    return this.bankDirectoryService.bankAccountNameEnquiry(enquiryDto.bankCode, enquiryDto.accountNumber);
  }
}
