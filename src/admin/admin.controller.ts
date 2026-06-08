import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AdminService } from './admin.service.js';
import { AdminJwtAuthGuard } from './auth/admin-jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { PermissionsGuard } from './auth/guards/permissions.guard.js';
import { Roles } from './auth/decorators/roles.decorator.js';
import { RequirePermission } from './auth/decorators/permissions.decorator.js';
import { AdminPublic } from './auth/decorators/public.decorator.js';
import { PERMISSIONS } from './auth/permissions.js';
import { AdminRole } from '../../generated/prisma/enums.js';
import { GetConfigDto, UpdateConfigDto, CreateConfigDto } from './dto/config.dto.js';
import { GetUsersDto, RestrictUserDto, SearchUsersDto } from './dto/user-management.dto.js';
import { GetKycRequestsDto, ApproveKycDto, RejectKycDto } from './dto/kyc-management.dto.js';
import { TransactionAnalyticsDto } from './dto/analytics.dto.js';
import { GetAlertsDto, UpdateAlertStatusDto } from './dto/alert.dto.js';
import { GetActionLogsDto } from './dto/action-log.dto.js';
import {
  InviteAdminDto,
  AcceptInviteDto,
  GetAdminsDto,
  UpdateAdminDto,
  AssignRoleDto,
} from './dto/admin-management.dto.js';
import { GetRolesDto } from './dto/role-management.dto.js';
import { GetEventsDto, GetSprayActivityDto, GetTopSprayersDto } from './dto/events-management.dto.js';
import { GetTransactionsDto } from './dto/transactions-management.dto.js';
import { GetWithdrawalsDto, RejectWithdrawalDto } from './dto/withdrawals-management.dto.js';
import { GetNotificationsDto } from './dto/notifications-management.dto.js';
import { NormalizeArrayQueryPipe } from './pipes/normalize-array-query.pipe.js';
import { ProviderTransactionHistoryQueryDto } from '../provider/dto/provider-account-maintenance.dto.js';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminJwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Get all configurations
   */
  @Get('config')
  @AdminPublic()
  @ApiOperation({
    summary: 'Get all configurations',
    description:
      'Retrieves all system configurations with optional filtering by category and active status. Public endpoint accessible from mobile app.',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category (e.g., FEES, RISK, DEVICE_ABUSE)',
    example: 'FEES',
  })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status', example: true, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Configurations retrieved successfully',
    schema: {
      example: {
        configs: [
          {
            id: 'uuid',
            key: 'ADMIN_PAYOUT_FEE',
            category: 'FEES',
            value: '0.03',
            type: 'DECIMAL',
            description: 'Admin fee for payouts (3%)',
            isActive: true,
            updatedBy: 'admin-user-id',
            updatedAt: '2025-01-19T20:00:00.000Z',
            createdAt: '2025-01-19T20:00:00.000Z',
          },
        ],
        total: 1,
      },
    },
  })
  async getConfigs(@Query(ValidationPipe) filters: GetConfigDto) {
    return this.adminService.getConfigs(filters);
  }

  /**
   * Get configuration by key
   */
  @Get('config/:key')
  @RequirePermission(PERMISSIONS.VIEW_CONFIG)
  @ApiOperation({
    summary: 'Get configuration by key',
    description: 'Retrieves a specific configuration by its key. Read access available to all authenticated admins.',
  })
  @ApiParam({ name: 'key', description: 'Configuration key', example: 'ADMIN_PAYOUT_FEE' })
  @ApiResponse({
    status: 200,
    description: 'Configuration retrieved successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'ADMIN_PAYOUT_FEE',
        category: 'FEES',
        value: '0.03',
        type: 'DECIMAL',
        description: 'Admin fee for payouts (3%)',
        isActive: true,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:00:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async getConfigByKey(@Param('key') key: string) {
    return this.adminService.getConfigByKey(key);
  }

  /**
   * Get configurations by category
   */
  @Get('config/category/:category')
  @RequirePermission(PERMISSIONS.VIEW_CONFIG)
  @ApiOperation({
    summary: 'Get configurations by category',
    description:
      'Retrieves all configurations in a specific category. Read access available to all authenticated admins.',
  })
  @ApiParam({ name: 'category', description: 'Configuration category', example: 'FEES' })
  @ApiResponse({
    status: 200,
    description: 'Configurations retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          key: 'ADMIN_PAYOUT_FEE',
          category: 'FEES',
          value: '0.03',
          type: 'DECIMAL',
          description: 'Admin fee for payouts (3%)',
          isActive: true,
        },
      ],
    },
  })
  async getConfigsByCategory(@Param('category') category: string) {
    return this.adminService.getConfigsByCategory(category);
  }

  /**
   * Update configuraton
   */
  @Put('config/:key')
  @RequirePermission(PERMISSIONS.MANAGE_CONFIG)
  @ApiOperation({
    summary: 'Update configuration',
    description: 'Updates a configuration value. Only admins with MANAGE_CONFIG permission can update configurations.',
  })
  @ApiParam({ name: 'key', description: 'Configuration key', example: 'ADMIN_PAYOUT_FEE' })
  @ApiBody({ type: UpdateConfigDto })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'ADMIN_PAYOUT_FEE',
        category: 'FEES',
        value: '0.05',
        type: 'DECIMAL',
        description: 'Updated payout fee',
        isActive: true,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:05:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid value type' })
  async updateConfig(@Param('key') key: string, @Body(ValidationPipe) data: UpdateConfigDto, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.updateConfig(key, data, adminId);
  }

  /**
   * Create new configuration
   */
  @Post('config')
  @RequirePermission(PERMISSIONS.MANAGE_CONFIG)
  @ApiOperation({
    summary: 'Create new configuration',
    description:
      'Creates a new configuration entry. Only admins with MANAGE_CONFIG permission can create configurations.',
  })
  @ApiBody({ type: CreateConfigDto })
  @ApiResponse({
    status: 201,
    description: 'Configuration created successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'NEW_CONFIG_KEY',
        category: 'FEES',
        value: '0.02',
        type: 'DECIMAL',
        description: 'New configuration',
        isActive: true,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:00:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Key already exists or invalid data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async createConfig(@Body(ValidationPipe) data: CreateConfigDto, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.createConfig(data, adminId);
  }

  /**
   * Delete/deactivate configuration
   */
  @Delete('config/:key')
  @RequirePermission(PERMISSIONS.MANAGE_CONFIG)
  @ApiOperation({
    summary: 'Delete configuration',
    description:
      'Soft deletes (deactivates) a configuration by setting isActive to false. Only admins with MANAGE_CONFIG permission can delete configurations.',
  })
  @ApiParam({ name: 'key', description: 'Configuration key', example: 'ADMIN_PAYOUT_FEE' })
  @ApiResponse({
    status: 200,
    description: 'Configuration deactivated successfully',
    schema: {
      example: {
        id: 'uuid',
        key: 'ADMIN_PAYOUT_FEE',
        category: 'FEES',
        value: '0.03',
        type: 'DECIMAL',
        description: 'Admin fee for payouts (3%)',
        isActive: false,
        updatedBy: 'admin-user-id',
        updatedAt: '2025-01-19T20:10:00.000Z',
        createdAt: '2025-01-19T20:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async deleteConfig(@Param('key') key: string, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.deleteConfig(key, adminId);
  }

  // =====================
  // USER MANAGEMENT
  // =====================

  @Get('users')
  @RequirePermission(PERMISSIONS.VIEW_USERS)
  @ApiOperation({ summary: 'List all users', description: 'Get paginated list of users with filtering options' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getUsers(@Query(ValidationPipe) filters: GetUsersDto) {
    return this.adminService.getUsers(filters);
  }

  @Get('users/export')
  @RequirePermission(PERMISSIONS.VIEW_USERS)
  @ApiOperation({
    summary: 'Export users to CSV',
    description:
      'Exports all users matching the provided filters to CSV format. Uses the same filter parameters as GET /admin/users. Maximum 100,000 records.',
  })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by email or name' })
  @ApiQuery({
    name: 'tier',
    required: false,
    enum: ['Tier_0', 'Tier_1', 'Tier_2', 'Tier_3'],
    description: 'Filter by KYC tier',
  })
  @ApiQuery({
    name: 'isAmlRestricted',
    required: false,
    type: Boolean,
    description: 'Filter by AML restriction status',
  })
  @ApiResponse({
    status: 200,
    description: 'Users exported successfully',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async exportUsersCSV(@Query(ValidationPipe) filters: GetUsersDto, @Res() res: Response) {
    const { buffer, filename } = await this.adminService.exportUsersCSV(filters);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('users/search')
  @RequirePermission(PERMISSIONS.VIEW_USERS)
  @ApiOperation({
    summary: 'Search users',
    description:
      'Search for users by email, phone, or username. Auto-detects search type: email (exact match), phone (exact match), or username (partial match). Returns array with single user for email/phone, multiple users for username.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search query - email, phone, or username',
    example: 'john@example.com',
  })
  @ApiResponse({
    status: 200,
    description: 'Users found successfully',
    schema: {
      example: {
        users: [
          {
            id: 'user-uuid',
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            username: 'johndoe',
            phone: '+2341234567890',
            profilePicture: 'https://example.com/profile.jpg',
            isVerified: true,
            customer: {
              id: 'customer-uuid',
              tier: 'Tier_2',
              isAmlRestricted: false,
              walletCount: 1,
              totalBalance: '5000000',
              wallets: [
                {
                  id: 'wallet-uuid',
                  availableBalance: '5000000',
                  ledgerBalance: '5000000',
                  currencyId: 'currency-uuid',
                },
              ],
            },
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
      },
    },
  })
  async searchUsers(@Query(ValidationPipe) searchDto: SearchUsersDto) {
    return this.adminService.searchUsers(searchDto.q);
  }

  @Get('users/:userId')
  @RequirePermission(PERMISSIONS.VIEW_USERS)
  @ApiOperation({ summary: 'Get user details', description: 'Get detailed information about a specific user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetails(@Param('userId') userId: string) {
    return this.adminService.getUserDetails(userId);
  }

  @Get('wallets/account/:accountNumber')
  @RequirePermission(PERMISSIONS.VIEW_WALLETS)
  @ApiOperation({
    summary: 'Get wallet by account number (admin)',
    description:
      'Returns internal wallet record with provider balance snapshot for reconciliation. Internal balances remain authoritative.',
  })
  @ApiParam({ name: 'accountNumber', description: 'Wallet virtual account number' })
  @ApiResponse({ status: 200, description: 'Wallet retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWalletByAccountNumber(@Param('accountNumber') accountNumber: string) {
    return this.adminService.getWalletByAccountNumber(accountNumber);
  }

  @Get('wallets/account/:accountNumber/provider')
  @RequirePermission(PERMISSIONS.VIEW_WALLETS)
  @ApiOperation({
    summary: 'Get provider wallet account details',
    description: 'Proxies provider GetAccountV2 and returns reconciliation snapshot alongside raw provider data.',
  })
  @ApiParam({ name: 'accountNumber', description: 'Wallet virtual account number' })
  @ApiResponse({ status: 200, description: 'Provider wallet details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getProviderWalletAccount(@Param('accountNumber') accountNumber: string) {
    return this.adminService.getProviderWalletAccount(accountNumber);
  }

  @Post('wallets/account/:accountNumber/provider-history')
  @RequirePermission(PERMISSIONS.VIEW_WALLETS)
  @ApiOperation({
    summary: 'Get provider wallet transaction history',
    description: 'Proxies provider transhistoryV2 for admin reconciliation. Does not replace internal Gala history.',
  })
  @ApiParam({ name: 'accountNumber', description: 'Wallet virtual account number' })
  @ApiBody({ type: ProviderTransactionHistoryQueryDto })
  @ApiResponse({ status: 200, description: 'Provider transaction history retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getProviderWalletHistory(
    @Param('accountNumber') accountNumber: string,
    @Body(ValidationPipe) body: ProviderTransactionHistoryQueryDto,
  ) {
    return this.adminService.getProviderWalletHistory(accountNumber, body);
  }

  @Post('users/:userId/send-kyc-reminder')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE, AdminRole.SUPPORT)
  @RequirePermission(PERMISSIONS.SEND_KYC_REMINDERS)
  @ApiOperation({
    summary: 'Send KYC reminder email',
    description:
      'Send a KYC reminder email to a user to encourage them to complete their KYC verification. The email will only be sent to users with verified email addresses.',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'KYC reminder email sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'KYC reminder email sent successfully' },
        userId: { type: 'string', example: 'user-uuid' },
        email: { type: 'string', example: 'user@example.com' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 400, description: 'User email is not verified or email sending failed' })
  async sendKycReminder(@Param('userId') userId: string, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.sendKycReminder(userId, adminId);
  }

  @Post('users/:userId/restrict')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.RESTRICT_USERS)
  @ApiOperation({
    summary: 'Restrict user (AML flagging)',
    description:
      'Restrict a user due to AML compliance issues. An email notification will be automatically sent to the user (if their email is verified) informing them of the restriction and the reason.',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiBody({ type: RestrictUserDto })
  @ApiResponse({
    status: 200,
    description: 'User restricted successfully. Email notification sent if user email is verified.',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async restrictUser(@Param('userId') userId: string, @Body(ValidationPipe) dto: RestrictUserDto, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.restrictUser(userId, adminId, dto);
  }

  @Post('users/:userId/unrestrict')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.UNRESTRICT_USERS)
  @ApiOperation({ summary: 'Remove user restriction', description: 'Remove AML restriction from a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User restriction removed successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unrestrictUser(@Param('userId') userId: string, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.unrestrictUser(userId, adminId);
  }

  // =====================
  // KYC MANAGEMENT
  // =====================

  @Get('kyc/pending')
  @RequirePermission(PERMISSIONS.VIEW_KYC_REQUESTS)
  @ApiOperation({ summary: 'Get pending KYC requests', description: 'Get paginated list of pending KYC requests' })
  @ApiResponse({ status: 200, description: 'Pending KYC requests retrieved successfully' })
  async getPendingKycRequests(@Query(ValidationPipe) filters: GetKycRequestsDto) {
    return this.adminService.getPendingKycRequests(filters);
  }

  @Post('kyc/requests/:requestId/approve')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.APPROVE_KYC)
  @ApiOperation({ summary: 'Approve KYC request', description: 'Approve a pending KYC request' })
  @ApiParam({ name: 'requestId', description: 'KYC request ID' })
  @ApiBody({ type: ApproveKycDto })
  @ApiResponse({ status: 200, description: 'KYC request approved successfully' })
  @ApiResponse({ status: 404, description: 'KYC request not found' })
  @ApiResponse({ status: 400, description: 'KYC request is not pending' })
  async approveKycRequest(
    @Param('requestId') requestId: string,
    @Body(ValidationPipe) dto: ApproveKycDto,
    @Request() req: any,
  ) {
    const adminId = req.admin?.id;
    return this.adminService.approveKycRequest(requestId, adminId, dto);
  }

  @Post('kyc/requests/:requestId/reject')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.REJECT_KYC)
  @ApiOperation({ summary: 'Reject KYC request', description: 'Reject a pending KYC request' })
  @ApiParam({ name: 'requestId', description: 'KYC request ID' })
  @ApiBody({ type: RejectKycDto })
  @ApiResponse({ status: 200, description: 'KYC request rejected successfully' })
  @ApiResponse({ status: 404, description: 'KYC request not found' })
  @ApiResponse({ status: 400, description: 'KYC request is not pending' })
  async rejectKycRequest(
    @Param('requestId') requestId: string,
    @Body(ValidationPipe) dto: RejectKycDto,
    @Request() req: any,
  ) {
    const adminId = req.admin?.id;
    return this.adminService.rejectKycRequest(requestId, adminId, dto);
  }

  @Patch('customers/:customerId/approve-tier-3')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.APPROVE_KYC)
  @ApiOperation({
    summary: 'Approve Tier 3 upgrade',
    description:
      'Sets tier3UpgradeStatus to COMPLETED after manual address verification. Customer must be Tier_3 with PENDING status.',
  })
  @ApiParam({ name: 'customerId', description: 'Customer ID' })
  @ApiBody({ type: ApproveKycDto, required: false })
  @ApiResponse({ status: 200, description: 'Tier 3 upgrade approved; benefits unlocked' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 400, description: 'No pending Tier 3 upgrade' })
  async approveCustomerTier3(
    @Param('customerId') customerId: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) dto: ApproveKycDto,
    @Request() req: any,
  ) {
    const adminId = req.admin?.id;
    return this.adminService.promoteCustomerToTier3(customerId, adminId, dto);
  }

  @Get('customers/:customerId/partner-kyc-status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.APPROVE_KYC)
  @ApiOperation({ summary: 'Get partner account KYC status from ALAT account-upgrade API' })
  @ApiParam({ name: 'customerId', description: 'Customer ID' })
  @ApiResponse({ status: 200, description: 'Partner KYC status' })
  async getPartnerKycStatus(@Param('customerId') customerId: string) {
    return this.adminService.getPartnerKycStatusForCustomer(customerId);
  }

  // =====================
  // ANALYTICS
  // =====================

  @Get('analytics/transaction-summary')
  @RequirePermission(PERMISSIONS.VIEW_FINANCIAL_REPORTS)
  @ApiOperation({
    summary: 'Get transaction analytics summary',
    description:
      'Returns aggregated metrics: total wallet balance, total withdrawn, and total received. Supports optional date range filtering. Results are cached for 5 minutes (all-time queries only).',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date for analytics (ISO 8601 format). If not provided, returns all-time data.',
    example: '2025-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date for analytics (ISO 8601 format). If not provided, uses current date.',
    example: '2025-02-08T23:59:59.999Z',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction analytics summary retrieved successfully',
    schema: {
      example: {
        totalWalletBalance: '5000000000',
        totalWithdrawn: '2000000000',
        totalReceived: '7000000000',
        chartData: [
          {
            date: '2025-02-01',
            amount: '50000000',
            count: 25,
          },
          {
            date: '2025-02-02',
            amount: '75000000',
            count: 30,
          },
          {
            date: '2025-02-03',
            amount: '60000000',
            count: 28,
          },
        ],
        cached: false,
        timestamp: '2025-02-08T14:30:00.000Z',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-02-08T23:59:59.999Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid date format' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getTransactionAnalyticsSummary(@Query(ValidationPipe) filters: TransactionAnalyticsDto) {
    return this.adminService.getTransactionAnalyticsSummary(filters);
  }

  // =====================
  // DASHBOARD
  // =====================

  @Get('dashboard/metrics')
  @RequirePermission(PERMISSIONS.VIEW_DASHBOARD)
  @ApiOperation({
    summary: 'Get dashboard overview metrics',
    description:
      'Returns dashboard metrics: Total Users, Verified Users, Total Events, Active Events, Revenue, Pending KYC count. Includes growth percentages comparing last 7 days vs previous 7 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics retrieved successfully',
    schema: {
      example: {
        totalUsers: 1000,
        totalUsersGrowth: 4.2,
        verifiedUsers: 950,
        totalEvents: 109,
        totalEventsGrowth: 4.2,
        activeEvents: 28,
        pendingKyc: 18,
        revenue: '8650000000', // All-time AdminFee total in kobo
        revenueGrowth: 4.2,
        totalSprayers: 0,
        totalAttendees: 0,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getDashboardMetrics() {
    return this.adminService.getDashboardMetrics();
  }

  // =====================
  // EVENTS MANAGEMENT
  // =====================

  @Get('events')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'List all events',
    description: 'Get paginated list of events with filtering options',
  })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  async getEvents(@Query(NormalizeArrayQueryPipe, ValidationPipe) filters: GetEventsDto) {
    return this.adminService.getEvents(filters);
  }

  @Get('events/metrics')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'Get event metrics with growth percentages',
    description:
      'Returns aggregated event metrics (totalEvents, activeEvents, totalAttendees, totalSprayed) with 7-day growth percentages. Calculates metrics for ALL events in the system.',
  })
  @ApiResponse({
    status: 200,
    description: 'Event metrics retrieved successfully',
    schema: {
      example: {
        totalEvents: 50,
        totalEventsGrowth: 4.2,
        activeEvents: 0,
        activeEventsGrowth: 0,
        totalAttendees: 25,
        totalAttendeesGrowth: 4.2,
        totalSprayed: '4285000.00',
        totalSprayedGrowth: 4.2,
      },
    },
  })
  async getEventMetrics() {
    return this.adminService.getEventMetrics();
  }

  @Get('events/export')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'Export events to CSV',
    description:
      'Exports all events matching the provided filters to CSV format. Uses the same filter parameters as GET /admin/events. Maximum 100,000 records.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'],
    description: 'Filter by event status. UI values: "Upcoming" → SCHEDULED, "Live" → LIVE, "Completed" → ENDED',
  })
  @ApiQuery({
    name: 'categories',
    required: false,
    type: [String],
    description: 'Filter by event categories (multi-select). Common values: Birthday, Wedding, Housewarming, Corporate',
  })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by event title or host name' })
  @ApiQuery({ name: 'hostUserId', required: false, type: String, description: 'Filter by host user ID' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description:
      'Filter events starting from this date (ISO 8601). Quick options (Today, This Week, This Month, Last 90 days) are calculated on frontend.',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Filter events starting before this date (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Events exported successfully',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async exportEventsCSV(@Query(NormalizeArrayQueryPipe, ValidationPipe) filters: GetEventsDto, @Res() res: Response) {
    const { buffer, filename } = await this.adminService.exportEventsCSV(filters);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('events/top-by-sprayers')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'Get top 5 events by sprayers',
    description:
      'Get ranked list of top 5 events based on number of unique sprayers. Ties are broken by earliest start date.',
  })
  @ApiResponse({
    status: 200,
    description: 'Top events retrieved successfully',
    schema: {
      example: {
        events: [
          {
            rank: 1,
            id: 'event-id-1',
            title: 'Event Title',
            code: 'EVENT001',
            status: 'LIVE',
            startsAt: '2025-02-08T10:00:00.000Z',
            startDate: '2025-02-08T10:00:00.000Z',
            location: 'Lagos',
            category: 'Concert',
            imageUrl: 'https://example.com/image.jpg',
            hostUser: {
              id: 'user-id',
              email: 'host@example.com',
              firstName: 'John',
              lastName: 'Doe',
              username: 'johndoe',
              phone: '+2341234567890',
              profilePicture: 'https://example.com/profile.jpg',
            },
            sprayerCount: 150,
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  async getTopEventsBySprayers() {
    return this.adminService.getTopEventsBySprayers();
  }

  @Get('events/:id')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'Get event details',
    description: 'Get detailed information about a specific event including participants and sprays',
  })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Event details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEventDetails(@Param('id') eventId: string) {
    return this.adminService.getEventDetails(eventId);
  }

  @Get('events/:id/spray-activity')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'Get spray activity feed',
    description: 'Get paginated list of sprays for an event with filtering options',
  })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Spray activity retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEventSprayActivity(@Param('id') eventId: string, @Query(ValidationPipe) filters: GetSprayActivityDto) {
    return this.adminService.getEventSprayActivity(eventId, filters);
  }

  @Get('events/:id/top-sprayers')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'Get top sprayers leaderboard',
    description: 'Get ranked list of top sprayers by total amount for an event',
  })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Top sprayers retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEventTopSprayers(@Param('id') eventId: string, @Query(ValidationPipe) filters: GetTopSprayersDto) {
    return this.adminService.getEventTopSprayers(eventId, filters);
  }

  @Post('events/:id/suspend')
  @RequirePermission(PERMISSIONS.MANAGE_EVENTS)
  @ApiOperation({
    summary: 'Suspend event',
    description: 'Suspend an event by changing its status to CANCELLED',
  })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Event suspended successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 400, description: 'Event is already cancelled' })
  async suspendEvent(@Param('id') eventId: string, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.suspendEvent(eventId, adminId);
  }

  @Get('events/:id/report')
  @RequirePermission(PERMISSIONS.VIEW_EVENTS)
  @ApiOperation({
    summary: 'Download event report',
    description: 'Download event report as CSV file including participants and sprays',
  })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({
    status: 200,
    description: 'Event report downloaded successfully',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEventReport(@Param('id') eventId: string, @Res() res: Response) {
    const { buffer, filename } = await this.adminService.generateEventReport(eventId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // =====================
  // TRANSACTIONS MANAGEMENT
  // =====================

  @Get('transactions')
  @RequirePermission(PERMISSIONS.VIEW_TRANSACTIONS)
  @ApiOperation({
    summary: 'List all transactions',
    description: 'Get paginated list of transactions with filtering options',
  })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getTransactions(@Query(ValidationPipe) filters: GetTransactionsDto) {
    return this.adminService.getTransactions(filters);
  }

  @Get('transactions/:id')
  @RequirePermission(PERMISSIONS.VIEW_TRANSACTIONS)
  @ApiOperation({
    summary: 'Get transaction details',
    description: 'Get detailed information about a specific transaction',
  })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransactionDetails(@Param('id') transactionId: string) {
    return this.adminService.getTransactionDetails(transactionId);
  }

  @Get('transactions/:id/receipt')
  @RequirePermission(PERMISSIONS.VIEW_TRANSACTIONS)
  @ApiOperation({
    summary: 'Download transaction receipt',
    description: 'Download transaction receipt as CSV file',
  })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction receipt downloaded successfully',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransactionReceipt(@Param('id') transactionId: string, @Res() res: Response) {
    const { buffer, filename } = await this.adminService.generateTransactionReceipt(transactionId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // =====================
  // AML ALERTS
  // =====================

  @Get('alerts')
  @RequirePermission(PERMISSIONS.VIEW_AML_ALERTS)
  @ApiOperation({
    summary: 'Get AML alerts',
    description: 'Get paginated list of AML/fraud alerts with filtering options',
  })
  @ApiResponse({
    status: 200,
    description: 'Alerts retrieved successfully',
    schema: {
      example: {
        alerts: [
          {
            id: 'alert-uuid',
            eventType: 'TRANSACTION_BLOCKED',
            severity: 'HIGH',
            status: 'PENDING',
            walletId: 'wallet-uuid',
            customerId: 'customer-uuid',
            details: {
              riskScore: 85,
              blockReason: 'Hard freeze - Risk score: 85',
              amount: '5000000',
            },
            createdAt: '2025-02-08T10:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 150,
          totalPages: 8,
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getAlerts(@Query(ValidationPipe) filters: GetAlertsDto) {
    return this.adminService.getAlerts(filters);
  }

  @Get('alerts/stats')
  @RequirePermission(PERMISSIONS.VIEW_AML_ALERTS)
  @ApiOperation({
    summary: 'Get alert statistics',
    description: 'Get summary statistics for AML alerts (counts by status and severity)',
  })
  @ApiResponse({
    status: 200,
    description: 'Alert statistics retrieved successfully',
    schema: {
      example: {
        total: 150,
        pending: 45,
        reviewed: 60,
        resolved: 40,
        dismissed: 5,
        bySeverity: {
          CRITICAL: 10,
          HIGH: 35,
          MEDIUM: 80,
          LOW: 25,
        },
        pendingBySeverity: {
          CRITICAL: 8,
          HIGH: 20,
          MEDIUM: 15,
          LOW: 2,
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getAlertStats() {
    return this.adminService.getAlertStats();
  }

  @Get('alerts/:alertId')
  @RequirePermission(PERMISSIONS.VIEW_AML_ALERTS)
  @ApiOperation({
    summary: 'Get alert details',
    description: 'Get detailed information about a specific AML alert',
  })
  @ApiParam({ name: 'alertId', description: 'Alert ID' })
  @ApiResponse({
    status: 200,
    description: 'Alert details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getAlertById(@Param('alertId') alertId: string) {
    return this.adminService.getAlertById(alertId);
  }

  @Patch('alerts/:alertId/status')
  @RequirePermission(PERMISSIONS.MANAGE_AML_ALERTS)
  @ApiOperation({
    summary: 'Update alert status',
    description: 'Update the status of an AML alert (review/resolve/dismiss)',
  })
  @ApiParam({ name: 'alertId', description: 'Alert ID' })
  @ApiBody({ type: UpdateAlertStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Alert status updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async updateAlertStatus(
    @Param('alertId') alertId: string,
    @Body(ValidationPipe) dto: UpdateAlertStatusDto,
    @Request() req: any,
  ) {
    const adminId = req.admin?.id;
    return this.adminService.updateAlertStatus(alertId, adminId, dto);
  }

  // =====================
  // AUDIT LOGS
  // =====================

  @Get('logs')
  @RequirePermission(PERMISSIONS.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Get admin action logs',
    description: 'Get paginated list of admin action logs with filtering options',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'adminId', required: false, type: String, example: 'admin-uuid' })
  @ApiQuery({ name: 'actionType', required: false, type: String, example: 'KYC_APPROVED' })
  @ApiQuery({ name: 'targetType', required: false, type: String, example: 'CUSTOMER' })
  @ApiQuery({ name: 'targetId', required: false, type: String, example: 'customer-uuid' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date for logs (ISO 8601 format)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date for logs (ISO 8601 format)',
    example: '2025-02-08T23:59:59.999Z',
  })
  @ApiResponse({
    status: 200,
    description: 'Action logs retrieved successfully',
    schema: {
      example: {
        logs: [
          {
            id: 'log-uuid',
            adminId: 'admin-uuid',
            actionType: 'KYC_APPROVED',
            targetType: 'KYC_REQUEST',
            targetId: 'request-uuid',
            reason: null,
            details: { tier: 'TIER_2' },
            createdAt: '2025-02-08T10:00:00.000Z',
            admin: {
              id: 'admin-uuid',
              email: 'admin@example.com',
              role: 'COMPLIANCE',
            },
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 150,
          totalPages: 8,
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getActionLogs(@Query(ValidationPipe) filters: GetActionLogsDto) {
    return this.adminService.getActionLogs(filters);
  }

  @Get('logs/export')
  @RequirePermission(PERMISSIONS.VIEW_AUDIT_LOGS)
  @ApiOperation({
    summary: 'Export admin action logs as CSV',
    description: 'Export all matching admin action logs as a CSV file for download',
  })
  @ApiQuery({ name: 'adminId', required: false, type: String, example: 'admin-uuid' })
  @ApiQuery({ name: 'actionType', required: false, type: String, example: 'KYC_APPROVED' })
  @ApiQuery({ name: 'targetType', required: false, type: String, example: 'CUSTOMER' })
  @ApiQuery({ name: 'targetId', required: false, type: String, example: 'customer-uuid' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date for logs (ISO 8601 format)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date for logs (ISO 8601 format)',
    example: '2025-02-08T23:59:59.999Z',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV file exported successfully',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async exportActionLogsCSV(@Query(ValidationPipe) filters: GetActionLogsDto, @Res() res: Response) {
    const { buffer, filename } = await this.adminService.exportActionLogsCSV(filters);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // =====================
  // ADMIN MANAGEMENT
  // =====================

  @Post('admins/invite')
  @RequirePermission(PERMISSIONS.MANAGE_ADMINS)
  @ApiOperation({
    summary: 'Invite a new admin user',
    description: 'Send an invitation to a new admin user. They will receive an email with an invite token.',
  })
  @ApiBody({ type: InviteAdminDto })
  @ApiResponse({
    status: 201,
    description: 'Admin invite sent successfully',
    schema: {
      example: {
        id: 'invite-uuid',
        email: 'newadmin@example.com',
        role: 'COMPLIANCE',
        expiresAt: '2025-02-15T12:00:00.000Z',
        message: 'Invite created successfully. Token sent via email.',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Admin already exists or active invite exists' })
  async inviteAdmin(@Request() req: any, @Body(ValidationPipe) dto: InviteAdminDto) {
    const inviterId = req.admin?.id;
    return this.adminService.inviteAdmin(dto, inviterId);
  }

  @Post('admins/accept-invite')
  @AdminPublic()
  @ApiOperation({
    summary: 'Accept admin invite and create account',
    description:
      'Accept an admin invitation using the token from the invite email and set a password. This endpoint is public and does not require authentication.',
  })
  @ApiBody({ type: AcceptInviteDto })
  @ApiResponse({
    status: 201,
    description: 'Admin account created successfully',
    schema: {
      example: {
        id: 'admin-uuid',
        email: 'newadmin@example.com',
        role: 'COMPLIANCE',
        message: 'Admin account created successfully. You can now log in.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid token, expired, or already used' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  async acceptInvite(@Body(ValidationPipe) dto: AcceptInviteDto) {
    return this.adminService.acceptInvite(dto);
  }

  @Get('admins')
  @RequirePermission(PERMISSIONS.VIEW_ADMINS)
  @ApiOperation({
    summary: 'List all admins',
    description: 'Get paginated list of admins with filtering options',
  })
  @ApiResponse({ status: 200, description: 'Admins retrieved successfully' })
  async getAdmins(@Query(ValidationPipe) filters: GetAdminsDto) {
    return this.adminService.getAdmins(filters);
  }

  @Get('admins/:adminId')
  @RequirePermission(PERMISSIONS.VIEW_ADMINS)
  @ApiOperation({
    summary: 'Get admin details',
    description: 'Get detailed information about a specific admin including invite history',
  })
  @ApiParam({ name: 'adminId', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Admin details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async getAdminById(@Param('adminId') adminId: string) {
    return this.adminService.getAdminById(adminId);
  }

  @Patch('admins/:adminId')
  @RequirePermission(PERMISSIONS.MANAGE_ADMINS)
  @ApiOperation({
    summary: 'Update admin',
    description: 'Update admin role or active status. Cannot deactivate own account.',
  })
  @ApiParam({ name: 'adminId', description: 'Admin ID' })
  @ApiBody({ type: UpdateAdminDto })
  @ApiResponse({ status: 200, description: 'Admin updated successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiResponse({ status: 400, description: 'Cannot deactivate own account' })
  async updateAdmin(@Param('adminId') adminId: string, @Body(ValidationPipe) dto: UpdateAdminDto, @Request() req: any) {
    const updaterId = req.admin?.id;
    return this.adminService.updateAdmin(adminId, dto, updaterId);
  }

  @Delete('admins/:adminId')
  @RequirePermission(PERMISSIONS.MANAGE_ADMINS)
  @ApiOperation({
    summary: 'Deactivate admin',
    description: 'Deactivate an admin account (soft delete). Cannot deactivate own account.',
  })
  @ApiParam({ name: 'adminId', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Admin deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiResponse({ status: 400, description: 'Cannot deactivate own account' })
  async deactivateAdmin(@Param('adminId') adminId: string, @Request() req: any) {
    const deactivatorId = req.admin?.id;
    return this.adminService.deactivateAdmin(adminId, deactivatorId);
  }

  // =====================
  // ROLE MANAGEMENT
  // =====================

  @Get('roles')
  @RequirePermission(PERMISSIONS.VIEW_ADMINS)
  @ApiOperation({
    summary: 'Get all roles with user counts',
    description: 'Get list of all admin roles with the number of active admins in each role',
  })
  @ApiResponse({
    status: 200,
    description: 'Roles retrieved successfully',
    schema: {
      example: {
        roles: [
          { role: 'SUPER_ADMIN', userCount: 2 },
          { role: 'COMPLIANCE', userCount: 5 },
          { role: 'OPERATIONS', userCount: 3 },
        ],
      },
    },
  })
  async getRoles() {
    return this.adminService.getRoles();
  }

  @Get('roles/:roleName')
  @RequirePermission(PERMISSIONS.VIEW_ADMINS)
  @ApiOperation({
    summary: 'Get role details with assigned admins',
    description: 'Get details of a specific role and list of admins assigned to it',
  })
  @ApiParam({ name: 'roleName', enum: AdminRole, description: 'Role name' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Role details retrieved successfully' })
  async getRoleDetails(@Param('roleName') roleName: AdminRole, @Query(ValidationPipe) filters: GetRolesDto) {
    return this.adminService.getRoleDetails(roleName, filters);
  }

  @Post('roles/:roleName/assign')
  @RequirePermission(PERMISSIONS.MANAGE_ADMINS)
  @ApiOperation({
    summary: 'Assign role to admin',
    description: 'Assign a specific role to an admin user',
  })
  @ApiParam({ name: 'roleName', enum: AdminRole, description: 'Role name to assign' })
  @ApiBody({ type: AssignRoleDto })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiResponse({ status: 400, description: 'Invalid role name' })
  async assignRoleToAdmin(
    @Param('roleName') roleName: AdminRole,
    @Body(ValidationPipe) dto: AssignRoleDto,
    @Request() req: any,
  ) {
    // Validate role name
    if (!Object.values(AdminRole).includes(roleName)) {
      throw new BadRequestException('Invalid role name');
    }
    const assignerId = req.admin?.id;
    return this.adminService.assignRoleToAdmin(dto.adminId, roleName, assignerId);
  }

  // =====================
  // WITHDRAWALS MANAGEMENT
  // =====================

  @Get('withdrawals')
  @RequirePermission(PERMISSIONS.VIEW_WITHDRAWALS)
  @ApiOperation({
    summary: 'List all withdrawals',
    description: 'Get paginated list of payout transactions (withdrawals) with filtering options',
  })
  @ApiResponse({ status: 200, description: 'Withdrawals retrieved successfully' })
  async getWithdrawals(@Query(ValidationPipe) filters: GetWithdrawalsDto) {
    return this.adminService.getWithdrawals(filters);
  }

  @Post('withdrawals/:id/approve')
  @RequirePermission(PERMISSIONS.MANAGE_WITHDRAWALS)
  @ApiOperation({
    summary: 'Approve withdrawal',
    description:
      'Approve a pending withdrawal. For withdrawals that require approval (exceed daily limit), this will process the payout (debit wallet, call provider). For other withdrawals, this updates status to PROCESSING. Status will be updated to SUCCESS by webhook when provider confirms.',
  })
  @ApiParam({ name: 'id', description: 'Payout Transaction ID' })
  @ApiResponse({ status: 200, description: 'Withdrawal approved successfully' })
  @ApiResponse({ status: 410, description: 'Admin approval workflow disabled' })
  @ApiResponse({ status: 404, description: 'Withdrawal not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async approveWithdrawal(@Param('id') payoutTransactionId: string, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.approveWithdrawal(payoutTransactionId, adminId);
  }

  @Post('withdrawals/:id/reject')
  @RequirePermission(PERMISSIONS.MANAGE_WITHDRAWALS)
  @ApiOperation({
    summary: 'Reject withdrawal',
    description:
      'Reject a pending withdrawal with a reason. For withdrawals that require approval, this will delete the placeholder transaction and mark as REJECTED without debiting the wallet. For processed withdrawals, this updates status to REJECTED.',
  })
  @ApiParam({ name: 'id', description: 'Payout Transaction ID' })
  @ApiBody({ type: RejectWithdrawalDto })
  @ApiResponse({ status: 200, description: 'Withdrawal rejected successfully' })
  @ApiResponse({ status: 404, description: 'Withdrawal not found' })
  @ApiResponse({ status: 400, description: 'Withdrawal is already rejected or successful' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async rejectWithdrawal(
    @Param('id') payoutTransactionId: string,
    @Body(ValidationPipe) dto: RejectWithdrawalDto,
    @Request() req: any,
  ) {
    const adminId = req.admin?.id;
    return this.adminService.rejectWithdrawal(payoutTransactionId, adminId, dto);
  }

  // =====================
  // NOTIFICATIONS MANAGEMENT
  // =====================

  @Get('notifications')
  @RequirePermission(PERMISSIONS.VIEW_NOTIFICATIONS)
  @ApiOperation({
    summary: 'List admin notifications',
    description: 'Get paginated list of notifications for the current admin. Note: Admin must have a linked userId.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'read', required: false, type: Boolean, description: 'Filter by read status' })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Filter by notification type' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter from date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter to date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Admin does not have a linked user account' })
  async getNotifications(@Query(ValidationPipe) filters: GetNotificationsDto, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.getAdminNotifications(adminId, filters);
  }

  @Patch('notifications/:id/read')
  @RequirePermission(PERMISSIONS.VIEW_NOTIFICATIONS)
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Mark a notification as read for the current admin',
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 400, description: 'Admin does not have a linked user account' })
  async markNotificationAsRead(@Param('id') notificationId: string, @Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.markNotificationAsRead(adminId, notificationId);
  }

  @Get('notifications/unread-count')
  @RequirePermission(PERMISSIONS.VIEW_NOTIFICATIONS)
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Get count of unread notifications for the current admin',
  })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Admin does not have a linked user account' })
  async getUnreadNotificationCount(@Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminService.getUnreadNotificationCount(adminId);
  }
}
