/** Categories exposed to mobile/client config reads (excludes internal RISK, DEVICE_ABUSE, etc.). */
export const CLIENT_VISIBLE_CONFIG_CATEGORIES = new Set(['FEES', 'APP', 'MOBILE', 'SYSTEM', 'EVENT']);

export type ClientConfigItem = {
  key: string;
  category: string;
  value: string;
  type: string;
  description: string | null;
};

export function sanitizeConfigForClient(record: {
  key: string;
  category: string;
  value: string;
  type: string;
  description: string | null;
}): ClientConfigItem {
  return {
    key: record.key,
    category: record.category,
    value: record.value,
    type: record.type,
    description: record.description,
  };
}
