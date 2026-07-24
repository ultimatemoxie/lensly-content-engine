import { loadConfig } from '../config';
import { publishLogStorage } from '../storage';
import { QueueValidator, QueueItem } from '../queue/queue-validator';
import { XPublisher } from '../x/x-publisher';
import { XTokenStore, PublishLogEntry } from '../x/x-validator';
import { DateTime } from 'luxon';

class InMemoryTokenStore implements XTokenStore {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: Date | null = null;

  getAccessToken(): string | null { return this.accessToken; }
  getRefreshToken(): string | null { return this.refreshToken; }
  getExpiresAt(): Date | null { return this.expiresAt; }
  setTokens(accessToken: string, refreshToken: string | null, expiresAt: Date | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresAt = expiresAt;
  }
  clear(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
  }
}

async function readQueue(): Promise<QueueItem[]> {
  try {
    const fs = await import('fs');
    const data = fs.readFileSync('data/post-queue.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function publishDry() {
  const config = loadConfig();
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');

  const activeQueue = queue.filter(q => q.status === 'queued');
  const future = activeQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() > now.toMillis()).sort((a, b) => DateTime.fromISO(a.scheduledForUtc, { zone: 'utc' }).toMillis() - DateTime.fromISO(b.scheduledForUtc, { zone: 'utc' }).toMillis());

  if (future.length === 0) {
    console.log('No due posts available for publishing.');
    return;
  }

  const dueItem = future[0];
  const isDue = DateTime.fromISO(dueItem.scheduledForUtc, { zone: 'utc' }).toMillis() <= now.toMillis();

  if (!isDue) {
    console.log('No due posts available for publishing.');
    return;
  }

  const tokenStore = new InMemoryTokenStore();
  const xConfig = {
    publishingEnabled: config.X_PUBLISHING_ENABLED === 'true',
    dryRun: config.X_DRY_RUN !== 'false',
    maxPostsPerRun: parseInt(config.MAX_POSTS_PER_RUN || '1', 10),
    auth: { mode: (config.X_AUTH_MODE as 'oauth1' | 'oauth2') || 'oauth2' },
  };

  const publisher = new XPublisher(xConfig, tokenStore);
  const result = await publisher.dryRunPublish(dueItem);

  if (result.logEntry) {
    await publishLogStorage.append(result.logEntry);
  }

  console.log('Dry-run publish result:');
  console.log('  Queue item ID: ' + dueItem.id);
  console.log('  Text: ' + dueItem.text.slice(0, 80) + '...');
  console.log('  Due: ' + isDue);
  console.log('  Validation: ' + (result.validation.valid ? 'passed' : 'failed - ' + result.validation.issues.join(', ')));
  console.log('  Simulated: ' + result.simulated);
  console.log('  Mode: dry_run');
  console.log('  X network requests made: 0');
  console.log('  Log entry saved: ' + (result.logEntry ? 'yes' : 'no'));

  if (!result.simulated && result.error) {
    console.log('  Reason: ' + result.error);
  }
}

publishDry().catch((err) => {
  console.error(err);
  process.exit(1);
});
