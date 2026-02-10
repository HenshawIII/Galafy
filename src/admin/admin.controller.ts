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
import { GetUsersDto, RestrictUserDto } from './dto/user-management.dto.js';
import { GetKycRequestsDto, ApproveKycDto, RejectKycDto } from './dto/kyc-management.dto.js';
import { TransactionAnalyticsDto } from './dto/analytics.dto.js';
import { GetAlertsDto, UpdateAlertStatusDto } from './dto/alert.dto.js';
import { GetActionLogsDto } from './dto/action-log.dto.js';
import { InviteAdminDto, AcceptInviteDto, GetAdminsDto, UpdateAdminDto, AssignRoleDto } from './dto/admin-management.dto.js';
import { GetRolesDto } from './dto/role-management.dto.js';

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
  @RequirePermission(PERMISSIONS.VIEW_CONFIG)
  @ApiOperation({
    summary: 'Get all configurations',
    description: 'Retrieves all system configurations with optional filtering by category and active status. Read access available to all authenticated admins.',
  })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category (e.g., FEES, RISK, DEVICE_ABUSE)', example: 'FEES' })
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
    description: 'Retrieves all configurations in a specific category. Read access available to all authenticated admins.',
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
  async updateConfig(
    @Param('key') key: string,
    @Body(ValidationPipe) data: UpdateConfigDto,
    @Request() req: any,
  ) {
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
    description: 'Creates a new configuration entry. Only admins with MANAGE_CONFIG permission can create configurations.',
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
  async createConfig(
    @Body(ValidationPipe) data: CreateConfigDto,
    @Request() req: any,
  ) {
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
    description: 'Soft deletes (deactivates) a configuration by setting isActive to false. Only admins with MANAGE_CONFIG permission can delete configurations.',
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
  async deleteConfig(
    @Param('key') key: string,
    @Request() req: any,
  ) {
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

  @Get('users/:userId')
  @RequirePermission(PERMISSIONS.VIEW_USERS)
  @ApiOperation({ summary: 'Get user details', description: 'Get detailed information about a specific user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetails(@Param('userId') userId: string) {
    return this.adminService.getUserDetails(userId);
  }

  @Post('users/:userId/restrict')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.RESTRICT_USERS)
  @ApiOperation({ summary: 'Restrict user (AML flagging)', description: 'Restrict a user due to AML compliance issues' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiBody({ type: RestrictUserDto })
  @ApiResponse({ status: 200, description: 'User restricted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async restrictUser(
    @Param('userId') userId: string,
    @Body(ValidationPipe) dto: RestrictUserDto,
    @Request() req: any,
  ) {
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

  @Get('kyc/utility-bills/pending')
  @RequirePermission(PERMISSIONS.VIEW_KYC_REQUESTS)
  @ApiOperation({ summary: 'Get pending utility bill submissions', description: 'Get paginated list of pending utility bill submissions' })
  @ApiResponse({ status: 200, description: 'Pending utility bill submissions retrieved successfully' })
  async getPendingUtilityBills(@Query(ValidationPipe) filters: GetKycRequestsDto) {
    return this.adminService.getPendingUtilityBills(filters);
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

  @Post('kyc/utility-bills/:submissionId/approve')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.APPROVE_UTILITY_BILL)
  @ApiOperation({ summary: 'Approve utility bill', description: 'Approve a pending utility bill submission and increase withdrawal limit' })
  @ApiParam({ name: 'submissionId', description: 'Utility bill submission ID' })
  @ApiBody({ type: ApproveKycDto })
  @ApiResponse({ status: 200, description: 'Utility bill approved successfully' })
  @ApiResponse({ status: 404, description: 'Utility bill submission not found' })
  @ApiResponse({ status: 400, description: 'Utility bill submission is not pending' })
  async approveUtilityBill(
    @Param('submissionId') submissionId: string,
    @Body(ValidationPipe) dto: ApproveKycDto,
    @Request() req: any,
  ) {
    const adminId = req.admin?.id;
    return this.adminService.approveUtilityBill(submissionId, adminId, dto);
  }

  @Post('kyc/utility-bills/:submissionId/reject')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPLIANCE)
  @RequirePermission(PERMISSIONS.REJECT_UTILITY_BILL)
  @ApiOperation({ summary: 'Reject utility bill', description: 'Reject a pending utility bill submission' })
  @ApiParam({ name: 'submissionId', description: 'Utility bill submission ID' })
  @ApiBody({ type: RejectKycDto })
  @ApiResponse({ status: 200, description: 'Utility bill rejected successfully' })
  @ApiResponse({ status: 404, description: 'Utility bill submission not found' })
  @ApiResponse({ status: 400, description: 'Utility bill submission is not pending' })
  async rejectUtilityBill(
    @Param('submissionId') submissionId: string,
    @Body(ValidationPipe) dto: RejectKycDto,
    @Request() req: any,
  ) {
    const adminId = req.admin?.id;
    return this.adminService.rejectUtilityBill(submissionId, adminId, dto);
  }

  // =====================
  // ANALYTICS
  // =====================

  @Get('analytics/transaction-summary')
  @RequirePermission(PERMISSIONS.VIEW_FINANCIAL_REPORTS)
  @ApiOperation({
    summary: 'Get transaction analytics summary',
    description: 'Returns aggregated metrics: total wallet balance, total withdrawn, and total received. Supports optional date range filtering. Results are cached for 5 minutes (all-time queries only).',
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
    @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date for logs (ISO 8601 format)', example: '2025-01-01T00:00:00.000Z' })
    @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date for logs (ISO 8601 format)', example: '2025-02-08T23:59:59.999Z' })
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
    @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Start date for logs (ISO 8601 format)', example: '2025-01-01T00:00:00.000Z' })
    @ApiQuery({ name: 'endDate', required: false, type: String, description: 'End date for logs (ISO 8601 format)', example: '2025-02-08T23:59:59.999Z' })
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
    async exportActionLogsCSV(
      @Query(ValidationPipe) filters: GetActionLogsDto,
      @Res() res: Response,
    ) {
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
    description: 'Accept an admin invitation using the token from the invite email and set a password. This endpoint is public and does not require authentication.',
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
  async updateAdmin(
    @Param('adminId') adminId: string,
    @Body(ValidationPipe) dto: UpdateAdminDto,
    @Request() req: any,
  ) {
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
  async getRoleDetails(
    @Param('roleName') roleName: AdminRole,
    @Query(ValidationPipe) filters: GetRolesDto,
  ) {
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
}
