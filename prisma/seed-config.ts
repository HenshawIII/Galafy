import { PrismaClient } from '../generated/prisma/client.js';
import { ConfigType } from '../generated/prisma/enums.js';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

async function seedConfig() {
  console.log('Seeding system configuration...');

  const configs = [
    // Admin Fees
    {
      key: 'ADMIN_PAYOUT_FEE',
      category: 'FEES',
      value: '0.03',
      type: ConfigType.DECIMAL,
      description: 'Admin fee for payouts (3%)',
    },
    {
      key: 'ADMIN_FUNDING_FEE',
      category: 'FEES',
      value: '0.10',
      type: ConfigType.DECIMAL,
      description: 'Admin fee for funding transactions ≤100,000 (10%)',
    },
    {
      key: 'ADMIN_FUNDING_FEE_100KABOVE',
      category: 'FEES',
      value: '0.07',
      type: ConfigType.DECIMAL,
      description: 'Admin fee for funding transactions >100,000 (7%)',
    },
    {
      key: 'FUNDING_THRESHOLD',
      category: 'FEES',
      value: '100000.00',
      type: ConfigType.DECIMAL,
      description: 'Funding amount threshold for fee tier (100,000)',
    },

    // Risk Management
    {
      key: 'RISK_VELOCITY_MAX',
      category: 'RISK',
      value: '50',
      type: ConfigType.NUMBER,
      description: 'Maximum expected transactions in 24 hours for risk scoring',
    },
    {
      key: 'RISK_AMOUNT_MAX',
      category: 'RISK',
      value: '1000000',
      type: ConfigType.DECIMAL,
      description: 'Maximum expected transaction amount for risk scoring',
    },
    {
      key: 'RISK_SOFT_FREEZE_THRESHOLD',
      category: 'RISK',
      value: '70',
      type: ConfigType.NUMBER,
      description: 'Risk score threshold for soft freeze (0-100)',
    },
    {
      key: 'RISK_HARD_FREEZE_THRESHOLD',
      category: 'RISK',
      value: '85',
      type: ConfigType.NUMBER,
      description: 'Risk score threshold for hard freeze (0-100)',
    },
    {
      key: 'RISK_TIME_WINDOW_HOURS',
      category: 'RISK',
      value: '24',
      type: ConfigType.NUMBER,
      description: 'Time window in hours for risk score calculation',
    },

    // Device Abuse Detection
    {
      key: 'MAX_WALLETS_PER_DEVICE',
      category: 'DEVICE_ABUSE',
      value: '3',
      type: ConfigType.NUMBER,
      description: 'Maximum number of wallets allowed per device',
    },
    {
      key: 'MAX_WALLETS_PER_IP',
      category: 'DEVICE_ABUSE',
      value: '5',
      type: ConfigType.NUMBER,
      description: 'Maximum number of wallets allowed per IP address',
    },
    {
      key: 'MAX_WALLETS_PER_DEVICE_24H',
      category: 'DEVICE_ABUSE',
      value: '2',
      type: ConfigType.NUMBER,
      description: 'Maximum number of wallets allowed per device in 24 hours',
    },
    {
      key: 'MAX_WALLETS_PER_IP_24H',
      category: 'DEVICE_ABUSE',
      value: '3',
      type: ConfigType.NUMBER,
      description: 'Maximum number of wallets allowed per IP address in 24 hours',
    },

    // Spray Anomaly Detection
    {
      key: 'ANOMALY_TIME_WINDOW_HOURS',
      category: 'ANOMALY',
      value: '24',
      type: ConfigType.NUMBER,
      description: 'Time window in hours for anomaly detection',
    },
    {
      key: 'ANOMALY_REPEATED_RECIPIENT_THRESHOLD',
      category: 'ANOMALY',
      value: '5',
      type: ConfigType.NUMBER,
      description: 'Threshold for detecting repeated recipient transfers',
    },
    {
      key: 'ANOMALY_SMURFING_TOTAL_THRESHOLD',
      category: 'ANOMALY',
      value: '100000',
      type: ConfigType.DECIMAL,
      description: 'Total amount threshold for smurfing detection',
    },
    {
      key: 'ANOMALY_SMURFING_COUNT_THRESHOLD',
      category: 'ANOMALY',
      value: '10',
      type: ConfigType.NUMBER,
      description: 'Count threshold for smurfing detection',
    },
    {
      key: 'ANOMALY_SMURFING_AVG_PERCENT_THRESHOLD',
      category: 'ANOMALY',
      value: '0.10',
      type: ConfigType.DECIMAL,
      description: 'Average percentage threshold for smurfing detection',
    },

    // Event Configuration
    {
      key: 'EVENT_DEFAULT_DURATION_HOURS',
      category: 'EVENT',
      value: '24',
      type: ConfigType.NUMBER,
      description: 'Default duration in hours for events without an end date',
    },

    // Admin Notifications
    {
      key: 'ADMIN_NOTIFICATION_TYPES_ENABLED',
      category: 'NOTIFICATIONS',
      value: JSON.stringify({
        NEW_USER: true,
        WITHDRAWAL: true,
        TIER_UPGRADE: true,
        INFLOW: true,
        EVENT_DELETED: true,
      }),
      type: ConfigType.JSON,
      description: 'Enabled admin dashboard notification types',
    },
  ];

  for (const config of configs) {
    try {
      // Check if config already exists
      const existing = await prisma.systemConfig.findUnique({
        where: { key: config.key },
      });

      if (existing) {
        // Config exists - only update description if it's different, but preserve the value
        // This ensures admin portal changes are not overwritten
        if (existing.description !== config.description) {
          await prisma.systemConfig.update({
            where: { key: config.key },
            data: {
              description: config.description,
              // Don't update value - preserve admin changes
              // Don't update isActive - preserve current state
            },
          });
          console.log(`✓ Updated description for: ${config.key}`);
        } else {
          console.log(`○ Skipped (exists): ${config.key}`);
        }
      } else {
        // Config doesn't exist - create it with default values
        await prisma.systemConfig.create({
          data: {
            ...config,
            isActive: true,
          },
        });
        console.log(`✓ Created: ${config.key}`);
      }
    } catch (error) {
      console.error(`✗ Failed to seed ${config.key}:`, error);
    }
  }

  console.log('System configuration seeding completed!');
}

seedConfig()
  .catch((error) => {
    console.error('Error seeding configuration:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

