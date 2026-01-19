import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AmlLoggingService } from './aml-logging.service.js';
import { ConfigService } from '../../config/config.service.js';

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

  // Thresholds for abuse detection - loaded lazily from config
  private maxWalletsPerDevice: number | null = null;
  private maxWalletsPerIp: number | null = null;
  private maxWalletsPerDevice24H: number | null = null;
  private maxWalletsPerIp24H: number | null = null;

  // Fallback values
  private readonly FALLBACK_MAX_WALLETS_PER_DEVICE = 3;
  private readonly FALLBACK_MAX_WALLETS_PER_IP = 5;
  private readonly FALLBACK_MAX_WALLETS_PER_DEVICE_24H = 2;
  private readonly FALLBACK_MAX_WALLETS_PER_IP_24H = 3;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly amlLoggingService: AmlLoggingService,
    private readonly configService: ConfigService,
  ) {
    // Config will be loaded lazily on first use
  }

  /**
   * Load device abuse detection configuration from database or use fallback
   */
  private async loadConfig(): Promise<{
    MAX_WALLETS_PER_DEVICE: number;
    MAX_WALLETS_PER_IP: number;
    MAX_WALLETS_PER_DEVICE_24H: number;
    MAX_WALLETS_PER_IP_24H: number;
  }> {
    // Use cached values if already loaded
    if (this.maxWalletsPerDevice !== null) {
      return {
        MAX_WALLETS_PER_DEVICE: this.maxWalletsPerDevice,
        MAX_WALLETS_PER_IP: this.maxWalletsPerIp!,
        MAX_WALLETS_PER_DEVICE_24H: this.maxWalletsPerDevice24H!,
        MAX_WALLETS_PER_IP_24H: this.maxWalletsPerIp24H!,
      };
    }

    try {
      this.maxWalletsPerDevice = await this.configService.getConfig<number>(
        'MAX_WALLETS_PER_DEVICE',
        this.FALLBACK_MAX_WALLETS_PER_DEVICE,
      );
      this.maxWalletsPerIp = await this.configService.getConfig<number>(
        'MAX_WALLETS_PER_IP',
        this.FALLBACK_MAX_WALLETS_PER_IP,
      );
      this.maxWalletsPerDevice24H = await this.configService.getConfig<number>(
        'MAX_WALLETS_PER_DEVICE_24H',
        this.FALLBACK_MAX_WALLETS_PER_DEVICE_24H,
      );
      this.maxWalletsPerIp24H = await this.configService.getConfig<number>(
        'MAX_WALLETS_PER_IP_24H',
        this.FALLBACK_MAX_WALLETS_PER_IP_24H,
      );

      this.logger.log(
        `Device abuse detection configured: Max per device=${this.maxWalletsPerDevice}, ` +
        `Max per IP=${this.maxWalletsPerIp}, ` +
        `Max per device 24h=${this.maxWalletsPerDevice24H}, ` +
        `Max per IP 24h=${this.maxWalletsPerIp24H}`,
      );
    } catch (error) {
      this.logger.warn(`Failed to load device abuse config, using fallback values: ${error.message}`);
      this.maxWalletsPerDevice = this.FALLBACK_MAX_WALLETS_PER_DEVICE;
      this.maxWalletsPerIp = this.FALLBACK_MAX_WALLETS_PER_IP;
      this.maxWalletsPerDevice24H = this.FALLBACK_MAX_WALLETS_PER_DEVICE_24H;
      this.maxWalletsPerIp24H = this.FALLBACK_MAX_WALLETS_PER_IP_24H;
    }

    return {
      MAX_WALLETS_PER_DEVICE: this.maxWalletsPerDevice,
      MAX_WALLETS_PER_IP: this.maxWalletsPerIp,
      MAX_WALLETS_PER_DEVICE_24H: this.maxWalletsPerDevice24H,
      MAX_WALLETS_PER_IP_24H: this.maxWalletsPerIp24H,
    };
  }

  /**
   * Detect if wallet creation is abusive based on device/IP patterns
   */
  async detectAbuse(
    userId: string,
    customerId: string,
    deviceInfo: DeviceInfo,
  ): Promise<AbuseDetectionResult> {
    const config = await this.loadConfig();
    
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
      if (deviceWalletCount >= config.MAX_WALLETS_PER_DEVICE) {
        reasons.push(
          `Device has ${deviceWalletCount} wallets (threshold: ${config.MAX_WALLETS_PER_DEVICE})`,
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

      if (recentDeviceWallets.length >= config.MAX_WALLETS_PER_DEVICE_24H) {
        reasons.push(
          `Device created ${recentDeviceWallets.length} wallets in last 24 hours (threshold: ${config.MAX_WALLETS_PER_DEVICE_24H})`,
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
      if (ipWalletCount >= config.MAX_WALLETS_PER_IP) {
        reasons.push(
          `IP address has ${ipWalletCount} wallets (threshold: ${config.MAX_WALLETS_PER_IP})`,
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

      if (recentIpWallets.length >= config.MAX_WALLETS_PER_IP_24H) {
        reasons.push(
          `IP address created ${recentIpWallets.length} wallets in last 24 hours (threshold: ${config.MAX_WALLETS_PER_IP_24H})`,
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

