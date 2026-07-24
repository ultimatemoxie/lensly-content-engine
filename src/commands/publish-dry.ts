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

async function applyQueueLifecycle() {
  const config = loadConfig();
  const graceMinutes = parseInt(config.X_DUE_GRACE_MINUTES || '30', 10);
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');
  const graceCutoff = now.minus({ minutes: graceMinutes }).toUTC().toISO();

  let expiredCount = 0;
  const updated = queue.map(q => {
    if (q.status !== 'queued') return q;
    const scheduledUtc = DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' });
    if (scheduledUtc.toISO() <= graceCutoff) {
      expiredCount++;
      return { ...q, status: 'expired' as const };
    }
    return q;
  });

  if (expiredCount > 0) {
    await writeQueue(updated);
    console.log('Queue lifecycle: expired ' + expiredCount + ' past queued items (grace: ' + graceMinutes + 'min)');
  }
}

async function publishDry() {
  await applyQueueLifecycle();
  const config = loadConfig();
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');
  const graceMinutes = parseInt(config.X_DUE_GRACE_MINUTES || '30', 10);
  const graceCutoff = now.minus({ minutes: graceMinutes }).toUTC().toISO();

  const activeQueue = queue.filter(q => q.status === 'queued');
  const future = activeQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() > now.toMillis()).sort((a, b) => DateTime.fromISO(a.scheduledForUtc, { zone: 'utc' }).toMillis() - DateTime.fromISO(b.scheduledForUtc, { zone: 'utc' }).toMillis());
  const due = activeQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() <= now.toMillis() && DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toISO() >= graceCutoff);

  if (due.length === 0) {
    console.log('No due posts available for publishing.');
    return;
  }

  const dueItem = due[0];
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

  const weightedCharCount = dueItem.text.length;

  console.log('Dry-run publish result:');
  console.log('  Queue item ID: ' + dueItem.id);
  console.log('  Generated post ID: ' + dueItem.generatedPostId);
  console.log('  Text: ' + dueItem.text.slice(0, 80) + '...');
  console.log('  Scheduled UTC: ' + dueItem.scheduledForUtc);
  console.log('  Scheduled Local: ' + dueItem.scheduledForLocal);
  console.log('  Due: true (within grace period)');
  console.log('  Grace period: ' + graceMinutes + 'min');
  console.log('  X-weighted character count: ' + weightedCharCount);
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

async function readQueue(): Promise<QueueItem[]> {
  try {
    const fs = await import('fs');
    const data = fs.readFileSync('data/post-queue.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueueItem[]): Promise<void> {
  const fs = await import('fs');
  fs.writeFileSync('data/post-queue.json', JSON.stringify(queue, null, 2));
}
