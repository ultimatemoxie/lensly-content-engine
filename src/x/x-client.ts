import { XPublishConfig, XPublishResult, XTokenStore } from './x-validator';

export class XClient {
  private config: XPublishConfig;

  constructor(config: XPublishConfig) {
    this.config = config;
  }

  async publishTweet(text: string, tokenStore: XTokenStore): Promise<XPublishResult> {
    if (this.config.dryRun) {
      return {
        success: true,
        httpStatus: undefined,
        errorCode: undefined,
        sanitizedError: undefined,
        xPostId: undefined,
      };
    }

    if (!this.config.publishingEnabled) {
      return {
        success: false,
        httpStatus: 403,
        errorCode: 'publishing_disabled',
        sanitizedError: 'X publishing is disabled. Set X_PUBLISHING_ENABLED=true to enable.',
      };
    }

    if (!tokenStore.getAccessToken()) {
      return {
        success: false,
        httpStatus: 401,
        errorCode: 'missing_access_token',
        sanitizedError: 'Access token is missing. Reauthorization required.',
      };
    }

    const expiresAt = tokenStore.getExpiresAt();
    if (expiresAt && expiresAt < new Date()) {
      return {
        success: false,
        httpStatus: 401,
        errorCode: 'token_expired',
        sanitizedError: 'Access token has expired. Refresh token or reauthorize.',
      };
    }

    try {
      const response = await fetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenStore.getAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (response.status === 429) {
        return {
          success: false,
          httpStatus: 429,
          errorCode: 'rate_limited',
          sanitizedError: 'Rate limited. Retry after backoff.',
        };
      }

      if (!response.ok) {
        const text = await response.text();
        let errorCode = 'unknown_error';
        if (response.status === 401) errorCode = 'unauthorized';
        else if (response.status === 403) errorCode = 'forbidden';
        else if (response.status === 404) errorCode = 'not_found';
        else if (response.status === 413) errorCode = 'text_too_long';
        else if (response.status >= 500) errorCode = 'server_error';

        return {
          success: false,
          httpStatus: response.status,
          errorCode,
          sanitizedError: 'HTTP ' + response.status + ': ' + text.slice(0, 200),
        };
      }

      const data = await response.json() as any;
      const xPostId = data.data?.id || null;

      return {
        success: true,
        httpStatus: response.status,
        xPostId,
      };
    } catch (error) {
      return {
        success: false,
        httpStatus: undefined,
        errorCode: 'network_error',
        sanitizedError: error instanceof Error ? error.message : 'Unknown network error',
      };
    }
  }
}
