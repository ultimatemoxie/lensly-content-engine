export interface XTokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  getExpiresAt(): Date | null;
  setTokens(accessToken: string, refreshToken: string | null, expiresAt: Date | null): void;
  clear(): void;
}

export interface XAuthConfig {
  mode: 'oauth1' | 'oauth2';
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenSecret?: string;
  expiresAt?: Date;
}

export interface XPublishConfig {
  publishingEnabled: boolean;
  dryRun: boolean;
  maxPostsPerRun: number;
  auth: XAuthConfig;
}

export interface XPublishResult {
  success: boolean;
  httpStatus?: number;
  errorCode?: string;
  sanitizedError?: string;
  xPostId?: string;
}

export interface PublishLogEntry {
  id: string;
  queueItemId: string;
  generatedPostId: string;
  mode: 'dry_run' | 'live';
  text: string;
  scheduledForUtc: string;
  attemptedAt: string;
  status: 'simulated' | 'published' | 'failed';
  xPostId: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  sanitizedError: string | null;
}
