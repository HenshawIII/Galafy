import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AccountRestrictionKind } from '../utils/account-restriction-email-copy.util.js';
import { EmailService } from '../../users/email.service.js';

export type { AccountRestrictionKind };

@Injectable()
export class AccountRestrictionNotifyService {
  private readonly logger = new Logger(AccountRestrictionNotifyService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emailService: EmailService,
  ) {}

  async notifyUserById(
    userId: string,
    kind: AccountRestrictionKind,
    restrictionReason?: string,
  ): Promise<void> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        isVerified: true,
        firstName: true,
        lastName: true,
        username: true,
      },
    });

    if (!user?.isVerified || !user.email) {
      return;
    }

    try {
      await this.emailService.sendAccountRestrictionEmail(
        user.email,
        {
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
        },
        restrictionReason,
        kind,
      );
      this.logger.log(`Account restriction email (${kind}) sent to ${user.email}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send restriction email (${kind}) to ${user.email}: ${message}`);
    }
  }

  async notifyCustomerById(
    customerId: string,
    kind: AccountRestrictionKind,
    restrictionReason?: string,
  ): Promise<void> {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      select: { userId: true },
    });

    if (!customer?.userId) {
      return;
    }

    await this.notifyUserById(customer.userId, kind, restrictionReason);
  }
}
