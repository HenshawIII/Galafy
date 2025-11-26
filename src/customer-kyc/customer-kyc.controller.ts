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
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { CustomerKycService } from './customer-kyc.service.js';
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
  @ApiBody({ type: CreateCustomerDto })
  async createCustomer(@Request() req: any, @Body(ValidationPipe) createCustomerDto: CreateCustomerDto) {
    // TODO: Extract userId from JWT token in production
    const userId = req.user?.id || createCustomerDto.userId;
    if (!userId) {
      throw new Error('User ID is required');
    }
    return this.customerKycService.createCustomer(userId, createCustomerDto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get customer by user ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerByUserId(@Param('userId') userId: string) {
    return this.customerKycService.getCustomerByUserId(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerById(@Param('id') id: string) {
    return this.customerKycService.getCustomerById(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all customers with optional filters' })
  @ApiQuery({ name: 'tier', required: false, description: 'Filter by KYC tier' })
  @ApiQuery({ name: 'organizationId', required: false, description: 'Filter by organization ID' })
  @ApiResponse({ status: 200, description: 'List of customers' })
  async getAllCustomers(@Query(ValidationPipe) query: GetAllCustomersQueryDto) {
    return this.customerKycService.getAllCustomers(query);
  }

  @Patch(':id/name')
  async updateCustomerName(
    @Param('id') id: string,
    @Body(ValidationPipe) updateDto: UpdateCustomerNameDto,
  ) {
    return this.customerKycService.updateCustomerName(id, updateDto);
  }

  @Patch(':id/contacts')
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
