import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from 'dotenv';
import { AmlLoggingService } from '../../common/services/aml-logging.service.js';
config();

export type AnomalyType = 'REPEATED_RECIPIENT' | 'CIRCULAR_FLOW' | 'SMURFING';
export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AnomalyFinding {
  sprayId: string;
  transactionId: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  details: {
    sprayerWalletId: string;
    receiverWalletId: string;
    amount: string;
    eventId?: string;
    patternData: Record<string, any>;
  };
  detectedAt: string;
  metadata: Record<string, any>;
}

@Injectable()
export class SprayAnomalyService {
  private readonly logger = new Logger('ANOMALY');
  
  // Configuration from environment variables
  private readonly TIME_WINDOW_HOURS: number;
  private readonly REPEATED_RECIPIENT_THRESHOLD: number;
  private readonly SMURFING_TOTAL_THRESHOLD: Decimal;
  private readonly SMURFING_COUNT_THRESHOLD: number;
  private readonly SMURFING_AVG_PERCENT_THRESHOLD: number;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly amlLoggingService: AmlLoggingService,
  ) {
    // Load configuration from environment variables
    this.TIME_WINDOW_HOURS = parseInt(process.env.ANOMALY_TIME_WINDOW_HOURS || '24', 10);
    this.REPEATED_RECIPIENT_THRESHOLD = parseInt(process.env.ANOMALY_REPEATED_RECIPIENT_THRESHOLD || '5', 10);
    this.SMURFING_TOTAL_THRESHOLD = new Decimal(process.env.ANOMALY_SMURFING_TOTAL_THRESHOLD || '100000');
    this.SMURFING_COUNT_THRESHOLD = parseInt(process.env.ANOMALY_SMURFING_COUNT_THRESHOLD || '10', 10);
    this.SMURFING_AVG_PERCENT_THRESHOLD = parseFloat(process.env.ANOMALY_SMURFING_AVG_PERCENT_THRESHOLD || '0.10');

    this.logger.log(
      `Anomaly detection configured: TimeWindow=${this.TIME_WINDOW_HOURS}h, ` +
      `RepeatedRecipient=${this.REPEATED_RECIPIENT_THRESHOLD}, ` +
      `SmurfingTotal=${this.SMURFING_TOTAL_THRESHOLD.toString()}, ` +
      `SmurfingCount=${this.SMURFING_COUNT_THRESHOLD}, ` +
      `SmurfingAvgPercent=${this.SMURFING_AVG_PERCENT_THRESHOLD}`,
    );
  }

  /**
   * Main detection method - analyzes spray for all anomaly patterns
   */
  async detectAnomalies(
    sprayId: string,
    transactionId: string,
    sprayerWalletId: string,
    receiverWalletId: string,
    amount: Decimal,
    eventId?: string,
    sprayCreatedAt?: Date,
  ): Promise<AnomalyFinding[]> {
    const findings: AnomalyFinding[] = [];

    try {
      // Detect repeated same-recipient transfers
      const repeatedRecipient = await this.detectRepeatedRecipient(
        sprayerWalletId,
        receiverWalletId,
        this.TIME_WINDOW_HOURS,
      );
      if (repeatedRecipient) {
        findings.push({
          sprayId,
          transactionId,
          anomalyType: 'REPEATED_RECIPIENT',
          severity: this.calculateSeverity(repeatedRecipient.count, this.REPEATED_RECIPIENT_THRESHOLD),
          details: {
            sprayerWalletId,
            receiverWalletId,
            amount: amount.toString(),
            eventId,
            patternData: {
              count: repeatedRecipient.count,
              timeWindowHours: this.TIME_WINDOW_HOURS,
              threshold: this.REPEATED_RECIPIENT_THRESHOLD,
              firstSprayAt: repeatedRecipient.firstSprayAt,
              lastSprayAt: repeatedRecipient.lastSprayAt,
            },
          },
          detectedAt: new Date().toISOString(),
          metadata: {
            detectionRule: 'repeated_recipient',
            timeWindow: this.TIME_WINDOW_HOURS,
          },
        });
      }

      // Detect circular money flow
      const circularFlow = await this.detectCircularFlow(
        sprayerWalletId,
        receiverWalletId,
        this.TIME_WINDOW_HOURS,
        sprayCreatedAt,
      );
      if (circularFlow) {
        findings.push({
          sprayId,
          transactionId,
          anomalyType: 'CIRCULAR_FLOW',
          severity: 'HIGH',
          details: {
            sprayerWalletId,
            receiverWalletId,
            amount: amount.toString(),
            eventId,
            patternData: {
              circular: true,
              participants: [sprayerWalletId, receiverWalletId],
              timeDiffMinutes: circularFlow.timeDiffMinutes,
              reverseSprayAmount: circularFlow.reverseSprayAmount?.toString(),
              reverseSprayAt: circularFlow.reverseSprayAt,
            },
          },
          detectedAt: new Date().toISOString(),
          metadata: {
            detectionRule: 'circular_flow',
            timeWindow: this.TIME_WINDOW_HOURS,
          },
        });
      }

      // Detect smurfing (large sum split into small sprays)
      const smurfing = await this.detectSmurfing(sprayerWalletId, this.TIME_WINDOW_HOURS);
      if (smurfing) {
        findings.push({
          sprayId,
          transactionId,
          anomalyType: 'SMURFING',
          severity: this.calculateSmurfingSeverity(smurfing.total, smurfing.count),
          details: {
            sprayerWalletId,
            receiverWalletId,
            amount: amount.toString(),
            eventId,
            patternData: {
              total: smurfing.total.toString(),
              count: smurfing.count,
              average: smurfing.average.toString(),
              threshold: this.SMURFING_TOTAL_THRESHOLD.toString(),
              countThreshold: this.SMURFING_COUNT_THRESHOLD,
              avgPercentThreshold: this.SMURFING_AVG_PERCENT_THRESHOLD,
            },
          },
          detectedAt: new Date().toISOString(),
          metadata: {
            detectionRule: 'smurfing',
            timeWindow: this.TIME_WINDOW_HOURS,
          },
        });
      }

      // Log findings using AML logging service
      if (findings.length > 0) {
        for (const finding of findings) {
          // Convert severity to AML severity
          const amlSeverity = finding.severity === 'HIGH' ? 'HIGH' : finding.severity === 'MEDIUM' ? 'MEDIUM' : 'LOW';
          
          this.amlLoggingService.logAnomalyDetected(
            finding.sprayId,
            finding.transactionId,
            finding.details.sprayerWalletId,
            finding.details.receiverWalletId,
            new Decimal(finding.details.amount),
            finding.anomalyType,
            amlSeverity,
            finding.details.patternData,
            finding.details.eventId,
            finding.metadata,
          );
        }
        
        // Also log using existing method for backward compatibility
        this.logAnomalies(findings);
      }
    } catch (error) {
      this.logger.error(
        `Failed to detect anomalies for spray ${sprayId}: ${error.message}`,
        error.stack,
      );
    }

    return findings;
  }

  /**
   * Detect repeated same-recipient transfers
   */
  private async detectRepeatedRecipient(
    sprayerWalletId: string,
    receiverWalletId: string,
    timeWindowHours: number,
  ): Promise<{ count: number; firstSprayAt: string; lastSprayAt: string } | null> {
    const timeWindowStart = new Date();
    timeWindowStart.setHours(timeWindowStart.getHours() - timeWindowHours);

    // Query sprays from sprayer to receiver in time window
    const sprays = await this.databaseService.spray.findMany({
      where: {
        sprayerWalletId,
        receiverWalletId,
        createdAt: {
          gte: timeWindowStart,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (sprays.length >= this.REPEATED_RECIPIENT_THRESHOLD) {
      return {
        count: sprays.length,
        firstSprayAt: sprays[0].createdAt.toISOString(),
        lastSprayAt: sprays[sprays.length - 1].createdAt.toISOString(),
      };
    }

    return null;
  }

  /**
   * Detect circular money flow (A sprays to B, then B sprays back to A)
   */
  private async detectCircularFlow(
    sprayerWalletId: string,
    receiverWalletId: string,
    timeWindowHours: number,
    currentSprayCreatedAt?: Date,
  ): Promise<{ timeDiffMinutes: number; reverseSprayAmount?: Decimal; reverseSprayAt?: string } | null> {
    const timeWindowStart = new Date();
    timeWindowStart.setHours(timeWindowStart.getHours() - timeWindowHours);
    const currentTime = currentSprayCreatedAt || new Date();

    // Check if receiver has sprayed back to sprayer within time window
    const reverseSprays = await this.databaseService.spray.findMany({
      where: {
        sprayerWalletId: receiverWalletId,
        receiverWalletId: sprayerWalletId,
        createdAt: {
          gte: timeWindowStart,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
      },
      take: 1, // Get most recent reverse spray
    });

    if (reverseSprays.length > 0) {
      const reverseSpray = reverseSprays[0];
      // Calculate time difference between reverse spray and current spray
      const timeDiff = Math.abs(currentTime.getTime() - reverseSpray.createdAt.getTime());
      const timeDiffMinutes = Math.floor(timeDiff / (1000 * 60));

      return {
        timeDiffMinutes,
        reverseSprayAmount: reverseSpray.totalAmount,
        reverseSprayAt: reverseSpray.createdAt.toISOString(),
      };
    }

    return null;
  }

  /**
   * Detect smurfing (large total amount split into many small sprays)
   */
  private async detectSmurfing(
    sprayerWalletId: string,
    timeWindowHours: number,
  ): Promise<{ total: Decimal; count: number; average: Decimal } | null> {
    const timeWindowStart = new Date();
    timeWindowStart.setHours(timeWindowStart.getHours() - timeWindowHours);

    // Query all sprays from sprayer in time window
    const sprays = await this.databaseService.spray.findMany({
      where: {
        sprayerWalletId,
        createdAt: {
          gte: timeWindowStart,
        },
      },
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
      },
    });

    if (sprays.length < this.SMURFING_COUNT_THRESHOLD) {
      return null;
    }

    // Calculate total and average
    const total = sprays.reduce(
      (sum, spray) => sum.plus(spray.totalAmount),
      new Decimal(0),
    );
    const average = total.dividedBy(sprays.length);

    // Check if total exceeds threshold and average is less than threshold percentage
    const avgPercentOfTotal = average.dividedBy(this.SMURFING_TOTAL_THRESHOLD);
    
    if (
      total.gt(this.SMURFING_TOTAL_THRESHOLD) &&
      avgPercentOfTotal.lt(this.SMURFING_AVG_PERCENT_THRESHOLD)
    ) {
      return {
        total,
        count: sprays.length,
        average,
      };
    }

    return null;
  }

  /**
   * Calculate severity based on count vs threshold
   */
  private calculateSeverity(count: number, threshold: number): AnomalySeverity {
    if (count >= threshold * 2) {
      return 'HIGH';
    } else if (count >= threshold * 1.5) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Calculate severity for smurfing based on total and count
   */
  private calculateSmurfingSeverity(total: Decimal, count: number): AnomalySeverity {
    const totalMultiplier = total.dividedBy(this.SMURFING_TOTAL_THRESHOLD).toNumber();
    const countMultiplier = count / this.SMURFING_COUNT_THRESHOLD;

    if (totalMultiplier >= 5 || countMultiplier >= 3) {
      return 'HIGH';
    } else if (totalMultiplier >= 2 || countMultiplier >= 2) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Log anomalies in structured format for ML parsing
   */
  private logAnomalies(findings: AnomalyFinding[]): void {
    for (const finding of findings) {
      const logData = {
        type: 'ANOMALY_DETECTED',
        anomalyType: finding.anomalyType,
        severity: finding.severity,
        sprayId: finding.sprayId,
        transactionId: finding.transactionId,
        sprayerWalletId: finding.details.sprayerWalletId,
        receiverWalletId: finding.details.receiverWalletId,
        amount: finding.details.amount,
        eventId: finding.details.eventId,
        patternData: finding.details.patternData,
        detectedAt: finding.detectedAt,
        metadata: finding.metadata,
      };

      // Use appropriate log level based on severity
      if (finding.severity === 'HIGH') {
        this.logger.error(JSON.stringify(logData, null, 2));
      } else if (finding.severity === 'MEDIUM') {
        this.logger.warn(JSON.stringify(logData, null, 2));
      } else {
        this.logger.warn(JSON.stringify(logData, null, 2));
      }
    }
  }
}

