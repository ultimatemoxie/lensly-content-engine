import { loadConfig } from '../config';
import { publishLogStorage } from '../storage';
import { QueueItem } from '../queue/queue-validator';
import { DateTime } from 'luxon';

async function applyQueueLifecycle() {
  const config = loadConfig();
  const graceMinutes = parseInt(config.X_DUE_GRACE_MINUTES || '30', 10);
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');
  const graceCutoff = now.minus({ minutes: graceMinutes }).toUTC().toISO()!;

  let expiredCount = 0;
  const updated = queue.map(q => {
    if (q.status !== 'queued') return q;
    const scheduledUtc = DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' });
    if (scheduledUtc.toISO()! <= graceCutoff) {
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

async function publishStatus() {
  await applyQueueLifecycle();
  const config = loadConfig();
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');
  const graceMinutes = parseInt(config.X_DUE_GRACE_MINUTES || '30', 10);
  const graceCutoff = now.minus({ minutes: graceMinutes }).toUTC().toISO()!;

  const futureQueue = queue.filter(q => q.status === 'queued' && DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis()! > now.toMillis());
  const dueQueue = queue.filter(q => q.status === 'queued' && DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis()! <= now.toMillis() && DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toISO()! >= graceCutoff);
  const expiredQueue = queue.filter(q => q.status === 'expired');
  const publishedQueue = queue.filter(q => q.status === 'published');
  const failedQueue = queue.filter(q => q.status === 'failed');
  const cancelledQueue = queue.filter(q => q.status === 'cancelled');

  console.log('Publish Status');
  console.log('==============');
  console.log('Publishing enabled: ' + (config.X_PUBLISHING_ENABLED === 'true'));
  console.log('Dry-run mode: ' + (config.X_DRY_RUN !== 'false'));
  console.log('Max posts per run: ' + (config.MAX_POSTS_PER_RUN || '1'));
  console.log('Due grace period: ' + graceMinutes + 'min');
  console.log('Queued future posts: ' + futureQueue.length);
  console.log('Due posts (within grace): ' + dueQueue.length);
  console.log('Expired posts: ' + expiredQueue.length);
  console.log('Published posts: ' + publishedQueue.length);
  console.log('Failed posts: ' + failedQueue.length);
  console.log('Cancelled posts: ' + cancelledQueue.length);

  const logs = await publishLogStorage.readAll();
  if (logs.length > 0) {
    const last = logs[logs.length - 1];
    console.log('Last publication attempt: ' + last.attemptedAt + ' (' + last.status + ')');
  } else {
    console.log('Last publication attempt: none');
  }
}

publishStatus().catch((err) => {
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
