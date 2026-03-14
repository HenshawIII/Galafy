import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { DatabaseService } from '../../database/database.service.js';

export type AmlEventType =
  | 'RISK_SCORE_CALCULATED'
  | 'RISK_STATUS_CHANGED'
  | 'TRANSACTION_BLOCKED'
  | 'ANOMALY_DETECTED'
  | 'FREEZE_APPLIED'
  | 'FREEZE_RELEASED'
  | 'RISK_SCORE_UPDATE_FAILED';

export type AmlSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AmlLogEntry {
  eventType: AmlEventType;
  severity: AmlSeverity;
  timestamp: string;
  walletId?: string;
  transactionId?: string;
  sprayId?: string;
  customerId?: string;
  userId?: string;
  eventId?: string;
  details: {
    riskScore?: number;
    previousRiskScore?: number;
    riskStatus?: string;
    previousRiskStatus?: string;
    riskComponents?: {
      velocity?: number;
      amountSize?: number;
      frequency?: number;
      deviceRisk?: number;
    };
    anomalyType?: string;
    anomalyDetails?: Record<string, any>;
    transactionType?: string;
    transactionDirection?: string;
    amount?: string;
    blockReason?: string;
    freezeType?: 'SOFT_FREEZE' | 'HARD_FREEZE';
    metadata?: Record<string, any>;
  };
  context?: Record<string, any>;
}

@Injectable()
export class AmlLoggingService {
  private readonly logger = new Logger('AML');

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Log risk score calculation
   */
  logRiskScoreCalculated(
    walletId: string,
    riskScore: number,
    riskStatus: string,
    riskComponents: {
      velocity: number;
      amountSize: number;
      frequency: number;
      deviceRisk?: number;
    },
    customerId?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry: AmlLogEntry = {
      eventType: 'RISK_SCORE_CALCULATED',
      severity: this.determineSeverityFromRiskScore(riskScore),
      timestamp: new Date().toISOString(),
      walletId,
      customerId,
      details: {
        riskScore,
        riskStatus,
        riskComponents,
        metadata,
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log risk score: ${error.message}`);
    });
  }

  /**
   * Log risk status change
   */
  logRiskStatusChanged(
    walletId: string,
    previousStatus: string,
    newStatus: string,
    riskScore: number,
    previousRiskScore?: number,
    customerId?: string,
    metadata?: Record<string, any>,
  ): void {
    const severity = this.determineSeverityFromStatusChange(previousStatus, newStatus);

    const entry: AmlLogEntry = {
      eventType: 'RISK_STATUS_CHANGED',
      severity,
      timestamp: new Date().toISOString(),
      walletId,
      customerId,
      details: {
        riskScore,
        previousRiskScore,
        riskStatus: newStatus,
        previousRiskStatus: previousStatus,
        metadata,
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log risk status change: ${error.message}`);
    });
  }

  /**
   * Log transaction blocked due to AML rules
   */
  logTransactionBlocked(
    walletId: string,
    transactionId: string,
    transactionType: string,
    transactionDirection: string,
    amount: Decimal | string | number,
    blockReason: string,
    riskStatus: string,
    riskScore?: number,
    customerId?: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry: AmlLogEntry = {
      eventType: 'TRANSACTION_BLOCKED',
      severity: 'HIGH',
      timestamp: new Date().toISOString(),
      walletId,
      transactionId,
      customerId,
      userId,
      details: {
        transactionType,
        transactionDirection,
        amount: typeof amount === 'string' || typeof amount === 'number' ? amount.toString() : amount.toString(),
        blockReason,
        riskStatus,
        riskScore,
        metadata,
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log transaction blocked: ${error.message}`);
    });
  }

  /**
   * Log anomaly detection
   */
  logAnomalyDetected(
    sprayId: string,
    transactionId: string,
    sprayerWalletId: string,
    receiverWalletId: string,
    amount: Decimal | string | number,
    anomalyType: string,
    severity: AmlSeverity,
    patternData: Record<string, any>,
    eventId?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry: AmlLogEntry = {
      eventType: 'ANOMALY_DETECTED',
      severity,
      timestamp: new Date().toISOString(),
      walletId: sprayerWalletId,
      transactionId,
      sprayId,
      eventId,
      details: {
        anomalyType,
        amount: typeof amount === 'string' || typeof amount === 'number' ? amount.toString() : amount.toString(),
        anomalyDetails: {
          ...patternData,
          receiverWalletId,
        },
        metadata,
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log anomaly: ${error.message}`);
    });
  }

  /**
   * Log wallet creation abuse detected
   */
  logWalletCreationAbuse(
    userId: string,
    customerId: string,
    anomalyType: string,
    severity: AmlSeverity,
    patternData: Record<string, any>,
    metadata?: Record<string, any>,
  ): void {
    const entry: AmlLogEntry = {
      eventType: 'ANOMALY_DETECTED',
      severity,
      timestamp: new Date().toISOString(),
      userId,
      customerId,
      details: {
        anomalyType,
        anomalyDetails: patternData,
        metadata,
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log wallet creation abuse: ${error.message}`);
    });
  }

  /**
   * Log freeze applied
   */
  logFreezeApplied(
    walletId: string,
    freezeType: 'SOFT_FREEZE' | 'HARD_FREEZE',
    riskScore: number,
    reason: string,
    customerId?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry: AmlLogEntry = {
      eventType: 'FREEZE_APPLIED',
      severity: freezeType === 'HARD_FREEZE' ? 'CRITICAL' : 'HIGH',
      timestamp: new Date().toISOString(),
      walletId,
      customerId,
      details: {
        freezeType,
        riskScore,
        blockReason: reason,
        metadata,
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log freeze applied: ${error.message}`);
    });
  }

  /**
   * Log freeze released
   */
  logFreezeReleased(
    walletId: string,
    previousFreezeType: 'SOFT_FREEZE' | 'HARD_FREEZE',
    newRiskScore: number,
    customerId?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry: AmlLogEntry = {
      eventType: 'FREEZE_RELEASED',
      severity: 'MEDIUM',
      timestamp: new Date().toISOString(),
      walletId,
      customerId,
      details: {
        riskScore: newRiskScore,
        previousRiskStatus: previousFreezeType,
        riskStatus: 'NORMAL',
        metadata,
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log freeze released: ${error.message}`);
    });
  }

  /**
   * Log risk score update failure
   */
  logRiskScoreUpdateFailed(walletId: string, error: Error, customerId?: string, metadata?: Record<string, any>): void {
    const entry: AmlLogEntry = {
      eventType: 'RISK_SCORE_UPDATE_FAILED',
      severity: 'MEDIUM',
      timestamp: new Date().toISOString(),
      walletId,
      customerId,
      details: {
        metadata: {
          ...metadata,
          error: {
            message: error.message,
            stack: error.stack,
          },
        },
      },
    };

    this.logEntry(entry).catch((error) => {
      this.logger.error(`Failed to log risk score update failure: ${error.message}`);
    });
  }

  /**
   * Determine severity from risk score
   */
  private determineSeverityFromRiskScore(riskScore: number): AmlSeverity {
    if (riskScore >= 85) {
      return 'CRITICAL';
    } else if (riskScore >= 70) {
      return 'HIGH';
    } else if (riskScore >= 50) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Determine severity from status change
   */
  private determineSeverityFromStatusChange(previousStatus: string, newStatus: string): AmlSeverity {
    if (newStatus === 'HARD_FREEZE') {
      return 'CRITICAL';
    } else if (newStatus === 'SOFT_FREEZE') {
      return 'HIGH';
    } else if (previousStatus !== 'NORMAL' && newStatus === 'NORMAL') {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Log entry with appropriate log level
   * Also persists to database if severity is MEDIUM or higher
   */
  private async logEntry(entry: AmlLogEntry): Promise<void> {
    const logData = {
      type: 'AML_EVENT',
      ...entry,
    };

    // Use appropriate log level based on severity
    switch (entry.severity) {
      case 'CRITICAL':
        this.logger.error(JSON.stringify(logData, null, 2));
        break;
      case 'HIGH':
        this.logger.error(JSON.stringify(logData, null, 2));
        break;
      case 'MEDIUM':
        this.logger.warn(JSON.stringify(logData, null, 2));
        break;
      case 'LOW':
        this.logger.log(JSON.stringify(logData, null, 2));
        break;
      default:
        this.logger.warn(JSON.stringify(logData, null, 2));
    }

    // Persist to database if severity is MEDIUM or higher
    if (entry.severity !== 'LOW') {
      try {
        await this.databaseService.amlAlert.create({
          data: {
            eventType: entry.eventType,
            severity: entry.severity,
            status: 'PENDING',
            walletId: entry.walletId,
            transactionId: entry.transactionId,
            sprayId: entry.sprayId,
            customerId: entry.customerId,
            userId: entry.userId,
            eventId: entry.eventId,
            details: entry.details,
            context: entry.context,
          },
        });
      } catch (error: any) {
        // Log error but don't fail the main operation
        this.logger.error(`Failed to persist AML alert: ${error.message}`);
      }
    }
  }
}
