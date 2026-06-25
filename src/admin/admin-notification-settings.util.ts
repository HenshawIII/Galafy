export type AdminNotificationType = 'NEW_USER' | 'WITHDRAWAL' | 'TIER_UPGRADE' | 'INFLOW' | 'EVENT_DELETED';

export const ADMIN_NOTIFICATION_TYPES_CONFIG_KEY = 'ADMIN_NOTIFICATION_TYPES_ENABLED';

export const DEFAULT_ADMIN_NOTIFICATION_TYPES: Record<AdminNotificationType, boolean> = {
  NEW_USER: true,
  WITHDRAWAL: true,
  TIER_UPGRADE: true,
  INFLOW: true,
  EVENT_DELETED: true,
};

export function parseNotificationTypeSettings(value: string | undefined | null): Record<string, boolean> {
  if (!value) {
    return { ...DEFAULT_ADMIN_NOTIFICATION_TYPES };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, boolean>;
    return {
      ...DEFAULT_ADMIN_NOTIFICATION_TYPES,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_ADMIN_NOTIFICATION_TYPES };
  }
}

export function serializeNotificationTypeSettings(settings: Record<string, boolean>): string {
  return JSON.stringify(settings);
}
