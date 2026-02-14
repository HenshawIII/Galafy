import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ConfigService } from '../config/config.service.js';
import { CacheService } from '../cache/cache.service.js';
import { GetConfigDto, UpdateConfigDto, CreateConfigDto } from './dto/config.dto.js';
import { GetUsersDto, RestrictUserDto } from './dto/user-management.dto.js';
import { GetKycRequestsDto, ApproveKycDto, RejectKycDto } from './dto/kyc-management.dto.js';
import { TransactionAnalyticsDto } from './dto/analytics.dto.js';
import { GetAlertsDto, UpdateAlertStatusDto } from './dto/alert.dto.js';
import { GetActionLogsDto } from './dto/action-log.dto.js';
import { InviteAdminDto, AcceptInviteDto, GetAdminsDto, UpdateAdminDto, AssignRoleDto } from './dto/admin-management.dto.js';
import { AdminRole, KycRequestStatus, UtilityBillStatus, TransactionType, TransactionDirection, TransactionStatus, AlertStatus, EventStatus, PayoutStatus } from '../../generated/prisma/enums.js';
import { GetEventsDto, GetSprayActivityDto, GetTopSprayersDto } from './dto/events-management.dto.js';
import { GetTransactionsDto } from './dto/transactions-management.dto.js';
import { GetWithdrawalsDto, RejectWithdrawalDto } from './dto/withdrawals-management.dto.js';
import { GetNotificationsDto } from './dto/notifications-management.dto.js';
import { Decimal } from '@prisma/client/runtime/library';
import * as csv from 'fast-csv';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../users/email.service.js';

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
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generate secure random token for admin invite
   */
  private generateInviteToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

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
   * Search users by email, phone, or username
   * Auto-detects search type: email (contains @), phone (digits/+/spaces), or username (partial match)
   */
  async searchUsers(query: string) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return { users: [] };
    }

    let users: any[] = [];

    // Detect search type
    if (trimmedQuery.includes('@')) {
      // Email search - exact match
      const user = await this.databaseService.user.findUnique({
        where: { email: trimmedQuery },
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
      });
      users = user ? [user] : [];
    } else if (/^[\d+\s\-()]+$/.test(trimmedQuery)) {
      // Phone search - exact match (contains only digits, +, spaces, hyphens, parentheses)
      // Try exact match first, then try normalized (without spaces)
      const normalizedPhone = trimmedQuery.replace(/\s+/g, ''); // Remove spaces for matching
      let user = await this.databaseService.user.findUnique({
        where: { phone: trimmedQuery },
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
      });
      
      // If not found with original format, try normalized format
      if (!user && normalizedPhone !== trimmedQuery) {
        user = await this.databaseService.user.findUnique({
          where: { phone: normalizedPhone },
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
        });
      }
      users = user ? [user] : [];
    } else {
      // Username search - partial match (case-insensitive)
      users = await this.databaseService.user.findMany({
        where: {
          username: {
            contains: trimmedQuery,
            mode: 'insensitive',
          },
        },
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
        take: 50, // Limit username results to prevent too many results
        orderBy: { createdAt: 'desc' },
      });
    }

    // Format response
    return {
      users: users.map((user) => {
        const walletCount = user.customer?.wallets?.length || 0;
        const totalBalance = user.customer?.wallets?.reduce(
          (sum: Decimal, wallet: any) => sum.plus(wallet.availableBalance || 0),
          new Decimal(0),
        ) || new Decimal(0);

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          phone: user.phone,
          profilePicture: user.profilePicture,
          isVerified: user.isVerified,
          customer: user.customer
            ? {
                id: user.customer.id,
                tier: user.customer.tier,
                isAmlRestricted: user.customer.isAmlRestricted,
                amlRestrictedAt: user.customer.amlRestrictedAt,
                amlRestrictionReason: user.customer.amlRestrictionReason,
                wallets: user.customer.wallets,
                withdrawalLimit: user.customer.withdrawalLimit,
                walletCount,
                totalBalance: totalBalance.toString(),
              }
            : null,
          createdAt: user.createdAt,
        };
      }),
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

    // Generate chart data - default to last 7 days if no date filters provided
    let chartData: Array<{ date: string; amount: string; count: number }> = [];
    
    // Determine date range for chart data
    const chartStartDate = filters?.startDate 
      ? new Date(filters.startDate)
      : (() => {
          const date = new Date();
          date.setDate(date.getDate() - 7);
          date.setHours(0, 0, 0, 0);
          return date;
        })();
    
    const chartEndDate = filters?.endDate
      ? (() => {
          const date = new Date(filters.endDate);
          date.setHours(23, 59, 59, 999);
          return date;
        })()
      : new Date();

    // Fetch all successful transactions for chart data
    const chartTransactions = await this.databaseService.transaction.findMany({
      where: {
        status: TransactionStatus.SUCCESS,
        createdAt: {
          gte: chartStartDate,
          lte: chartEndDate,
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // Group transactions by date
    const transactionsByDate = new Map<string, { amount: Decimal; count: number }>();
    
    chartTransactions.forEach((tx) => {
      const dateKey = tx.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD format
      const existing = transactionsByDate.get(dateKey);
      
      if (existing) {
        existing.amount = existing.amount.plus(tx.amount);
        existing.count += 1;
      } else {
        transactionsByDate.set(dateKey, {
          amount: tx.amount,
          count: 1,
        });
      }
    });

    // Convert to array and sort by date
    chartData = Array.from(transactionsByDate.entries())
      .map(([date, data]) => ({
        date,
        amount: data.amount.toString(),
        count: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const result = {
      totalWalletBalance: totalWalletBalance.toString(),
      totalWithdrawn: totalWithdrawn.toString(),
      totalReceived: totalReceived.toString(),
      chartData,
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
   * Get dashboard overview metrics
   * Returns: Total Users, Verified Users, Total Events, Active Events, Revenue, Pending KYC count (utility bill submissions)
   * Includes growth percentages comparing last 7 days vs previous 7 days
   */
  async getDashboardMetrics() {
    // Calculate date ranges for growth calculations
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Execute parallel queries for optimal performance
    const [
      totalUsers,
      verifiedUsers,
      totalEvents,
      activeEvents,
      pendingKycRequests,
      // All-time revenue from AdminFee
      allTimeRevenueResult,
      // Growth period data - total counts 7 days ago
      totalUsers7DaysAgo,
      totalEvents7DaysAgo,
      totalRevenue7DaysAgo,
    ] = await Promise.all([
      // Total Users - count ALL users (current)
      this.databaseService.user.count(),
      // Verified Users - count only verified users
      this.databaseService.user.count({
        where: {
          isVerified: true,
        },
      }),
      // Total Events (current)
      this.databaseService.event.count(),
      // Active Events (LIVE status)
      this.databaseService.event.count({
        where: {
          status: 'LIVE',
        },
      }),
      // Pending KYC Requests - count pending utility bill submissions
      this.databaseService.utilityBillSubmission.count({
        where: {
          status: UtilityBillStatus.PENDING,
        },
      }),
      // All-time Revenue from AdminFee (status = COLLECTED)
      this.databaseService.adminFee.aggregate({
        where: {
          status: 'COLLECTED',
        },
        _sum: {
          amount: true,
        },
      }),
      // Total Users 7 days ago (users created before 7 days ago)
      this.databaseService.user.count({
        where: {
          createdAt: {
            lt: sevenDaysAgo,
          },
        },
      }),
      // Total Events 7 days ago (events created before 7 days ago)
      this.databaseService.event.count({
        where: {
          createdAt: {
            lt: sevenDaysAgo,
          },
        },
      }),
      // Total Revenue 7 days ago (AdminFee collected before 7 days ago)
      this.databaseService.adminFee.aggregate({
        where: {
          status: 'COLLECTED',
          createdAt: {
            lt: sevenDaysAgo,
          },
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    // Calculate growth percentages
    // Growth compares current total vs total 7 days ago
    const calculateGrowth = (current: number, previous: number): number => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    // Total Users Growth: current total vs total 7 days ago
    const totalUsersGrowth = calculateGrowth(totalUsers, totalUsers7DaysAgo);

    // Total Events Growth: current total vs total 7 days ago
    const totalEventsGrowth = calculateGrowth(totalEvents, totalEvents7DaysAgo);

    // Revenue Growth: current total revenue vs total revenue 7 days ago
    // Current: Sum of all AdminFee with status='COLLECTED' (all time)
    // 7 days ago: Sum of all AdminFee with status='COLLECTED' that were created before 7 days ago
    const totalRevenue7DaysAgoAmount = totalRevenue7DaysAgo._sum.amount || new Decimal(0);
    const currentTotalRevenue = allTimeRevenueResult._sum.amount || new Decimal(0);
    
    // Convert to numbers for comparison (handle Decimal type properly)
    const currentAmount = currentTotalRevenue instanceof Decimal 
      ? Number(currentTotalRevenue.toString()) 
      : Number(currentTotalRevenue) || 0;
    const previousAmount = totalRevenue7DaysAgoAmount instanceof Decimal
      ? Number(totalRevenue7DaysAgoAmount.toString())
      : Number(totalRevenue7DaysAgoAmount) || 0;
    
    // Calculate growth: if same, should be 0%; negative only if fees were reversed/refunded
    // Current = sum of all COLLECTED fees (all time)
    // Previous = sum of COLLECTED fees created before 7 days ago
    // If they're equal, growth = 0%
    const revenueGrowth = calculateGrowth(currentAmount, previousAmount);

    const allTimeRevenue = allTimeRevenueResult._sum.amount || new Decimal(0);

    return {
      totalUsers,
      totalUsersGrowth,
      verifiedUsers,
      totalEvents,
      totalEventsGrowth,
      activeEvents,
      pendingKyc: pendingKycRequests,
      revenue: allTimeRevenue.toString(), // All-time AdminFee total in kobo
      revenueGrowth,
      totalSprayers: 0, // TODO: Calculate from sprays if needed
      totalAttendees: 0, // TODO: Calculate from event participants if needed
    };
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

    // Use streaming to avoid loading all logs into memory
    // Limit to 100,000 records max to prevent memory issues
    const MAX_EXPORT_RECORDS = 100000;
    
    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
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

      try {
        let skip = 0;
        const batchSize = 1000; // Process in batches
        let totalProcessed = 0;

        while (totalProcessed < MAX_EXPORT_RECORDS) {
          const logs = await this.databaseService.adminActionLog.findMany({
            where,
            skip,
            take: batchSize,
            orderBy: { createdAt: 'desc' },
            select: {
              createdAt: true,
              actionType: true,
              targetType: true,
              targetId: true,
              reason: true,
              details: true,
              admin: {
                select: {
                  email: true,
                  role: true,
                },
              },
            },
          });

          if (logs.length === 0) break;

          // Add batch rows
          for (const log of logs) {
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
          }

          totalProcessed += logs.length;
          skip += batchSize;

          // If we got fewer records than batch size, we're done
          if (logs.length < batchSize) break;
        }

        // Convert to CSV using fast-csv (now with limited rows)
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
      } catch (error) {
        reject(error);
      }
    });
  }

  // =====================
  // ADMIN MANAGEMENT
  // =====================

  /**
   * Invite a new admin user
   */
  async inviteAdmin(dto: InviteAdminDto, inviterId: string) {
    // Check if admin with this email already exists
    const existingAdmin = await this.databaseService.admin.findUnique({
      where: { email: dto.email },
    });

    if (existingAdmin) {
      throw new ConflictException('An admin with this email already exists');
    }

    // Check if there's a pending invite for this email
    const existingInvite = await this.databaseService.adminInvite.findUnique({
      where: { email: dto.email },
    });

    if (existingInvite && !existingInvite.accepted && new Date() < existingInvite.expiresAt) {
      throw new ConflictException('An active invite already exists for this email');
    }

    // Get inviter details for email
    const inviter = await this.databaseService.admin.findUnique({
      where: { id: inviterId },
      select: { email: true },
    });

    // Generate invite token
    const token = this.generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create invite
    const invite = await this.databaseService.adminInvite.create({
      data: {
        email: dto.email,
        token,
        role: dto.role,
        invitedBy: inviterId,
        expiresAt,
      },
    });

    // Log admin action
    await this.logAdminAction(inviterId, 'ADMIN_INVITED', 'ADMIN_INVITE', invite.id, {
      email: dto.email,
      role: dto.role,
    });

    // Generate invite link
    const adminPortalUrl = process.env.ADMIN_PORTAL_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const inviteLink = `${adminPortalUrl}/admin/accept-invite?token=${token}`;

    // Send invite email
    try {
      await this.emailService.sendAdminInviteEmail(dto.email, {
        inviteLink,
        role: dto.role,
        expiresAt: invite.expiresAt,
        inviterEmail: inviter?.email,
      });
      this.logger.log(`Admin invite email sent to ${dto.email}`);
    } catch (error: any) {
      this.logger.error(`Failed to send admin invite email to ${dto.email}:`, error.message);
      // Continue even if email fails - invite is still created
      // In production, you might want to handle this differently
    }

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      // Only return token in development mode for testing
      token: process.env.NODE_ENV === 'development' ? token : undefined,
      message: 'Invite created successfully. Invitation email sent.',
    };
  }

  /**
   * Accept admin invite and create admin account
   */
  async acceptInvite(dto: AcceptInviteDto) {
    // Find invite by token
    const invite = await this.databaseService.adminInvite.findUnique({
      where: { token: dto.token },
      include: { inviter: { select: { email: true, role: true } } },
    });

    if (!invite) {
      throw new NotFoundException('Invalid invite token');
    }

    // Check if invite is already used
    if (invite.accepted || invite.usedAt) {
      throw new BadRequestException('This invite has already been used');
    }

    // Check if invite is expired
    if (new Date() > invite.expiresAt) {
      throw new BadRequestException('This invite has expired');
    }

    // Check if admin already exists
    const existingAdmin = await this.databaseService.admin.findUnique({
      where: { email: invite.email },
    });

    if (existingAdmin) {
      throw new ConflictException('An admin with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create admin account
    const admin = await this.databaseService.admin.create({
      data: {
        email: invite.email,
        password: hashedPassword,
        role: invite.role,
        isActive: true,
      },
    });

    // Mark invite as used
    await this.databaseService.adminInvite.update({
      where: { id: invite.id },
      data: {
        accepted: true,
        usedAt: new Date(),
      },
    });

    // Log admin action
    await this.logAdminAction(admin.id, 'ADMIN_CREATED', 'ADMIN', admin.id, {
      email: admin.email,
      role: admin.role,
      viaInvite: true,
    });

    this.logger.log(`Admin account created via invite: ${admin.email}`);

    return {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      message: 'Admin account created successfully. You can now log in.',
    };
  }

  /**
   * Get all admins with filtering and pagination
   */
  async getAdmins(filters: GetAdminsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.search) {
      where.email = {
        contains: filters.search,
        mode: 'insensitive',
      };
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [admins, total] = await Promise.all([
      this.databaseService.admin.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.databaseService.admin.count({ where }),
    ]);

    return {
      admins,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get admin by ID
   */
  async getAdminById(adminId: string) {
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
        sentInvites: {
          select: {
            id: true,
            email: true,
            role: true,
            accepted: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }

  /**
   * Update admin
   */
  async updateAdmin(adminId: string, dto: UpdateAdminDto, updaterId: string) {
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Prevent self-deactivation
    if (adminId === updaterId && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const updatedAdmin = await this.databaseService.admin.update({
      where: { id: adminId },
      data: {
        ...(dto.role && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    // Log admin action
    await this.logAdminAction(updaterId, 'ADMIN_UPDATED', 'ADMIN', adminId, {
      changes: dto,
    });

    const { password, ...adminWithoutPassword } = updatedAdmin;
    return adminWithoutPassword;
  }

  /**
   * Deactivate admin (soft delete)
   */
  async deactivateAdmin(adminId: string, deactivatorId: string) {
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Prevent self-deactivation
    if (adminId === deactivatorId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const updatedAdmin = await this.databaseService.admin.update({
      where: { id: adminId },
      data: { isActive: false },
    });

    // Log admin action
    await this.logAdminAction(deactivatorId, 'ADMIN_DEACTIVATED', 'ADMIN', adminId, {
      email: admin.email,
    });

    const { password, ...adminWithoutPassword } = updatedAdmin;
    return adminWithoutPassword;
  }

  /**
   * Get all roles with user counts
   */
  async getRoles() {
    const roles = Object.values(AdminRole);
    const roleStats = await Promise.all(
      roles.map(async (role) => {
        const count = await this.databaseService.admin.count({
          where: { role, isActive: true },
        });
        return { role, userCount: count };
      }),
    );

    return {
      roles: roleStats,
    };
  }

  /**
   * Get role details with assigned admins
   */
  async getRoleDetails(roleName: AdminRole, filters?: { page?: number; limit?: number }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const [admins, total] = await Promise.all([
      this.databaseService.admin.findMany({
        where: { role: roleName, isActive: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.databaseService.admin.count({
        where: { role: roleName, isActive: true },
      }),
    ]);

    return {
      role: roleName,
      admins,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Assign role to admin
   */
  async assignRoleToAdmin(adminId: string, role: AdminRole, assignerId: string) {
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const updatedAdmin = await this.databaseService.admin.update({
      where: { id: adminId },
      data: { role },
    });

    // Log admin action
    await this.logAdminAction(assignerId, 'ADMIN_ROLE_ASSIGNED', 'ADMIN', adminId, {
      email: admin.email,
      previousRole: admin.role,
      newRole: role,
    });

    const { password, ...adminWithoutPassword } = updatedAdmin;
    return adminWithoutPassword;
  }

  // =====================
  // EVENTS MANAGEMENT
  // =====================

  /**
   * Get all events with pagination and filters
   */
  async getEvents(filters: GetEventsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.hostUserId) {
      where.hostUserId = filters.hostUserId;
    }

    if (filters.startDate || filters.endDate) {
      where.startsAt = {};
      if (filters.startDate) {
        where.startsAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        where.startsAt.lte = endDate;
      }
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { hostUser: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { hostUser: { lastName: { contains: filters.search, mode: 'insensitive' } } },
        { hostUser: { email: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [events, total] = await Promise.all([
      this.databaseService.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          hostUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              username: true,
              phone: true,
              profilePicture: true,
            },
          },
          participants: {
            select: {
              id: true,
              role: true,
            },
          },
          sprays: {
            select: {
              id: true,
              totalAmount: true,
            },
          },
        },
      }),
      this.databaseService.event.count({ where }),
    ]);

    // Calculate stats for each event
    const eventsWithStats = events.map((event) => {
      const participantCount = event.participants.length;
      const sprayCount = event.sprays.length;
      const totalSprayed = event.sprays.reduce((sum, spray) => sum.plus(spray.totalAmount), new Decimal(0));
      const uniqueSprayers = new Set(event.sprays.map((s) => s.id)).size;

      return {
        ...event,
        startDate: event.startsAt, // Include starDate field
        participantCount,
        sprayCount,
        totalSprayed: totalSprayed.toString(),
        uniqueSprayerCount: uniqueSprayers,
        participants: undefined, // Remove detailed participants
        sprays: undefined, // Remove detailed sprays
      };
    });

    return {
      events: eventsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get top 5 events by number of sprayers
   * Ranks events by unique sprayer count, with tie-breaking based on earliest start date
   */
  async getTopEventsBySprayers() {
    // Get all events with their sprays
    const events = await this.databaseService.event.findMany({
      include: {
        sprays: {
          select: {
            sprayerWalletId: true,
            sprayerWallet: {
              select: {
                customer: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        },
        hostUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            phone: true,
            profilePicture: true,
          },
        },
      },
      orderBy: {
        startsAt: 'asc', // Pre-sort by start date for tie-breaking
      },
    });

    // Calculate unique sprayer count for each event and prepare data
    const eventsWithSprayerCount = events.map((event) => {
      // Count unique sprayers by userId
      const uniqueSprayers = new Set(
        event.sprays
          .map((spray) => spray.sprayerWallet?.customer?.userId)
          .filter((userId) => userId !== null && userId !== undefined),
      );
      const sprayerCount = uniqueSprayers.size;

      return {
        id: event.id,
        title: event.title,
        code: event.code,
        status: event.status,
        startsAt: event.startsAt,
        startDate: event.startsAt,
        location: event.location,
        category: event.category,
        imageUrl: event.imageUrl,
        hostUser: event.hostUser,
        sprayerCount,
        createdAt: event.createdAt,
      };
    });

    // Sort by sprayer count (descending), then by start date (ascending for tie-breaking)
    eventsWithSprayerCount.sort((a, b) => {
      // First sort by sprayer count (descending)
      if (b.sprayerCount !== a.sprayerCount) {
        return b.sprayerCount - a.sprayerCount;
      }
      // If sprayer count is the same (or both 0), sort by start date (ascending - earlier events rank higher)
      return a.startsAt.getTime() - b.startsAt.getTime();
    });

    // Get top 5 and assign ranks
    const top5Events = eventsWithSprayerCount.slice(0, 5).map((event, index) => ({
      rank: index + 1,
      ...event,
    }));

    return {
      events: top5Events,
    };
  }

  /**
   * Get event details by ID
   */
  async getEventDetails(eventId: string) {
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
      include: {
        hostUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            phone: true,
            profilePicture: true,
          },
        },
        participants: {
          take: 1000, // Limit participants to prevent memory issues
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
            wallet: {
              select: {
                id: true,
                virtualAccountNumber: true,
                availableBalance: true,
              },
            },
          },
        },
        sprays: {
          take: 1000, // Limit sprays to prevent memory issues
          include: {
            sprayerWallet: {
              include: {
                customer: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
            receiverWallet: {
              include: {
                customer: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Calculate stats
    const participantCount = event.participants.length;
    const sprayCount = event.sprays.length;
    const totalSprayed = event.sprays.reduce((sum, spray) => sum.plus(spray.totalAmount), new Decimal(0));
    const uniqueSprayers = new Set(event.sprays.map((s) => s.sprayerWallet.customer.userId)).size;

    return {
      ...event,
      participantCount,
      sprayCount,
      totalSprayed: totalSprayed.toString(),
      uniqueSprayerCount: uniqueSprayers,
    };
  }

  /**
   * Get spray activity feed for an event
   */
  async getEventSprayActivity(eventId: string, filters: GetSprayActivityDto) {
    // Verify event exists
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      eventId,
    };

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

    if (filters.minAmount) {
      where.totalAmount = { gte: new Decimal(filters.minAmount) };
    }

    if (filters.maxAmount) {
      where.totalAmount = {
        ...where.totalAmount,
        lte: new Decimal(filters.maxAmount),
      };
    }

    if (filters.search) {
      where.OR = [
        {
          sprayerWallet: {
            customer: {
              user: {
                OR: [
                  { firstName: { contains: filters.search, mode: 'insensitive' } },
                  { lastName: { contains: filters.search, mode: 'insensitive' } },
                  { email: { contains: filters.search, mode: 'insensitive' } },
                  { username: { contains: filters.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
        {
          note: { contains: filters.search, mode: 'insensitive' },
        },
      ];
    }

    const [sprays, total] = await Promise.all([
      this.databaseService.spray.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sprayerWallet: {
            include: {
              customer: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      firstName: true,
                      lastName: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
          receiverWallet: {
            include: {
              customer: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      firstName: true,
                      lastName: true,
                      username: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.databaseService.spray.count({ where }),
    ]);

    return {
      sprays: sprays.map((spray) => ({
        id: spray.id,
        totalAmount: spray.totalAmount.toString(),
        note: spray.note,
        createdAt: spray.createdAt,
        sprayer: spray.sprayerWallet.customer.user,
        receiver: spray.receiverWallet.customer.user,
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
   * Get top sprayers leaderboard for an event
   */
  async getEventTopSprayers(eventId: string, filters: GetTopSprayersDto) {
    // Verify event exists
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const limit = filters.limit || 10;

    // Get all sprays for the event
    const sprays = await this.databaseService.spray.findMany({
      where: {
        eventId,
      },
      include: {
        sprayerWallet: {
          include: {
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Aggregate by sprayer
    const sprayerMap = new Map<string, { user: any; totalAmount: Decimal; sprayCount: number; firstSprayAt: Date; lastSprayAt: Date }>();

    for (const spray of sprays) {
      const userId = spray.sprayerWallet.customer.userId;
      if (!userId) continue;

      // Skip anonymous if not including them
      if (!filters.includeAnonymous && !spray.sprayerWallet.customer.user) {
        continue;
      }

      if (!sprayerMap.has(userId)) {
        sprayerMap.set(userId, {
          user: spray.sprayerWallet.customer.user,
          totalAmount: new Decimal(0),
          sprayCount: 0,
          firstSprayAt: spray.createdAt,
          lastSprayAt: spray.createdAt,
        });
      }

      const entry = sprayerMap.get(userId)!;
      entry.totalAmount = entry.totalAmount.plus(spray.totalAmount);
      entry.sprayCount += 1;
      if (spray.createdAt < entry.firstSprayAt) {
        entry.firstSprayAt = spray.createdAt;
      }
      if (spray.createdAt > entry.lastSprayAt) {
        entry.lastSprayAt = spray.createdAt;
      }
    }

    // Convert to array and sort by total amount
    const leaderboard = Array.from(sprayerMap.values())
      .sort((a, b) => b.totalAmount.comparedTo(a.totalAmount))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        userId: entry.user?.id,
        username: entry.user?.username,
        email: entry.user?.email,
        firstName: entry.user?.firstName,
        lastName: entry.user?.lastName,
        totalAmount: entry.totalAmount.toString(),
        sprayCount: entry.sprayCount,
        firstSprayAt: entry.firstSprayAt.toISOString(),
        lastSprayAt: entry.lastSprayAt.toISOString(),
      }));

    return {
      eventId,
      eventTitle: event.title,
      leaderboard,
    };
  }

  /**
   * Suspend event (change status to CANCELLED)
   */
  async suspendEvent(eventId: string, adminId: string) {
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled');
    }

    const updatedEvent = await this.databaseService.event.update({
      where: { id: eventId },
      data: {
        status: EventStatus.CANCELLED,
      },
    });

    // Log admin action
    await this.logAdminAction(adminId, 'EVENT_SUSPENDED', 'EVENT', eventId, {
      eventTitle: event.title,
      previousStatus: event.status,
      newStatus: EventStatus.CANCELLED,
    });

    return updatedEvent;
  }

  /**
   * Generate event report (CSV format for now)
   */
  async generateEventReport(eventId: string) {
    const event = await this.getEventDetails(eventId);

    // Generate CSV content
    const csvRows: string[] = [];
    
    // Header
    csvRows.push('Event Report');
    csvRows.push(`Event: ${event.title}`);
    csvRows.push(`Status: ${event.status}`);
    csvRows.push(`Created: ${event.createdAt}`);
    csvRows.push('');
    
    // Summary
    csvRows.push('Summary');
    csvRows.push(`Total Participants: ${event.participantCount}`);
    csvRows.push(`Total Sprays: ${event.sprayCount}`);
    csvRows.push(`Total Amount Sprayed: ${event.totalSprayed}`);
    csvRows.push(`Unique Sprayers: ${event.uniqueSprayerCount}`);
    csvRows.push('');
    
    // Participants
    csvRows.push('Participants');
    csvRows.push('User ID,Email,First Name,Last Name,Role');
    for (const participant of event.participants) {
      csvRows.push(
        `${participant.user.id},${participant.user.email},${participant.user.firstName || ''},${participant.user.lastName || ''},${participant.role}`
      );
    }
    csvRows.push('');
    
    // Sprays
    csvRows.push('Sprays');
    csvRows.push('Spray ID,Sprayer,Receiver,Amount,Note,Created At');
    for (const spray of event.sprays) {
      const sprayerName = spray.sprayerWallet.customer.user
        ? `${spray.sprayerWallet.customer.user.firstName || ''} ${spray.sprayerWallet.customer.user.lastName || ''}`.trim() || spray.sprayerWallet.customer.user.email
        : 'Anonymous';
      const receiverName = spray.receiverWallet.customer.user
        ? `${spray.receiverWallet.customer.user.firstName || ''} ${spray.receiverWallet.customer.user.lastName || ''}`.trim() || spray.receiverWallet.customer.user.email
        : 'Unknown';
      csvRows.push(
        `${spray.id},${sprayerName},${receiverName},${spray.totalAmount.toString()},${spray.note || ''},${spray.createdAt.toISOString()}`
      );
    }

    const csvContent = csvRows.join('\n');
    const buffer = Buffer.from(csvContent, 'utf-8');
    const filename = `event-report-${event.code}-${new Date().toISOString().split('T')[0]}.csv`;

    return { buffer, filename };
  }

  // =====================
  // TRANSACTIONS MANAGEMENT
  // =====================

  /**
   * Get all transactions with pagination and filters
   */
  async getTransactions(filters: GetTransactionsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.direction) {
      where.direction = filters.direction;
    }

    if (filters.userId) {
      where.wallet = {
        customer: {
          userId: filters.userId,
        },
      };
    }

    if (filters.walletId) {
      where.walletId = filters.walletId;
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

    if (filters.search) {
      where.OR = [
        { reference: { contains: filters.search, mode: 'insensitive' } },
        { narration: { contains: filters.search, mode: 'insensitive' } },
        { externalReference: { contains: filters.search, mode: 'insensitive' } },
        {
          wallet: {
            customer: {
              user: {
                OR: [
                  { email: { contains: filters.search, mode: 'insensitive' } },
                  { firstName: { contains: filters.search, mode: 'insensitive' } },
                  { lastName: { contains: filters.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }

    const [transactions, total] = await Promise.all([
      this.databaseService.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
                      username: true,
                    },
                  },
                },
              },
            },
          },
          spray: {
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  code: true,
                },
              },
            },
          },
        },
      }),
      this.databaseService.transaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((tx) => ({
        ...tx,
        amount: tx.amount.toString(),
        user: tx.wallet?.customer?.user,
        event: tx.spray?.event,
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
   * Get transaction details by ID
   */
  async getTransactionDetails(transactionId: string) {
    const transaction = await this.databaseService.transaction.findUnique({
      where: { id: transactionId },
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
                    username: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        spray: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                code: true,
                status: true,
              },
            },
            sprayerWallet: {
              include: {
                customer: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
            receiverWallet: {
              include: {
                customer: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        username: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        fundingTransaction: true,
        payoutTransaction: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      ...transaction,
      amount: transaction.amount.toString(),
    };
  }

  /**
   * Generate transaction receipt (CSV format for now)
   */
  async generateTransactionReceipt(transactionId: string) {
    const transaction = await this.getTransactionDetails(transactionId);

    // Generate CSV content
    const csvRows: string[] = [];
    
    // Header
    csvRows.push('Transaction Receipt');
    csvRows.push(`Transaction ID: ${transaction.id}`);
    csvRows.push(`Reference: ${transaction.reference}`);
    csvRows.push(`Date: ${transaction.createdAt.toISOString()}`);
    csvRows.push('');
    
    // Transaction Details
    csvRows.push('Transaction Details');
    csvRows.push(`Type: ${transaction.type}`);
    csvRows.push(`Direction: ${transaction.direction}`);
    csvRows.push(`Status: ${transaction.status}`);
    csvRows.push(`Amount: ${transaction.amount}`);
    csvRows.push(`Currency: ${transaction.currencyId || 'NGN'}`);
    csvRows.push(`Narration: ${transaction.narration || ''}`);
    csvRows.push(`External Reference: ${transaction.externalReference || ''}`);
    csvRows.push('');
    
    // User Details
    if (transaction.wallet?.customer?.user) {
      csvRows.push('User Details');
      csvRows.push(`User ID: ${transaction.wallet.customer.user.id}`);
      csvRows.push(`Email: ${transaction.wallet.customer.user.email}`);
      csvRows.push(`Name: ${transaction.wallet.customer.user.firstName || ''} ${transaction.wallet.customer.user.lastName || ''}`.trim());
      csvRows.push('');
    }
    
    // Event Details (if spray transaction)
    if (transaction.spray?.event) {
      csvRows.push('Event Details');
      csvRows.push(`Event: ${transaction.spray.event.title}`);
      csvRows.push(`Event Code: ${transaction.spray.event.code}`);
      csvRows.push('');
    }

    const csvContent = csvRows.join('\n');
    const buffer = Buffer.from(csvContent, 'utf-8');
    const filename = `transaction-receipt-${transaction.reference}-${new Date().toISOString().split('T')[0]}.csv`;

    return { buffer, filename };
  }

  // =====================
  // WITHDRAWALS MANAGEMENT
  // =====================

  /**
   * Get all withdrawals (payout transactions) with pagination and filters
   */
  async getWithdrawals(filters: GetWithdrawalsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.userId) {
      where.wallet = {
        customer: {
          userId: filters.userId,
        },
      };
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

    const [withdrawals, total] = await Promise.all([
      this.databaseService.payoutTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
                      username: true,
                    },
                  },
                },
              },
            },
          },
          bankAccount: {
            select: {
              id: true,
              accountName: true,
              accountNumber: true,
              bankCode: true,
            },
          },
          transaction: {
            select: {
              id: true,
              reference: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.databaseService.payoutTransaction.count({ where }),
    ]);

    return {
      withdrawals: withdrawals.map((withdrawal) => ({
        ...withdrawal,
        amount: withdrawal.amount.toString(),
        fee: withdrawal.fee.toString(),
        user: withdrawal.wallet?.customer?.user,
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
   * Approve withdrawal (if manual approval workflow exists)
   * Note: Withdrawals are typically auto-processed, but this endpoint can be used to trigger reprocessing
   */
  async approveWithdrawal(payoutTransactionId: string, adminId: string) {
    const payoutTransaction = await this.databaseService.payoutTransaction.findUnique({
      where: { id: payoutTransactionId },
      include: {
        transaction: true,
        wallet: {
          include: {
            customer: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!payoutTransaction) {
      throw new NotFoundException('Withdrawal not found');
    }

    // If already successful, return as-is
    if (payoutTransaction.status === PayoutStatus.SUCCESS) {
      return payoutTransaction;
    }

    // Update status to PROCESSING (will be processed by webhook or provider service)
    // In a real implementation, you might trigger reprocessing here
    const updatedPayout = await this.databaseService.payoutTransaction.update({
      where: { id: payoutTransactionId },
      data: {
        status: PayoutStatus.PROCESSING,
      },
    });

    // Log admin action
    await this.logAdminAction(adminId, 'WITHDRAWAL_APPROVED', 'PAYOUT_TRANSACTION', payoutTransactionId, {
      amount: payoutTransaction.amount.toString(),
      previousStatus: payoutTransaction.status,
      newStatus: PayoutStatus.PROCESSING,
    });

    return updatedPayout;
  }

  /**
   * Reject withdrawal
   */
  async rejectWithdrawal(payoutTransactionId: string, adminId: string, dto: RejectWithdrawalDto) {
    const payoutTransaction = await this.databaseService.payoutTransaction.findUnique({
      where: { id: payoutTransactionId },
      include: {
        transaction: true,
        wallet: {
          include: {
            customer: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!payoutTransaction) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (payoutTransaction.status === PayoutStatus.REJECTED) {
      throw new BadRequestException('Withdrawal is already rejected');
    }

    if (payoutTransaction.status === PayoutStatus.SUCCESS) {
      throw new BadRequestException('Cannot reject a successful withdrawal');
    }

    // Update status to REJECTED
    const updatedPayout = await this.databaseService.payoutTransaction.update({
      where: { id: payoutTransactionId },
      data: {
        status: PayoutStatus.REJECTED,
      },
    });

    // Update related transaction status
    await this.databaseService.transaction.update({
      where: { id: payoutTransaction.transactionId },
      data: {
        status: TransactionStatus.FAILED,
      },
    });

    // Log admin action
    await this.logAdminAction(adminId, 'WITHDRAWAL_REJECTED', 'PAYOUT_TRANSACTION', payoutTransactionId, {
      amount: payoutTransaction.amount.toString(),
      previousStatus: payoutTransaction.status,
      newStatus: PayoutStatus.REJECTED,
      reason: dto.reason,
    });

    return updatedPayout;
  }

  // =====================
  // NOTIFICATIONS MANAGEMENT
  // =====================

  /**
   * Get admin notifications
   * Note: Admin must have a linked userId to receive notifications
   */
  async getAdminNotifications(adminId: string, filters: GetNotificationsDto) {
    // Get admin to check if they have a linked userId
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
      select: { userId: true },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (!admin.userId) {
      throw new BadRequestException('Admin does not have a linked user account. Notifications require a user account.');
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      userId: admin.userId,
    };

    if (filters.read !== undefined) {
      where.read = filters.read;
    }

    if (filters.type) {
      where.type = filters.type;
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

    const [notifications, total] = await Promise.all([
      this.databaseService.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.notification.count({ where }),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(adminId: string, notificationId: string) {
    // Get admin to check if they have a linked userId
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
      select: { userId: true },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (!admin.userId) {
      throw new BadRequestException('Admin does not have a linked user account. Notifications require a user account.');
    }

    // Verify notification belongs to admin's user
    const notification = await this.databaseService.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== admin.userId) {
      throw new ForbiddenException('Notification does not belong to this admin');
    }

    const updatedNotification = await this.databaseService.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return updatedNotification;
  }

  /**
   * Get unread notification count
   */
  async getUnreadNotificationCount(adminId: string) {
    // Get admin to check if they have a linked userId
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
      select: { userId: true },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (!admin.userId) {
      throw new BadRequestException('Admin does not have a linked user account. Notifications require a user account.');
    }

    const count = await this.databaseService.notification.count({
      where: {
        userId: admin.userId,
        read: false,
      },
    });

    return { unreadCount: count };
  }
}
