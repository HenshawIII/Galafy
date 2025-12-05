import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth, ApiExcludeEndpoint, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CustomerKycService } from './customer-kyc.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerNameDto, UpdateCustomerContactsDto } from './dto/update-customer.dto.js';
import { GetAllCustomersQueryDto } from './dto/customer-query.dto.js';
import {
  CreateNinVerificationDto,
  CreateBvnVerificationDto,
  CreateAddressVerificationDto,
} from './dto/kyc-verification.dto.js';

@ApiTags('customers')
@Controller('customer-kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class CustomerKycController {
  constructor(private readonly customerKycService: CustomerKycService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new customer (Tier 0)' })
  @ApiResponse({ 
    status: 201, 
    description: 'Customer created successfully',
    schema: {
      example: {
        id: 'customer-uuid',
        userId: 'user-uuid',
        providerCustomerId: 'provider-customer-id',
        firstName: 'John',
        lastName: 'Doe',
        tier: 'Tier_0',
        providerTierCode: 0,
        createdAt: '2025-01-25T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Bad request or customer already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  @ApiBody({ schema: { properties: { userId: { type: 'string' }, firstName: { type: 'string' }, lastName: { type: 'string' }, middleName: { type: 'string' }, dob: { type: 'string' }, city: { type: 'string' }, address: { type: 'string' }, mobileNumber: { type: 'string' }, emailAddress: { type: 'string' } } } })
  async createCustomer(@Request() req: any, @Body(ValidationPipe) createCustomerDto: CreateCustomerDto) {
    // Extract userId from JWT token
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.createCustomer(userId, createCustomerDto);
  }

  @Get('user/:userId')
  @ApiExcludeEndpoint()
  async getCustomerByUserId(@Param('userId') userId: string) {
    return this.customerKycService.getCustomerByUserId(userId);
  }

  @Get(':id')
  @ApiExcludeEndpoint()
  async getCustomerById(@Param('id') id: string) {
    return this.customerKycService.getCustomerById(id);
  }

  @Get()
  @ApiExcludeEndpoint()
  @ApiResponse({ status: 200, description: 'List of customers' })
  async getAllCustomers(@Query(ValidationPipe) query: GetAllCustomersQueryDto) {
    return this.customerKycService.getAllCustomers(query);
  }

  @Patch(':id/name')
  @ApiExcludeEndpoint()
  async updateCustomerName(
    @Param('id') id: string,
    @Body(ValidationPipe) updateDto: UpdateCustomerNameDto,
  ) {
    return this.customerKycService.updateCustomerName(id, updateDto);
  }

  @Patch(':id/contacts')
  @ApiExcludeEndpoint()
  async updateCustomerContacts(
    @Param('id') id: string,
    @Body(ValidationPipe) updateDto: UpdateCustomerContactsDto,
  ) {
    return this.customerKycService.updateCustomerContacts(id, updateDto);
  }

  @Get(':id/kyc-status')
  async getCustomerKycStatus(@Param('id') id: string) {
    return this.customerKycService.getCustomerKycStatus(id);
  }

  @Post(':id/kyc/nin')
  @ApiOperation({ summary: 'Upgrade customer KYC with NIN (Tier 1 or Tier 2)' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiBody({ type: CreateNinVerificationDto })
  @ApiResponse({ status: 200, description: 'NIN verification successful' })
  @ApiResponse({ status: 400, description: 'NIN verification failed' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async upgradeWithNin(
    @Param('id') id: string,
    @Body(ValidationPipe) ninDto: CreateNinVerificationDto,
  ) {
    return this.customerKycService.upgradeWithNin(id, ninDto);
  }

  @Post(':id/kyc/bvn')
  @ApiOperation({ summary: 'Upgrade customer KYC with BVN (Tier 1 or Tier 2)' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiBody({ type: CreateBvnVerificationDto })
  @ApiResponse({ status: 200, description: 'BVN verification successful' })
  @ApiResponse({ status: 400, description: 'BVN verification failed' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async upgradeWithBvn(
    @Param('id') id: string,
    @Body(ValidationPipe) bvnDto: CreateBvnVerificationDto,
  ) {
    return this.customerKycService.upgradeWithBvn(id, bvnDto);
  }

  @Post(':id/kyc/address')
  async verifyAddress(
    @Param('id') id: string,
    @Body(ValidationPipe) addressDto: CreateAddressVerificationDto,
  ) {
    return this.customerKycService.verifyAddress(id, addressDto);
  }
}
