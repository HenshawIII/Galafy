/**
 * Timezone utility functions for WAT (West Africa Time, UTC+1)
 * Nigeria uses Africa/Lagos timezone
 */

export const WAT_TIMEZONE = 'Africa/Lagos';
export const WAT_UTC_OFFSET_HOURS = 1; // WAT is UTC+1

/**
 * Get current time in WAT
 * Returns a Date object representing the current time in WAT timezone
 * Note: Date objects are always UTC internally, this returns UTC time
 * that represents the current WAT moment
 */
export function getCurrentWATTime(): Date {
  // Get current UTC time
  const now = new Date();
  
  // Get the WAT time components
  const watParts = new Intl.DateTimeFormat('en-US', {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  
  // Extract parts
  const year = parseInt(watParts.find(p => p.type === 'year')!.value);
  const month = parseInt(watParts.find(p => p.type === 'month')!.value) - 1; // JS months are 0-indexed
  const day = parseInt(watParts.find(p => p.type === 'day')!.value);
  const hour = parseInt(watParts.find(p => p.type === 'hour')!.value);
  const minute = parseInt(watParts.find(p => p.type === 'minute')!.value);
  const second = parseInt(watParts.find(p => p.type === 'second')!.value);
  
  // Create a date object representing this WAT time as if it were UTC
  // This allows us to compare with dates stored in UTC
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

/**
 * Parse a date string assuming it's in WAT if no timezone is specified
 * If the string has timezone info (Z, +, -), it will be parsed as-is
 * Otherwise, it's assumed to be in WAT and converted to UTC for storage
 * 
 * Examples:
 * - "2025-12-25T18:00:00" -> interpreted as 18:00 WAT, stored as 17:00 UTC
 * - "2025-12-25T18:00:00Z" -> interpreted as 18:00 UTC, stored as 18:00 UTC
 * - "2025-12-25T18:00:00+01:00" -> interpreted as 18:00 UTC+1, stored as 17:00 UTC
 */
export function parseWATDate(dateString: string): Date {
  // Trim whitespace
  const trimmed = dateString.trim();
  
  // If date string has explicit timezone info (Z or +/-offset), parse it as-is
  if (trimmed.includes('Z') || trimmed.match(/[+-]\d{2}:?\d{2}$/)) {
    // Has timezone, parse as-is (will be stored in UTC)
    return new Date(trimmed);
  }
  
  // No timezone info - assume it's WAT time
  // Parse the date string manually to extract components
  let year: number, month: number, day: number, hour: number, minute: number, second: number;
  
  if (!trimmed.includes('T')) {
    // Date only format (YYYY-MM-DD), assume midnight WAT
    const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD or ISO 8601 format.`);
    }
    year = parseInt(dateMatch[1]);
    month = parseInt(dateMatch[2]) - 1; // JS months are 0-indexed
    day = parseInt(dateMatch[3]);
    hour = 0;
    minute = 0;
    second = 0;
  } else {
    // Has time component - parse ISO format
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!isoMatch) {
      throw new Error(`Invalid date format: ${dateString}. Expected ISO 8601 format.`);
    }
    year = parseInt(isoMatch[1]);
    month = parseInt(isoMatch[2]) - 1; // JS months are 0-indexed
    day = parseInt(isoMatch[3]);
    hour = parseInt(isoMatch[4]);
    minute = parseInt(isoMatch[5]);
    second = isoMatch[6] ? parseInt(isoMatch[6]) : 0;
  }
  
  // Validate components
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
    throw new Error(`Invalid date components in: ${dateString}`);
  }
  
  // Create a date object representing this WAT time
  // We interpret the input as WAT, so we create a UTC date that represents that WAT moment
  // WAT is UTC+1, so to store 18:00 WAT, we store 17:00 UTC
  // Create a date in UTC that represents the WAT time
  const utcDate = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  // Now convert this UTC date to WAT to verify, then adjust back
  // Actually, we need to think about this differently:
  // If user says "18:00 WAT", that's 17:00 UTC
  // So we need to subtract 1 hour from the UTC representation
  return new Date(utcDate.getTime() - (WAT_UTC_OFFSET_HOURS * 60 * 60 * 1000));
}

/**
 * Format a Date object for display in WAT timezone
 * Returns a formatted string in WAT
 */
export function formatWATDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  
  return date.toLocaleString('en-US', { ...defaultOptions, ...options });
}

/**
 * Get WAT time as ISO string
 * Returns ISO string representing the time in WAT
 * 
 * Note: If the date is already a WAT comparison date (from getWATDateForComparison),
 * it should be formatted directly. Otherwise, it formats the UTC date in WAT timezone.
 */
export function getWATISOString(date: Date): string {
  // Get the WAT time components from the date
  // This handles both UTC dates and WAT comparison dates correctly
  const watParts = new Intl.DateTimeFormat('en-US', {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  
  // Extract parts
  const year = watParts.find(p => p.type === 'year')!.value;
  const month = watParts.find(p => p.type === 'month')!.value.padStart(2, '0');
  const day = watParts.find(p => p.type === 'day')!.value.padStart(2, '0');
  const hour = watParts.find(p => p.type === 'hour')!.value.padStart(2, '0');
  const minute = watParts.find(p => p.type === 'minute')!.value.padStart(2, '0');
  const second = watParts.find(p => p.type === 'second')!.value.padStart(2, '0');
  
  // Format as ISO string with WAT offset
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+01:00`;
}

/**
 * Convert a UTC Date to WAT Date for comparison purposes
 * This is useful when comparing dates stored in UTC with WAT times
 * Returns a Date object representing the WAT time equivalent
 */
export function convertUTCToWAT(utcDate: Date): Date {
  // Get the WAT time components
  const watParts = new Intl.DateTimeFormat('en-US', {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);
  
  // Extract parts
  const year = parseInt(watParts.find(p => p.type === 'year')!.value);
  const month = parseInt(watParts.find(p => p.type === 'month')!.value) - 1; // JS months are 0-indexed
  const day = parseInt(watParts.find(p => p.type === 'day')!.value);
  const hour = parseInt(watParts.find(p => p.type === 'hour')!.value);
  const minute = parseInt(watParts.find(p => p.type === 'minute')!.value);
  const second = parseInt(watParts.find(p => p.type === 'second')!.value);
  
  // Create a date object representing this WAT time as if it were UTC
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

/**
 * Get current WAT time as Date object for database comparisons
 * This ensures comparisons are done in WAT context
 * Returns a Date object that represents current WAT time
 */
export function getWATDateForComparison(): Date {
  return getCurrentWATTime();
}

