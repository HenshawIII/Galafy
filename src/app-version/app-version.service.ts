import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

const DEFAULT_IOS_APP_STORE_ID = '6755791850';
const ITUNES_LOOKUP_TTL_MS = 15 * 60 * 1000;

type ItunesLookupResponse = {
  resultCount?: number;
  results?: Array<{ version?: string }>;
};

type CachedLatestVersion = {
  version: string;
  expiresAt: number;
};

@Injectable()
export class AppVersionService {
  private readonly logger = new Logger(AppVersionService.name);
  private cachedLatest: CachedLatestVersion | null = null;

  async checkIosVersion(clientVersion: string): Promise<{
    clientVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
  }> {
    const latestVersion = await this.fetchLatestIosVersion();
    const updateAvailable = this.compareVersions(latestVersion, clientVersion) > 0;

    return {
      clientVersion,
      latestVersion,
      updateAvailable,
    };
  }

  private getAppStoreId(): string {
    return process.env.IOS_APP_STORE_ID?.trim() || DEFAULT_IOS_APP_STORE_ID;
  }

  private async fetchLatestIosVersion(): Promise<string> {
    const now = Date.now();
    if (this.cachedLatest && this.cachedLatest.expiresAt > now) {
      return this.cachedLatest.version;
    }

    const appId = this.getAppStoreId();
    const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json, text/javascript, text/plain, */*' },
      });
    } catch (error: any) {
      this.logger.error(`iTunes lookup request failed: ${error?.message || error}`);
      throw new BadGatewayException('Unable to reach the App Store version service');
    }

    if (!response.ok) {
      this.logger.error(`iTunes lookup returned HTTP ${response.status}`);
      throw new BadGatewayException('Unable to fetch the App Store version');
    }

    const bodyText = await response.text();
    let payload: ItunesLookupResponse;
    try {
      payload = JSON.parse(bodyText) as ItunesLookupResponse;
    } catch {
      this.logger.error('iTunes lookup returned non-JSON body');
      throw new BadGatewayException('Invalid response from the App Store version service');
    }

    const latestVersion = payload.results?.[0]?.version?.trim();
    if (!latestVersion) {
      this.logger.error('iTunes lookup returned no version in results');
      throw new BadGatewayException('App Store version information is unavailable');
    }

    this.cachedLatest = {
      version: latestVersion,
      expiresAt: now + ITUNES_LOOKUP_TTL_MS,
    };

    return latestVersion;
  }

  /**
   * Compare semver-ish version strings (e.g. 1.0.6 vs 1.0.5).
   * Returns >0 if a > b, <0 if a < b, 0 if equal.
   */
  compareVersions(a: string, b: string): number {
    const aParts = this.parseVersionParts(a);
    const bParts = this.parseVersionParts(b);
    const length = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < length; i++) {
      const left = aParts[i] ?? 0;
      const right = bParts[i] ?? 0;
      if (left > right) return 1;
      if (left < right) return -1;
    }
    return 0;
  }

  private parseVersionParts(version: string): number[] {
    return version
      .split('.')
      .map((part) => {
        const match = part.match(/^\d+/);
        return match ? Number.parseInt(match[0], 10) : 0;
      });
  }
}
