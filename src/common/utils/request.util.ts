import { Request } from 'express';

/**
 * Extract IP address from request, handling proxies and load balancers
 */
export function extractIpAddress(req: Request): string | undefined {
  // Check for forwarded IP (from proxies/load balancers)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }

  // Check for real IP header (common in some proxy setups)
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback to connection remote address
  return req.socket?.remoteAddress || req.ip || undefined;
}

/**
 * Extract User-Agent from request
 */
export function extractUserAgent(req: Request): string | undefined {
  return req.headers['user-agent'] || undefined;
}

/**
 * Extract device information from request headers and body
 */
export function extractDeviceInfo(req: Request, body?: any): {
  ipAddress?: string;
  userAgent?: string;
  deviceToken?: string;
  browserFingerprint?: string;
  os?: string;
  browser?: string;
} {
  return {
    ipAddress: extractIpAddress(req),
    userAgent: extractUserAgent(req),
    deviceToken: body?.deviceToken,
    browserFingerprint: body?.browserFingerprint,
    os: body?.os,
    browser: body?.browser,
  };
}

