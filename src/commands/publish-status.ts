import { loadConfig } from '../config';
import { publishLogStorage } from '../storage';
import { QueueValidator, QueueItem } from '../queue/queue-validator';
import { DateTime } from 'luxon';

async function publishStatus() {
  const config = loadConfig();
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');

  const activeQueue = queue.filter(q => q.status === 'queued');
  const future = activeQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() > now.toMillis()).sort((a, b) => DateTime.fromISO(a.scheduledForUtc, { zone: 'utc' }).toMillis() - DateTime.fromISO(b.scheduledForUtc, { zone: 'utc' }).toMillis());
  const due = future.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() <= now.toMillis());
  const expired = queue.filter(q => q.status === 'expired');
  const simulated = queue.filter(q => q.status === 'published');
  const published = queue.filter(q => q.status === 'published');
  const failed = queue.filter(q => q.status === 'failed');

  console.log('Publish Status');
  console.log('==============');
  console.log('Publishing enabled: ' + (config.X_PUBLISHING_ENABLED === 'true'));
  console.log('Dry-run mode: ' + (config.X_DRY_RUN !== 'false'));
  console.log('Max posts per run: ' + (config.MAX_POSTS_PER_RUN || '1'));
  console.log('Queued future posts: ' + future.length);
  console.log('Due posts: ' + due.length);
  console.log('Expired posts: ' + expired.length);
  console.log('Simulated posts: ' + simulated.length);
  console.log('Published posts: ' + published.length);
  console.log('Failed posts: ' + failed.length);

  const logs = await publishLogStorage.readAll();
  if (logs.length > 0) {
    const last = logs[logs.length - 1];
    console.log('Last publication attempt: ' + last.attemptedAt + ' (' + last.status + ')');
  } else {
    console.log('Last publication attempt: none');
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

publishStatus().catch((err) => {
  console.error(err);
  process.exit(1);
});
