import { XPublishConfig, XPublishResult, XTokenStore, PublishLogEntry } from './x-validator';
import { XClient } from './x-client';
import { QueueValidator } from '../queue/queue-validator';
import { DateTime } from 'luxon';
import type { QueueItem } from '../queue/queue-validator';

export interface DryRunResult {
  queued: boolean;
  simulated: boolean;
  validation: { valid: boolean; issues: string[] };
  logEntry: PublishLogEntry | null;
  error?: string;
}

export class XPublisher {
  private client: XClient;
  private config: XPublishConfig;
  private tokenStore: XTokenStore;

  constructor(config: XPublishConfig, tokenStore: XTokenStore) {
    this.config = config;
    this.tokenStore = tokenStore;
    this.client = new XClient(config);
  }

  async dryRunPublish(queueItem: QueueItem): Promise<DryRunResult> {
    if (queueItem.status !== 'queued') {
      return {
        queued: false,
        simulated: false,
        validation: { valid: false, issues: ['Queue item is not in queued status'] },
        logEntry: null,
        error: 'Queue item is not in queued status',
      };
    }

    const now = DateTime.now().setZone('Africa/Lagos');
    const scheduledUtc = DateTime.fromISO(queueItem.scheduledForUtc, { zone: 'utc' });
    const isDue = scheduledUtc.toMillis() <= now.toMillis();

    const textValidation = this.validateXText(queueItem.text);
    const lengthOk = queueItem.text.length <= 280;

    const issues = [...textValidation.issues];
    if (!lengthOk) issues.push('characterCount exceeds 280');

    const valid = issues.length === 0;

    const logEntry: PublishLogEntry = {
      id: 'publish-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      queueItemId: queueItem.id,
      generatedPostId: queueItem.generatedPostId,
      mode: 'dry_run',
      text: queueItem.text,
      scheduledForUtc: queueItem.scheduledForUtc,
      attemptedAt: new Date().toISOString(),
      status: 'simulated',
      xPostId: null,
      httpStatus: null,
      errorCode: null,
      sanitizedError: null,
    };

    return {
      queued: true,
      simulated: isDue && valid,
      validation: { valid, issues },
      logEntry,
      error: !isDue ? 'Post is not yet due' : undefined,
    };
  }

  async livePublish(queueItem: QueueItem): Promise<XPublishResult & { logEntry: PublishLogEntry }> {
    if (!this.config.publishingEnabled || this.config.dryRun) {
      return {
        success: false,
        httpStatus: 403,
        errorCode: 'publishing_disabled',
        sanitizedError: 'Live publishing is disabled.',
        logEntry: {
          id: 'publish-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
          queueItemId: queueItem.id,
          generatedPostId: queueItem.generatedPostId,
          mode: 'live',
          text: queueItem.text,
          scheduledForUtc: queueItem.scheduledForUtc,
          attemptedAt: new Date().toISOString(),
          status: 'failed',
          xPostId: null,
          httpStatus: 403,
          errorCode: 'publishing_disabled',
          sanitizedError: 'Live publishing is disabled.',
        },
      };
    }

    const textValidation = this.validateXText(queueItem.text);
    if (!textValidation.valid) {
      return {
        success: false,
        httpStatus: 422,
        errorCode: 'validation_failed',
        sanitizedError: 'Text validation failed: ' + textValidation.issues.join(', '),
        logEntry: {
          id: 'publish-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
          queueItemId: queueItem.id,
          generatedPostId: queueItem.generatedPostId,
          mode: 'live',
          text: queueItem.text,
          scheduledForUtc: queueItem.scheduledForUtc,
          attemptedAt: new Date().toISOString(),
          status: 'failed',
          xPostId: null,
          httpStatus: 422,
          errorCode: 'validation_failed',
          sanitizedError: 'Text validation failed: ' + textValidation.issues.join(', '),
        },
      };
    }

    const result = await this.client.publishTweet(queueItem.text, this.tokenStore);
    const logEntry: PublishLogEntry = {
      id: 'publish-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      queueItemId: queueItem.id,
      generatedPostId: queueItem.generatedPostId,
      mode: 'live',
      text: queueItem.text,
      scheduledForUtc: queueItem.scheduledForUtc,
      attemptedAt: new Date().toISOString(),
      status: result.success ? 'published' : 'failed',
      xPostId: result.xPostId || null,
      httpStatus: result.httpStatus || null,
      errorCode: result.errorCode || null,
      sanitizedError: result.sanitizedError || null,
    };

    return { ...result, logEntry };
  }

  private validateXText(text: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const normalized = text.trim();

    if (!normalized) {
      issues.push('Empty text');
      return { valid: false, issues };
    }

    if (normalized.length > 280) {
      issues.push('Text exceeds 280 characters (' + normalized.length + ')');
    }

    const urlCount = (normalized.match(/https?:\/\//g) || []).length;
    if (urlCount > 1) {
      issues.push('Too many URLs');
    }

    const mentionCount = (normalized.match(/@/g) || []).length;
    if (mentionCount > 3) {
      issues.push('Too many mentions');
    }

    const hashtagCount = (normalized.match(/#/g) || []).length;
    if (hashtagCount > 3) {
      issues.push('Too many hashtags');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
