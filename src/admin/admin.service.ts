import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';
import { CacheService } from '../cache/cache.service.js';
import { GetConfigDto, UpdateConfigDto, CreateConfigDto } from './dto/config.dto.js';
import { GetUsersDto, RestrictUserDto } from './dto/user-management.dto.js';
import { GetKycRequestsDto, ApproveKycDto, RejectKycDto } from './dto/kyc-management.dto.js';
import { TransactionAnalyticsDto } from './dto/analytics.dto.js';
import { GetAlertsDto, UpdateAlertStatusDto } from './dto/alert.dto.js';
import { GetActionLogsDto } from './dto/action-log.dto.js';
import { AdminRole, KycRequestStatus, UtilityBillStatus, TransactionType, TransactionDirection, TransactionStatus, AlertStatus } from '../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';
import * as csv from 'fast-csv';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly APPROVED_TIER_2_LIMIT = new Decimal(1000000000); // 10M in kobo

  private readonly CACHE_KEY = 'admin:analytics:transaction-summary';
  private readonly CACHE_TTL = 300; // 5 minutes in seconds

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Check if admin has write permissions
   * Note: Permission checking is now handled by PermissionsGuard, but keeping this for backward compatibility
   */
  private async checkAdminPermissions(adminId: string): Promise<void> {
    const admin = await this.databaseService.admin.findUnique({
      where: {
        id: adminId,
      },
      select: {
        role: true,
        isActive: true,
      },
    });

    if (!admin || !admin.isActive) {
      throw new ForbiddenException('You do not have admin permissions');
    }

    // Only SUPER_ADMIN, OPERATIONS, and COMPLIANCE can modify configs
    // Note: This is now redundant with PermissionsGuard, but kept for service-level validation
    if (
      admin.role !== AdminRole.SUPER_ADMIN &&
      admin.role !== AdminRole.OPERATIONS &&
      admin.role !== AdminRole.COMPLIANCE
    ) {
      throw new ForbiddenException('You do not have permission to modify configurations');
    }
  }

  /**
   * Get all configurations with optional filtering
   */
  async getConfigs(filters?: GetConfigDto) {
    const configs = await this.configService.getAllConfigs({
      category: filters?.category,
      isActive: filters?.isActive,
    });

    return {
      configs,
      total: configs.length,
    };
  }

  /**
   * Get configuration by key
   */
  async getConfigByKey(key: string) {
    try {
      const config = await this.configService.getConfig(key);
      // Get full config record for response
      const configRecord = await this.databaseService.systemConfig.findUnique({
        where: { key },
      });

      if (!configRecord) {
        throw new NotFoundException(`Configuration key "${key}" not found`);
      }

      return configRecord;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`Configuration key "${key}" not found`);
    }
  }

  /**
   * Get configurations by category
   */
  async getConfigsByCategory(category: string) {
    return this.configService.getConfigByCategory(category);
  }

  /**
   * Update configuration
   */
  async updateConfig(key: string, data: UpdateConfigDto, adminId: string) {
    await this.checkAdminPermissions(adminId);
    return this.configService.updateConfig(key, data.value, adminId, data.description);
  }

  /**
   * Create new configuration
   */
  async createConfig(data: CreateConfigDto, adminId: string) {
    await this.checkAdminPermissions(adminId);
    return this.configService.createConfig(data, adminId);
  }

  /**
   * Delete/deactivate configuration
   */
  async deleteConfig(key: string, adminId: string) {
    await this.checkAdminPermissions(adminId);
    return this.configService.deleteConfig(key);
  }

  /**
   * Log admin action
   */
  private async logAdminAction(
    adminId: string,
    actionType: string,
    targetType: string,
    targetId: string,
    details?: any,
    reason?: string,
  ) {
    await this.databaseService.adminActionLog.create({
      data: {
        adminId,
        actionType,
        targetType,
        targetId,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        reason,
      },
    });
    this.logger.log(`Admin action logged: ${actionType} on ${targetType} ${targetId} by admin ${adminId}`);
  }

  /**
   * Get users with pagination and filtering
   */
  async getUsers(filters: GetUsersDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      customer: {
        ...(filters.tier && { tier: filters.tier }),
        ...(filters.isAmlRestricted !== undefined && { isAmlRestricted: filters.isAmlRestricted }),
      },
    };

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { emailAddress: { contains: filters.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [users, total] = await Promise.all([
      this.databaseService.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: {
            include: {
              wallets: {
                select: {
                  id: true,
                  availableBalance: true,
                  ledgerBalance: true,
                  currencyId: true,
                },
              },
              withdrawalLimit: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.user.count({ where }),
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        customer: user.customer
          ? {
              id: user.customer.id,
              tier: user.customer.tier,
              isAmlRestricted: user.customer.isAmlRestricted,
              amlRestrictedAt: user.customer.amlRestrictedAt,
              amlRestrictionReason: user.customer.amlRestrictionReason,
              wallets: user.customer.wallets,
              withdrawalLimit: user.customer.withdrawalLimit,
            }
          : null,
        createdAt: user.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user details
   */
  async getUserDetails(userId: string) {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      include: {
        customer: {
          include: {
            wallets: true,
            withdrawalLimit: true,
            kycRequests: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            utilityBillSubmissions: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            ninVerification: true,
            bvnVerification: true,
            addressVerification: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get transaction summary (last 10 transactions)
    const transactions = await this.databaseService.transaction.findMany({
      where: {
        wallet: {
          customerId: user.customer?.id,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        wallet: {
          select: {
            currencyId: true,
          },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      customer: user.customer
        ? {
            ...user.customer,
            transactions: transactions,
          }
        : null,
    };
  }

  /**
   * Restrict user (AML flagging)
   */
  async restrictUser(userId: string, adminId: string, dto: RestrictUserDto) {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      include: { customer: true },
    });

    if (!user || !user.customer) {
      throw new NotFoundException('User or customer not found');
    }

    const customer = await this.databaseService.customer.update({
      where: { id: user.customer.id },
      data: {
        isAmlRestricted: true,
        amlRestrictedAt: new Date(),
        amlRestrictionReason: dto.reason,
      },
    });

    await this.logAdminAction(
      adminId,
      'USER_RESTRICTED',
      'CUSTOMER',
      customer.id,
      { userId, reason: dto.reason },
      dto.reason,
    );

    return customer;
  }

  /**
   * Unrestrict user
   */
  async unrestrictUser(userId: string, adminId: string) {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      include: { customer: true },
    });

    if (!user || !user.customer) {
      throw new NotFoundException('User or customer not found');
    }

    const customer = await this.databaseService.customer.update({
      where: { id: user.customer.id },
      data: {
        isAmlRestricted: false,
        amlRestrictedAt: null,
        amlRestrictionReason: null,
      },
    });

    await this.logAdminAction(
      adminId,
      'USER_UNRESTRICTED',
      'CUSTOMER',
      customer.id,
      { userId },
    );

    return customer;
  }

  /**
   * Get pending KYC requests
   */
  async getPendingKycRequests(filters: GetKycRequestsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      status: KycRequestStatus.PENDING,
      ...(filters.tier && {
        customer: {
          tier: filters.tier,
        },
      }),
    };

    const [requests, total] = await Promise.all([
      this.databaseService.kycRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.kycRequest.count({ where }),
    ]);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get pending utility bill submissions
   */
  async getPendingUtilityBills(filters: GetKycRequestsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      status: UtilityBillStatus.PENDING,
    };

    const [submissions, total] = await Promise.all([
      this.databaseService.utilityBillSubmission.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
              withdrawalLimit: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.utilityBillSubmission.count({ where }),
    ]);

    return {
      submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Approve KYC request
   */
  async approveKycRequest(requestId: string, adminId: string, dto: ApproveKycDto) {
    const request = await this.databaseService.kycRequest.findUnique({
      where: { id: requestId },
      include: { customer: true },
    });

    if (!request) {
      throw new NotFoundException('KYC request not found');
    }

    if (request.status !== KycRequestStatus.PENDING) {
      throw new BadRequestException('KYC request is not pending');
    }

    // Update request status
    const updatedRequest = await this.databaseService.kycRequest.update({
      where: { id: requestId },
      data: {
        status: KycRequestStatus.APPROVED,
        adminId,
        decidedAt: new Date(),
        reason: dto.notes,
      },
    });

    // Update customer tier if needed (based on request tier)
    if (request.requestedTier && request.requestedTier !== request.customer.tier) {
      await this.databaseService.customer.update({
        where: { id: request.customer.id },
        data: {
          tier: request.requestedTier,
        },
      });
    }

    await this.logAdminAction(
      adminId,
      'KYC_APPROVED',
      'KYC_REQUEST',
      requestId,
      { customerId: request.customer.id, tier: request.requestedTier, notes: dto.notes },
      dto.notes,
    );

    return updatedRequest;
  }

  /**
   * Reject KYC request
   */
  async rejectKycRequest(requestId: string, adminId: string, dto: RejectKycDto) {
    const request = await this.databaseService.kycRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('KYC request not found');
    }

    if (request.status !== KycRequestStatus.PENDING) {
      throw new BadRequestException('KYC request is not pending');
    }

    const updatedRequest = await this.databaseService.kycRequest.update({
      where: { id: requestId },
      data: {
        status: KycRequestStatus.REJECTED,
        adminId,
        decidedAt: new Date(),
        reason: dto.reason,
      },
    });

    await this.logAdminAction(
      adminId,
      'KYC_REJECTED',
      'KYC_REQUEST',
      requestId,
      { reason: dto.reason },
      dto.reason,
    );

    return updatedRequest;
  }

  /**
   * Approve utility bill
   */
  async approveUtilityBill(submissionId: string, adminId: string, dto: ApproveKycDto) {
    const submission = await this.databaseService.utilityBillSubmission.findUnique({
      where: { id: submissionId },
      include: { customer: true },
    });

    if (!submission) {
      throw new NotFoundException('Utility bill submission not found');
    }

    if (submission.status !== UtilityBillStatus.PENDING) {
      throw new BadRequestException('Utility bill submission is not pending');
    }

    // Update submission status
    const updatedSubmission = await this.databaseService.utilityBillSubmission.update({
      where: { id: submissionId },
      data: {
        status: UtilityBillStatus.APPROVED,
        adminId,
        reviewedAt: new Date(),
        reason: dto.notes,
      },
    });

    // Get or create withdrawal limit
    let withdrawalLimit = await this.databaseService.withdrawalLimit.findUnique({
      where: { customerId: submission.customerId },
    });

    if (!withdrawalLimit) {
      withdrawalLimit = await this.databaseService.withdrawalLimit.create({
        data: {
          customerId: submission.customerId,
          dailyLimit: new Decimal(100000000), // 1M default
          approvedDailyLimit: this.APPROVED_TIER_2_LIMIT,
          isLimitIncreased: true,
          dailyWithdrawn: new Decimal(0),
          lastResetDate: new Date(),
        },
      });
    } else {
      withdrawalLimit = await this.databaseService.withdrawalLimit.update({
        where: { id: withdrawalLimit.id },
        data: {
          approvedDailyLimit: this.APPROVED_TIER_2_LIMIT,
          isLimitIncreased: true,
        },
      });
    }

    await this.logAdminAction(
      adminId,
      'UTILITY_BILL_APPROVED',
      'UTILITY_BILL',
      submissionId,
      { customerId: submission.customerId, notes: dto.notes },
      dto.notes,
    );

    return {
      submission: updatedSubmission,
      withdrawalLimit,
    };
  }

  /**
   * Reject utility bill
   */
  async rejectUtilityBill(submissionId: string, adminId: string, dto: RejectKycDto) {
    const submission = await this.databaseService.utilityBillSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Utility bill submission not found');
    }

    if (submission.status !== UtilityBillStatus.PENDING) {
      throw new BadRequestException('Utility bill submission is not pending');
    }

    const updatedSubmission = await this.databaseService.utilityBillSubmission.update({
      where: { id: submissionId },
      data: {
        status: UtilityBillStatus.REJECTED,
        adminId,
        reviewedAt: new Date(),
        reason: dto.reason,
      },
    });

    await this.logAdminAction(
      adminId,
      'UTILITY_BILL_REJECTED',
      'UTILITY_BILL',
      submissionId,
      { reason: dto.reason },
      dto.reason,
    );

    return updatedSubmission;
  }

  /**
   * Get transaction analytics summary
   * Returns aggregated metrics: total wallet balance, total withdrawn, and total received
   * Results are cached for 5 minutes to reduce database load (only for all-time queries)
   * 
   * @param filters Optional date range filters (startDate, endDate)
   */
  async getTransactionAnalyticsSummary(filters?: TransactionAnalyticsDto) {
    // Build date range filter for transactions
    const dateFilter: any = {};
    if (filters?.startDate || filters?.endDate) {
      dateFilter.createdAt = {};
      if (filters.startDate) {
        dateFilter.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        // Set end date to end of day (23:59:59.999)
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.createdAt.lte = endDate;
      }
    }

    // Build cache key (include date range if provided, or use default for all-time)
    const cacheKey = filters?.startDate || filters?.endDate
      ? `${this.CACHE_KEY}:${filters.startDate || 'all'}:${filters.endDate || 'all'}`
      : this.CACHE_KEY;

    // Only use cache for all-time queries (no date filters)
    if (!filters?.startDate && !filters?.endDate) {
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) {
        this.logger.log('Transaction analytics summary retrieved from cache');
        return {
          ...cached,
          cached: true,
        };
      }
    }

    // Build transaction where clauses with date filters
    const withdrawnWhere = {
      type: TransactionType.PAYOUT,
      direction: TransactionDirection.DEBIT,
      status: TransactionStatus.SUCCESS,
      ...dateFilter,
    };

    const receivedWhere = {
      type: TransactionType.INFLOW,
      direction: TransactionDirection.CREDIT,
      status: TransactionStatus.SUCCESS,
      ...dateFilter,
    };

    // Execute three parallel queries for optimal performance
    const [walletBalanceResult, withdrawnResult, receivedResult] = await Promise.all([
      // Total Wallet Balance: Sum of all availableBalance from all wallets
      // Note: Wallet balance is current state, not filtered by date range
      this.databaseService.wallet.aggregate({
        _sum: {
          availableBalance: true,
        },
      }),
      // Total Withdrawn: Sum of successful PAYOUT transactions (DEBIT) within date range
      this.databaseService.transaction.aggregate({
        where: withdrawnWhere,
        _sum: {
          amount: true,
        },
      }),
      // Total Received: Sum of successful INFLOW transactions (CREDIT) within date range
      this.databaseService.transaction.aggregate({
        where: receivedWhere,
        _sum: {
          amount: true,
        },
      }),
    ]);

    // Handle null values (no transactions/wallets yet) - default to 0
    const totalWalletBalance = walletBalanceResult._sum.availableBalance || new Decimal(0);
    const totalWithdrawn = withdrawnResult._sum.amount || new Decimal(0);
    const totalReceived = receivedResult._sum.amount || new Decimal(0);

    const result = {
      totalWalletBalance: totalWalletBalance.toString(),
      totalWithdrawn: totalWithdrawn.toString(),
      totalReceived: totalReceived.toString(),
      cached: false,
      timestamp: new Date().toISOString(),
      ...(filters?.startDate && { startDate: filters.startDate }),
      ...(filters?.endDate && { endDate: filters.endDate }),
    };

    // Only cache all-time queries (no date filters) to avoid cache bloat
    if (!filters?.startDate && !filters?.endDate) {
      await this.cacheService.set(cacheKey, {
        totalWalletBalance: result.totalWalletBalance,
        totalWithdrawn: result.totalWithdrawn,
        totalReceived: result.totalReceived,
        timestamp: result.timestamp,
      }, this.CACHE_TTL);
      this.logger.log('Transaction analytics summary calculated and cached');
    } else {
      this.logger.log(`Transaction analytics summary calculated for date range: ${filters.startDate || 'all'} to ${filters.endDate || 'all'}`);
    }

    return result;
  }

  /**
   * Get AML alerts with filtering and pagination
   */
  async getAlerts(filters: GetAlertsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.severity) {
      where.severity = filters.severity;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    if (filters.walletId) {
      where.walletId = filters.walletId;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    const [alerts, total] = await Promise.all([
      this.databaseService.amlAlert.findMany({
        where,
        skip,
        take: limit,
        include: {
          wallet: {
            select: {
              id: true,
              virtualAccountNumber: true,
              customer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  emailAddress: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.amlAlert.count({ where }),
    ]);

    return {
      alerts: alerts.map((alert) => ({
        id: alert.id,
        eventType: alert.eventType,
        severity: alert.severity,
        status: alert.status,
        walletId: alert.walletId,
        transactionId: alert.transactionId,
        sprayId: alert.sprayId,
        customerId: alert.customerId,
        userId: alert.userId,
        eventId: alert.eventId,
        details: alert.details,
        context: alert.context,
        reviewedBy: alert.reviewedBy,
        reviewedAt: alert.reviewedAt,
        resolutionNotes: alert.resolutionNotes,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt,
        wallet: alert.wallet,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get alert by ID
   */
  async getAlertById(alertId: string) {
    const alert = await this.databaseService.amlAlert.findUnique({
      where: { id: alertId },
      include: {
        wallet: {
          include: {
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return alert;
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(alertId: string, adminId: string, dto: UpdateAlertStatusDto) {
    const alert = await this.databaseService.amlAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const updatedAlert = await this.databaseService.amlAlert.update({
      where: { id: alertId },
      data: {
        status: dto.status as AlertStatus,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        resolutionNotes: dto.resolutionNotes,
      },
    });

    this.logger.log(`Alert ${alertId} status updated to ${dto.status} by admin ${adminId}`);
    return updatedAlert;
  }

  /**
   * Get alert statistics
   */
  async getAlertStats() {
    const [total, pending, reviewed, resolved, dismissed] = await Promise.all([
      this.databaseService.amlAlert.count(),
      this.databaseService.amlAlert.count({ where: { status: AlertStatus.PENDING } }),
      this.databaseService.amlAlert.count({ where: { status: AlertStatus.REVIEWED } }),
      this.databaseService.amlAlert.count({ where: { status: AlertStatus.RESOLVED } }),
      this.databaseService.amlAlert.count({ where: { status: AlertStatus.DISMISSED } }),
    ]);

    // Get counts by severity
    const [critical, high, medium, low] = await Promise.all([
      this.databaseService.amlAlert.count({ where: { severity: 'CRITICAL' } }),
      this.databaseService.amlAlert.count({ where: { severity: 'HIGH' } }),
      this.databaseService.amlAlert.count({ where: { severity: 'MEDIUM' } }),
      this.databaseService.amlAlert.count({ where: { severity: 'LOW' } }),
    ]);

    // Get pending counts by severity
    const [pendingCritical, pendingHigh, pendingMedium, pendingLow] = await Promise.all([
      this.databaseService.amlAlert.count({
        where: { status: AlertStatus.PENDING, severity: 'CRITICAL' },
      }),
      this.databaseService.amlAlert.count({
        where: { status: AlertStatus.PENDING, severity: 'HIGH' },
      }),
      this.databaseService.amlAlert.count({
        where: { status: AlertStatus.PENDING, severity: 'MEDIUM' },
      }),
      this.databaseService.amlAlert.count({
        where: { status: AlertStatus.PENDING, severity: 'LOW' },
      }),
    ]);

    return {
      total,
      pending,
      reviewed,
      resolved,
      dismissed,
      bySeverity: {
        CRITICAL: critical,
        HIGH: high,
        MEDIUM: medium,
        LOW: low,
      },
      pendingBySeverity: {
        CRITICAL: pendingCritical,
        HIGH: pendingHigh,
        MEDIUM: pendingMedium,
        LOW: pendingLow,
      },
    };
  }

  // =====================
  // AUDIT LOGS
  // =====================

  /**
   * Get admin action logs with filtering and pagination
   */
  async getActionLogs(filters: GetActionLogsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.adminId) where.adminId = filters.adminId;
    if (filters.actionType) where.actionType = filters.actionType;
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.targetId) where.targetId = filters.targetId;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.databaseService.adminActionLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      this.databaseService.adminActionLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Export admin action logs as CSV
   */
  async exportActionLogsCSV(filters: GetActionLogsDto): Promise<{ buffer: Buffer; filename: string }> {
    const where: any = {};
    if (filters.adminId) where.adminId = filters.adminId;
    if (filters.actionType) where.actionType = filters.actionType;
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.targetId) where.targetId = filters.targetId;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    // Fetch all matching logs (no pagination for export)
    const logs = await this.databaseService.adminActionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return new Promise((resolve, reject) => {
      const rows: any[] = [];

      // Add header row
      rows.push([
        'Date',
        'Time',
        'Admin Email',
        'Admin Role',
        'Action Type',
        'Target Type',
        'Target ID',
        'Reason',
        'Details',
      ]);

      // Add log rows
      logs.forEach((log) => {
        const date = new Date(log.createdAt);
        const dateStr = date.toISOString().split('T')[0];
        const timeStr = date.toTimeString().split(' ')[0];

        rows.push([
          dateStr,
          timeStr,
          log.admin.email || '',
          log.admin.role || '',
          log.actionType || '',
          log.targetType || '',
          log.targetId || '',
          log.reason || '',
          log.details ? JSON.stringify(log.details) : '',
        ]);
      });

      // Convert to CSV using fast-csv
      const chunks: Buffer[] = [];
      const stream = csv.write(rows, { headers: false });

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const filename = filters.startDate && filters.endDate
          ? `admin-action-logs-${filters.startDate.split('T')[0]}-to-${filters.endDate.split('T')[0]}.csv`
          : 'admin-action-logs-all.csv';
        resolve({ buffer, filename });
      });
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
}
