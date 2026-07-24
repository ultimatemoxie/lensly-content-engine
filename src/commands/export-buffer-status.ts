import { loadConfig } from '../config';
import { QueueItem } from '../queue/queue-validator';
import { DateTime } from 'luxon';

async function readQueue(): Promise<QueueItem[]> {
  try {
    const fs = await import('fs');
    const data = fs.readFileSync('data/post-queue.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function exportBufferStatus() {
  const config = loadConfig();
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');

  const exported = queue.filter(q => q.bufferExportedAt && q.bufferExportBatchId);
  const exportedNotPast = exported.filter(q => DateTime.fromISO(q.scheduledForLocal).toMillis() > now.toMillis());
  const exportedPast = exported.filter(q => DateTime.fromISO(q.scheduledForLocal).toMillis() <= now.toMillis());

  const batches = new Map<string, QueueItem[]>();
  for (const item of exported) {
    const batchId = item.bufferExportBatchId!;
    if (!batches.has(batchId)) {
      batches.set(batchId, []);
    }
    batches.get(batchId)!.push(item);
  }

  const sortedBatches = Array.from(batches.entries()).sort((a, b) => {
    const aTime = a[1][0]?.bufferExportedAt || '';
    const bTime = b[1][0]?.bufferExportedAt || '';
    return bTime.localeCompare(aTime);
  });

  const activeBatch = sortedBatches.length > 0 ? sortedBatches[0] : null;

  const notYetExported = queue.filter(q => !q.bufferExportedAt && q.status === 'queued' && !q.isTest);

  let stale = false;
  let nextRefillUtc: string | null = null;
  let nextRefillLocal: string | null = null;

  if (activeBatch) {
    const futureInBatch = activeBatch[1].filter(item => DateTime.fromISO(item.scheduledForLocal).toMillis() > now.toMillis());
    if (futureInBatch.length === 0) {
      stale = true;
    } else {
      const sortedFuture = [...futureInBatch].sort((a, b) => {
        const aTime = DateTime.fromISO(a.scheduledForLocal).toMillis();
        const bTime = DateTime.fromISO(b.scheduledForLocal).toMillis();
        return aTime - bTime;
      });
      const refillTime = DateTime.fromISO(sortedFuture[0].scheduledForLocal);
      nextRefillUtc = refillTime.toUTC().toISO()!;
      nextRefillLocal = refillTime.setZone('Africa/Lagos').toFormat('yyyy-MM-dd HH:mm');
    }
  }

  console.log('Buffer Export Status');
  console.log('====================');
  console.log('Active export batch: ' + (activeBatch ? activeBatch[0] : 'none'));
  console.log('Posts exported total: ' + exported.length);
  console.log('Upcoming exported posts: ' + exportedNotPast.length);
  console.log('Past exported posts: ' + exportedPast.length);
  console.log('Next refill UTC: ' + (nextRefillUtc || 'N/A'));
  console.log('Next refill Local: ' + (nextRefillLocal || 'N/A'));
  console.log('Stale batch: ' + stale);
  console.log('Queue items not yet exported: ' + notYetExported.length);
}

exportBufferStatus().catch((err) => {
  console.error(err);
  process.exit(1);
});
