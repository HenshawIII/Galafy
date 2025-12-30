import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AmlLoggingService } from './aml-logging.service.js';

export interface DeviceInfo {
  deviceToken?: string;
  ipAddress?: string;
  userAgent?: string;
  browserFingerprint?: string;
  os?: string;
  browser?: string;
}

export interface AbuseDetectionResult {
  isAbuse: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasons: string[];
  deviceWalletCount: number;
  ipWalletCount: number;
  flaggedWallets: Array<{
    walletId: string;
    userId: string;
    customerId: string;
    createdAt: Date;
  }>;
}

@Injectable()
export class DeviceAbuseDetectionService {
  private readonly logger = new Logger(DeviceAbuseDetectionService.name);

  // Thresholds for abuse detection (configurable via env)
  private readonly MAX_WALLETS_PER_DEVICE: number;
  private readonly MAX_WALLETS_PER_IP: number;
  private readonly MAX_WALLETS_PER_DEVICE_24H: number;
  private readonly MAX_WALLETS_PER_IP_24H: number;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly amlLoggingService: AmlLoggingService,
  ) {
    // Load thresholds from environment variables
    this.MAX_WALLETS_PER_DEVICE = parseInt(
      process.env.MAX_WALLETS_PER_DEVICE || '3',
      10,
    );
    this.MAX_WALLETS_PER_IP = parseInt(
      process.env.MAX_WALLETS_PER_IP || '5',
      10,
    );
    this.MAX_WALLETS_PER_DEVICE_24H = parseInt(
      process.env.MAX_WALLETS_PER_DEVICE_24H || '2',
      10,
    );
    this.MAX_WALLETS_PER_IP_24H = parseInt(
      process.env.MAX_WALLETS_PER_IP_24H || '3',
      10,
    );

    this.logger.log(
      `Device abuse detection configured: Max per device=${this.MAX_WALLETS_PER_DEVICE}, ` +
        `Max per IP=${this.MAX_WALLETS_PER_IP}, ` +
        `Max per device 24h=${this.MAX_WALLETS_PER_DEVICE_24H}, ` +
        `Max per IP 24h=${this.MAX_WALLETS_PER_IP_24H}`,
    );
  }

  /**
   * Detect if wallet creation is abusive based on device/IP patterns
   */
  async detectAbuse(
    userId: string,
    customerId: string,
    deviceInfo: DeviceInfo,
  ): Promise<AbuseDetectionResult> {
    const reasons: string[] = [];
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let deviceWalletCount = 0;
    let ipWalletCount = 0;
    const flaggedWallets: Array<{
      walletId: string;
      userId: string;
      customerId: string;
      createdAt: Date;
    }> = [];

    // Check device-based abuse
    if (deviceInfo.deviceToken) {
      const deviceWallets = await this.databaseService.walletCreationEvent.findMany({
        where: {
          deviceToken: deviceInfo.deviceToken,
        },
        include: {
          wallet: {
            select: {
              id: true,
              customer: {
                select: {
                  userId: true,
                  id: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      deviceWalletCount = deviceWallets.length;

      // Check total wallets from device
      if (deviceWalletCount >= this.MAX_WALLETS_PER_DEVICE) {
        reasons.push(
          `Device has ${deviceWalletCount} wallets (threshold: ${this.MAX_WALLETS_PER_DEVICE})`,
        );
        severity = this.upgradeSeverity(severity, 'HIGH');
        flaggedWallets.push(
          ...deviceWallets.slice(0, 5).map((event) => ({
            walletId: event.walletId,
            userId: event.userId,
            customerId: event.customerId,
            createdAt: event.createdAt,
          })),
        );
      }

      // Check wallets from device in last 24 hours
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const recentDeviceWallets = deviceWallets.filter(
        (event) => event.createdAt >= twentyFourHoursAgo,
      );

      if (recentDeviceWallets.length >= this.MAX_WALLETS_PER_DEVICE_24H) {
        reasons.push(
          `Device created ${recentDeviceWallets.length} wallets in last 24 hours (threshold: ${this.MAX_WALLETS_PER_DEVICE_24H})`,
        );
        severity = this.upgradeSeverity(severity, 'CRITICAL');
      }
    }

    // Check IP-based abuse
    if (deviceInfo.ipAddress) {
      const ipWallets = await this.databaseService.walletCreationEvent.findMany({
        where: {
          ipAddress: deviceInfo.ipAddress,
        },
        include: {
          wallet: {
            select: {
              id: true,
              customer: {
                select: {
                  userId: true,
                  id: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      ipWalletCount = ipWallets.length;

      // Check total wallets from IP
      if (ipWalletCount >= this.MAX_WALLETS_PER_IP) {
        reasons.push(
          `IP address has ${ipWalletCount} wallets (threshold: ${this.MAX_WALLETS_PER_IP})`,
        );
        severity = this.upgradeSeverity(severity, 'HIGH');
        flaggedWallets.push(
          ...ipWallets.slice(0, 5).map((event) => ({
            walletId: event.walletId,
            userId: event.userId,
            customerId: event.customerId,
            createdAt: event.createdAt,
          })),
        );
      }

      // Check wallets from IP in last 24 hours
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const recentIpWallets = ipWallets.filter(
        (event) => event.createdAt >= twentyFourHoursAgo,
      );

      if (recentIpWallets.length >= this.MAX_WALLETS_PER_IP_24H) {
        reasons.push(
          `IP address created ${recentIpWallets.length} wallets in last 24 hours (threshold: ${this.MAX_WALLETS_PER_IP_24H})`,
        );
        severity = this.upgradeSeverity(severity, 'CRITICAL');
      }
    }

    const isAbuse = reasons.length > 0;

    // Log abuse detection
    if (isAbuse) {
      this.logger.warn(
        `🚨 Wallet creation abuse detected for user ${userId}: ${reasons.join(', ')}`,
      );

      // Log to AML system
      this.amlLoggingService.logWalletCreationAbuse(
        userId,
        customerId,
        'MULTIPLE_WALLET_CREATION',
        severity,
        {
          deviceToken: deviceInfo.deviceToken,
          ipAddress: deviceInfo.ipAddress,
          deviceWalletCount,
          ipWalletCount,
          reasons,
          flaggedWallets: flaggedWallets.map((w) => ({
            walletId: w.walletId,
            userId: w.userId,
            customerId: w.customerId,
            createdAt: w.createdAt.toISOString(),
          })),
        },
        {
          userAgent: deviceInfo.userAgent,
          browserFingerprint: deviceInfo.browserFingerprint,
          os: deviceInfo.os,
          browser: deviceInfo.browser,
        },
      );
    }

    return {
      isAbuse,
      severity,
      reasons,
      deviceWalletCount,
      ipWalletCount,
      flaggedWallets,
    };
  }

  /**
   * Record wallet creation event with device information
   */
  async recordWalletCreation(
    walletId: string,
    userId: string,
    customerId: string,
    deviceInfo: DeviceInfo,
    abuseResult?: AbuseDetectionResult,
  ): Promise<void> {
    // Try to find NotificationDevice by deviceToken
    let deviceId: string | null = null;
    if (deviceInfo.deviceToken) {
      const device = await this.databaseService.notificationDevice.findUnique({
        where: { deviceToken: deviceInfo.deviceToken },
        select: { id: true },
      });
      deviceId = device?.id || null;
    }

    await this.databaseService.walletCreationEvent.create({
      data: {
        walletId,
        userId,
        customerId,
        deviceToken: deviceInfo.deviceToken,
        deviceId,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        browserFingerprint: deviceInfo.browserFingerprint,
        os: deviceInfo.os,
        browser: deviceInfo.browser,
        isFlagged: abuseResult?.isAbuse || false,
        flagReason: abuseResult?.reasons.join('; ') || null,
        deviceWalletCount: abuseResult?.deviceWalletCount || null,
        ipWalletCount: abuseResult?.ipWalletCount || null,
        metadata: {
          detectedAt: new Date().toISOString(),
          severity: abuseResult?.severity || 'LOW',
        },
      },
    });
  }

  /**
   * Get all wallets created from a specific device
   */
  async getWalletsByDevice(deviceToken: string) {
    return this.databaseService.walletCreationEvent.findMany({
      where: {
        deviceToken,
      },
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get all wallets created from a specific IP address
   */
  async getWalletsByIp(ipAddress: string) {
    return this.databaseService.walletCreationEvent.findMany({
      where: {
        ipAddress,
      },
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get flagged wallet creation events
   */
  async getFlaggedWalletCreations(limit: number = 100) {
    return this.databaseService.walletCreationEvent.findMany({
      where: {
        isFlagged: true,
      },
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
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Upgrade severity level (higher severity wins)
   */
  private upgradeSeverity(
    current: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    newSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const levels = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    return levels[newSeverity] > levels[current] ? newSeverity : current;
  }
}

