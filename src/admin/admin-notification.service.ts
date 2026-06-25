import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

import type { Prisma } from '../../generated/prisma/client.js';

import {
  ADMIN_NOTIFICATION_TYPES_CONFIG_KEY,
  DEFAULT_ADMIN_NOTIFICATION_TYPES,
  parseNotificationTypeSettings,
  type AdminNotificationType,
} from './admin-notification-settings.util.js';

export type { AdminNotificationType };



export interface NotifyAdminsPayload {

  type: AdminNotificationType;

  title: string;

  message: string;

  data?: Record<string, unknown>;

}



@Injectable()

export class AdminNotificationService {

  private readonly logger = new Logger(AdminNotificationService.name);



  constructor(private readonly databaseService: DatabaseService) {}



  private async isNotificationTypeEnabled(type: AdminNotificationType): Promise<boolean> {

    try {

      const config = await this.databaseService.systemConfig.findUnique({

        where: { key: ADMIN_NOTIFICATION_TYPES_CONFIG_KEY },

        select: { value: true, isActive: true },

      });



      if (!config || !config.isActive) {

        return DEFAULT_ADMIN_NOTIFICATION_TYPES[type] ?? true;

      }



      const settings = parseNotificationTypeSettings(config.value);

      return settings[type] ?? true;

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Failed to read notification settings, defaulting to enabled: ${message}`);

      return true;

    }

  }



  async notifyAdmins(payload: NotifyAdminsPayload): Promise<void> {

    const enabled = await this.isNotificationTypeEnabled(payload.type);

    if (!enabled) {

      this.logger.debug(`Skipping admin notification (disabled): ${payload.type}`);

      return;

    }



    try {

      await this.databaseService.adminNotification.create({

        data: {

          type: payload.type,

          title: payload.title,

          message: payload.message,

          data: (payload.data ?? undefined) as Prisma.InputJsonValue | undefined,

          read: false,

        },

      });

    } catch (error: unknown) {

      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`Failed to create admin notification: ${message}`);

    }

  }



  async notifyNewUser(user: { id: string; email: string; firstName?: string | null; lastName?: string | null }) {

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

    await this.notifyAdmins({

      type: 'NEW_USER',

      title: 'New user registered',

      message: `${name} (${user.email}) has joined Galafy.`,

      data: { userId: user.id, email: user.email },

    });

  }



  async notifyWithdrawal(payload: {

    payoutId: string;

    userId: string;

    amount: string;

    status: string;

    email?: string;

  }) {

    await this.notifyAdmins({

      type: 'WITHDRAWAL',

      title: `Withdrawal ${payload.status.toLowerCase()}`,

      message: `Withdrawal of ₦${payload.amount} ${payload.status.toLowerCase()}${payload.email ? ` for ${payload.email}` : ''}.`,

      data: payload,

    });

  }



  async notifyTierUpgrade(payload: {

    customerId: string;

    userId: string;

    tier: string;

    status: string;

    email?: string;

  }) {

    await this.notifyAdmins({

      type: 'TIER_UPGRADE',

      title: 'Tier upgrade pending review',

      message: `${payload.email ?? 'User'} submitted ${payload.tier} address verification and awaits admin approval.`,

      data: payload,

    });

  }



  async notifyInflow(payload: {

    transactionId: string;

    userId?: string;

    amount: string;

    email?: string;

  }) {

    await this.notifyAdmins({

      type: 'INFLOW',

      title: 'Inflow received',

      message: `₦${payload.amount} inflow${payload.email ? ` from ${payload.email}` : ''}.`,

      data: payload,

    });

  }

}


