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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
import {
  CreateCustomerWithBvnDto,
  UpgradeWithNinAndAddressDto,
  NinAndUtilityBillDto,
  StartTier1Dto,
  StartTier2Dto,
} from './dto/kyc-utility.dto.js';
import { SubmitUtilityBillDto } from './dto/utility-bill.dto.js';

@ApiTags('customers')
@Controller('customer-kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class CustomerKycController {
  constructor(private readonly customerKycService: CustomerKycService) {}

  @Post()
  @ApiExcludeEndpoint()
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
        createdAt: '2025-01-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request or customer already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  @ApiBody({
    schema: {
      properties: {
        userId: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        middleName: { type: 'string' },
        dob: { type: 'string' },
        city: { type: 'string' },
        address: { type: 'string' },
        mobileNumber: { type: 'string' },
        emailAddress: { type: 'string' },
      },
    },
  })
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

  @Patch('name')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Update customer name and date of birth' })
  @ApiBody({ type: UpdateCustomerNameDto })
  @ApiResponse({
    status: 200,
    description: 'Customer name and/or date of birth updated successfully',
    schema: {
      example: {
        id: 'customer-uuid',
        userId: 'user-uuid',
        providerCustomerId: 'provider-customer-id',
        firstName: 'John',
        lastName: 'Doe',
        middleName: 'Michael',
        dob: '1990-01-15T00:00:00.000Z',
        updatedAt: '2025-01-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Customer does not have a provider customer ID or provider update failed',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async updateCustomerName(@Request() req: any, @Body(ValidationPipe) updateDto: UpdateCustomerNameDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.updateCustomerNameByUserId(userId, updateDto);
  }

  @Patch(':id/contacts')
  @ApiExcludeEndpoint()
  async updateCustomerContacts(@Param('id') id: string, @Body(ValidationPipe) updateDto: UpdateCustomerContactsDto) {
    return this.customerKycService.updateCustomerContacts(id, updateDto);
  }

  @Get('kyc-status')
  @ApiOperation({ summary: 'Get customer KYC status' })
  @ApiResponse({ status: 200, description: 'KYC status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async getCustomerKycStatus(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.getCustomerKycStatusByUserId(userId);
  }

  @Post('kyc/tier1/start')
  @ApiOperation({ summary: 'Start Tier 1 (BVN + callback-driven account creation)' })
  @ApiBody({ type: StartTier1Dto })
  @ApiResponse({
    status: 200,
    description: 'Returns { success: true }. App opens face verification URL with static cb_uri from config.',
  })
  @ApiResponse({ status: 409, description: 'Already registered for this channel' })
  async startTier1(@Request() req: any, @Body(ValidationPipe) dto: StartTier1Dto) {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required. Please ensure you are authenticated.');
    return this.customerKycService.startTier1(userId, dto);
  }

  @Get('reference/dropdown')
  @ApiOperation({
    summary:
      'Get full dropdown reference (countryModel with all lists). Prefer reference/countries, states, lga, cities for smaller payloads.',
  })
  @ApiResponse({
    status: 200,
    description: 'countryModel with countryList, stateList, lgaList, lcdaList, cityList, housingTypes',
  })
  async getDropdown(@Request() req: any) {
    return this.customerKycService.getDropdownReference();
  }

  @Get('reference/countries')
  @ApiOperation({ summary: 'Get countries from KYC dropdown (cached)' })
  @ApiResponse({ status: 200, description: 'List of countries (id, countryCode, countryName)' })
  async getReferenceCountries() {
    return this.customerKycService.getReferenceCountries();
  }

  @Get('reference/states')
  @ApiOperation({ summary: 'Get states from KYC dropdown (mostly Nigeria)' })
  @ApiResponse({ status: 200, description: 'List of states (id, name, finacleCode, country)' })
  async getReferenceStates() {
    return this.customerKycService.getReferenceStates();
  }

  @Get('reference/lga')
  @ApiOperation({ summary: 'Get LGAs by state' })
  @ApiQuery({ name: 'stateId', required: true, description: 'State id from reference/states' })
  @ApiResponse({ status: 200, description: 'List of LGAs for the given state' })
  async getReferenceLga(@Query('stateId') stateId: string) {
    const id = parseInt(stateId, 10);
    if (Number.isNaN(id)) throw new BadRequestException('stateId must be a number');
    return this.customerKycService.getReferenceLgaByState(id);
  }

  @Get('reference/cities')
  @ApiOperation({ summary: 'Get cities by state' })
  @ApiQuery({ name: 'stateId', required: true, description: 'State id from reference/states' })
  @ApiResponse({ status: 200, description: 'List of cities for the given state' })
  async getReferenceCities(@Query('stateId') stateId: string) {
    const id = parseInt(stateId, 10);
    if (Number.isNaN(id)) throw new BadRequestException('stateId must be a number');
    return this.customerKycService.getReferenceCityByState(id);
  }

  @Get('account-details')
  @ApiOperation({ summary: 'Get partnership account details' })
  @ApiQuery({ name: 'phoneNumber', required: false })
  @ApiResponse({ status: 200, description: 'Account details (accountNumber, firstName, lastName, email, phoneNumber)' })
  async getAccountDetails(@Request() req: any, @Query('phoneNumber') phoneNumber?: string) {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required. Please ensure you are authenticated.');
    return this.customerKycService.getAccountDetails(userId, phoneNumber);
  }

  @Post('kyc/tier2')
  @ApiOperation({ summary: 'Submit Tier 2 (NIN + address + face)' })
  @ApiBody({ type: StartTier2Dto })
  @ApiResponse({ status: 200, description: 'Tier 2 submitted' })
  async startTier2(@Request() req: any, @Body(ValidationPipe) dto: StartTier2Dto) {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required. Please ensure you are authenticated.');
    return this.customerKycService.startTier2(userId, {
      nin: dto.nin,
      bvn: dto.bvn,
      residentialAddress: dto.residentialAddress as Record<string, string | undefined>,
      liveImageOfFace: dto.liveImageOfFace,
    });
  }

  @Post('kyc/nin')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Upgrade customer KYC with NIN (Tier 1 or Tier 2)' })
  @ApiBody({ type: CreateNinVerificationDto })
  @ApiResponse({ status: 200, description: 'NIN verification successful' })
  @ApiResponse({ status: 400, description: 'NIN verification failed' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async upgradeWithNin(@Request() req: any, @Body(ValidationPipe) ninDto: CreateNinVerificationDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.upgradeWithNinByUserId(userId, ninDto);
  }

  @Post('kyc/bvn')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Upgrade customer KYC with BVN (Tier 1 or Tier 2)' })
  @ApiBody({ type: CreateBvnVerificationDto })
  @ApiResponse({ status: 200, description: 'BVN verification successful' })
  @ApiResponse({ status: 400, description: 'BVN verification failed' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async upgradeWithBvn(@Request() req: any, @Body(ValidationPipe) bvnDto: CreateBvnVerificationDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.upgradeWithBvnByUserId(userId, bvnDto);
  }

  @Post('kyc/address')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Verify customer address' })
  @ApiBody({ type: CreateAddressVerificationDto })
  @ApiResponse({ status: 200, description: 'Address verification successful' })
  @ApiResponse({ status: 400, description: 'Address verification failed' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async verifyAddress(@Request() req: any, @Body(ValidationPipe) addressDto: CreateAddressVerificationDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.verifyAddressByUserId(userId, addressDto);
  }

  // ==================== KYC UTILITY ROUTES ====================

  @Post('utility/create-with-bvn')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Create customer and upgrade with BVN in one request (Tier 1)' })
  @ApiBody({ type: CreateCustomerWithBvnDto })
  @ApiResponse({ status: 201, description: 'Customer created and BVN verification completed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or verification failed' })
  @ApiResponse({ status: 409, description: 'Customer or BVN verification already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async createCustomerWithBvn(@Request() req: any, @Body(ValidationPipe) dto: CreateCustomerWithBvnDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.createCustomerWithBvn(userId, dto);
  }

  @Post('utility/upgrade-nin-address')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary:
      'Upgrade customer with NIN, Address verification, and bank account name enquiry. Skips already verified steps.',
  })
  @ApiBody({ type: UpgradeWithNinAndAddressDto })
  @ApiResponse({
    status: 200,
    description: 'NIN, Address verification, and bank name enquiry completed successfully',
    schema: {
      example: {
        ninVerification: { id: 1, status: 'verified' },
        addressVerification: { id: 1, verified: true },
        bankNameEnquiry: { destinationBankCode: '058', accountNumber: '1234567890', accountName: 'John Doe' },
        message: 'NIN verification completed. Address verification completed. Bank account name enquiry completed.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request or verification failed' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  async upgradeWithNinAndAddress(@Request() req: any, @Body(ValidationPipe) dto: UpgradeWithNinAndAddressDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.upgradeWithNinAndAddressByUserId(userId, dto);
  }

  @Post('utility-bill')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Submit utility bill for Tier 2 withdrawal limit increase' })
  @ApiBody({ type: SubmitUtilityBillDto })
  @ApiResponse({
    status: 201,
    description: 'Utility bill submitted successfully',
    schema: {
      example: {
        id: 'submission-uuid',
        customerId: 'customer-uuid',
        utilityBillUrl: 'https://example.com/utility-bill.jpg',
        status: 'PENDING',
        createdAt: '2025-02-08T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'User is not Tier 2 or submission already exists' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async submitUtilityBill(@Request() req: any, @Body(ValidationPipe) dto: SubmitUtilityBillDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.submitUtilityBill(userId, dto);
  }

  @Post('utility/nin-and-bill')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: 'Verify NIN and submit utility bill in one request',
    description:
      'This endpoint verifies NIN first (skips if already verified), then submits utility bill if customer is Tier 2. Customer must have BVN verification to become Tier 2.',
  })
  @ApiBody({ type: NinAndUtilityBillDto })
  @ApiResponse({
    status: 200,
    description: 'NIN verified and utility bill submitted successfully',
    schema: {
      example: {
        ninVerification: {
          id: 1,
          customerId: 'customer-uuid',
          nin: '12345678901',
          status: 'verified',
          ninCheckStatus: 'verified',
        },
        utilityBillSubmission: {
          id: 'submission-uuid',
          customerId: 'customer-uuid',
          utilityBillUrl: 'https://example.com/utility-bill.jpg',
          status: 'PENDING',
          createdAt: '2025-02-08T12:00:00.000Z',
        },
        message: 'NIN verification completed. Utility bill submitted successfully.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'NIN verification failed, customer is not Tier 2, or submission already exists',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 409, description: 'Utility bill submission already pending' })
  async verifyNinAndSubmitUtilityBill(@Request() req: any, @Body(ValidationPipe) dto: NinAndUtilityBillDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.customerKycService.verifyNinAndSubmitUtilityBill(userId, dto);
  }
}
