import { loadConfig } from '../config';
import { QueueValidator, QueueItem } from '../queue/queue-validator';
import { DateTime } from 'luxon';

const BATCH_ID = 'batch-' + new Date().toISOString().replace(/[:.]/g, '-');
const MAX_EXPORT = 10;
const EXPORTS_DIR = 'exports';
const CSV_FILE = EXPORTS_DIR + '/buffer-upload.csv';
const COPY_LIST_FILE = EXPORTS_DIR + '/buffer-copy-list.txt';

function getForceFlag(): boolean {
  return process.argv.includes('--force');
}

async function ensureExportsDir() {
  const fs = await import('fs');
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
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

async function writeQueue(queue: QueueItem[]): Promise<void> {
  const fs = await import('fs');
  fs.writeFileSync('data/post-queue.json', JSON.stringify(queue, null, 2));
}

function validateXCharCount(text: string): { valid: boolean; count: number; issues: string[] } {
  const issues: string[] = [];
  const count = text.length;
  if (count > 280) {
    issues.push('Text exceeds 280 characters (' + count + ')');
  }
  return { valid: issues.length === 0, count, issues };
}

function getScheduledParts(scheduledForLocal: string): { date: string; time: string } {
  const dt = DateTime.fromISO(scheduledForLocal);
  return {
    date: dt.toFormat('yyyy-MM-dd'),
    time: dt.toFormat('HH:mm'),
  };
}

function calculateNextRefill(exported: QueueItem[], now: DateTime): { utc: string; local: string; stale: boolean } {
  const futureExported = exported.filter(item => {
    const scheduledLocal = DateTime.fromISO(item.scheduledForLocal);
    return scheduledLocal.toMillis() > now.toMillis();
  });

  if (futureExported.length === 0) {
    return {
      utc: now.toUTC().toISO()!,
      local: now.setZone('Africa/Lagos').toFormat('yyyy-MM-dd HH:mm'),
      stale: true,
    };
  }

  const sortedByScheduled = [...futureExported].sort((a, b) => {
    const aTime = DateTime.fromISO(a.scheduledForLocal).toMillis();
    const bTime = DateTime.fromISO(b.scheduledForLocal).toMillis();
    return aTime - bTime;
  });

  const earliestFuture = DateTime.fromISO(sortedByScheduled[0].scheduledForLocal);
  const refillTime = earliestFuture.toMillis() > now.toMillis()
    ? earliestFuture
    : now.plus({ minutes: 1 });

  return {
    utc: refillTime.toUTC().toISO()!,
    local: refillTime.setZone('Africa/Lagos').toFormat('yyyy-MM-dd HH:mm'),
    stale: false,
  };
}

async function exportBuffer() {
  const force = getForceFlag();
  await ensureExportsDir();
  const config = loadConfig();
  const queue = await readQueue();
  const now = DateTime.now().setZone('Africa/Lagos');

  const excluded: Array<{ item: QueueItem; reason: string }> = [];
  const eligible: QueueItem[] = [];
  const alreadyExported: QueueItem[] = [];

  for (const item of queue) {
    if (item.status === 'expired' || item.status === 'published' || item.status === 'failed' || item.status === 'cancelled') {
      excluded.push({ item, reason: 'status=' + item.status });
      continue;
    }
    if (item.isTest === true) {
      excluded.push({ item, reason: 'is_test' });
      continue;
    }
    if (item.status !== 'queued') {
      excluded.push({ item, reason: 'status=' + item.status });
      continue;
    }
    const scheduledLocal = DateTime.fromISO(item.scheduledForLocal);
    if (scheduledLocal.toMillis() <= now.toMillis()) {
      excluded.push({ item, reason: 'past_due' });
      continue;
    }
    if (item.bufferExportedAt && !force) {
      alreadyExported.push(item);
      excluded.push({ item, reason: 'already_exported' });
      continue;
    }
    const charValidation = validateXCharCount(item.text);
    if (!charValidation.valid) {
      excluded.push({ item, reason: 'character_count_invalid' });
      continue;
    }
    eligible.push(item);
  }

  const toExport = eligible.slice(0, MAX_EXPORT);

  const exported: QueueItem[] = [];
  if (toExport.length > 0) {
    const exportedAtUtc = new Date().toISOString();
    const exportedAtLocal = now.toISO()!;
    const { utc: nextRefillUtc, local: nextRefillLocal, stale } = calculateNextRefill(toExport, now);

    const updatedQueue = queue.map(q => {
      if (toExport.some(te => te.id === q.id)) {
        exported.push(q);
        return {
          ...q,
          bufferExportedAt: exportedAtUtc,
          bufferExportBatchId: BATCH_ID,
          exportCreatedAtUtc: exportedAtUtc,
          exportCreatedAtLocal: exportedAtLocal,
          nextRefillAtUtc: stale ? null : nextRefillUtc,
          nextRefillAtLocal: stale ? null : nextRefillLocal,
        };
      }
      return q;
    });
    await writeQueue(updatedQueue);
  }

  const fs = await import('fs');
  const csvRows: string[] = [];
  csvRows.push('queueItemId,generatedPostId,text,scheduledDate,scheduledTime,timezone,sourceUrl');

  for (const item of exported) {
    const parts = getScheduledParts(item.scheduledForLocal);
    const escapedText = '"' + item.text.replace(/"/g, '""') + '"';
    csvRows.push([
      item.id,
      item.generatedPostId,
      escapedText,
      parts.date,
      parts.time,
      item.timezone,
      item.sourceUrl,
    ].join(','));
  }

  fs.writeFileSync(CSV_FILE, csvRows.join('\n') + '\n', 'utf-8');

  const copyListLines: string[] = [];
  copyListLines.push('Buffer Copy List - Batch: ' + BATCH_ID);
  copyListLines.push('Generated: ' + new Date().toISOString());
  copyListLines.push('Timezone: Africa/Lagos');
  copyListLines.push('');

  for (const item of exported) {
    const parts = getScheduledParts(item.scheduledForLocal);
    copyListLines.push('Post ID: ' + item.id);
    copyListLines.push('Generated Post ID: ' + item.generatedPostId);
    copyListLines.push('Text: ' + item.text);
    copyListLines.push('Scheduled: ' + parts.date + ' at ' + parts.time + ' (' + item.timezone + ')');
    copyListLines.push('Source: ' + item.sourceUrl);
    copyListLines.push('Character count: ' + item.text.length);
    copyListLines.push('---');
  }

  fs.writeFileSync(COPY_LIST_FILE, copyListLines.join('\n') + '\n', 'utf-8');

  const { utc: nextRefillUtc, local: nextRefillLocal, stale } = calculateNextRefill(exported, now);
  const nextRefillDisplay = stale
    ? 'STALE - all exported posts are in the past. Generate a fresh queue.'
    : nextRefillLocal;

  console.log('Buffer Export Report');
  console.log('====================');
  console.log('Eligible queue posts: ' + eligible.length);
  console.log('Exported posts: ' + exported.length);
  console.log('Excluded posts: ' + excluded.length);
  if (excluded.length > 0) {
    console.log('Exclusion reasons:');
    for (const ex of excluded) {
      console.log('  - ' + ex.item.id + ': ' + ex.reason + ' (' + ex.item.text.slice(0, 40) + '...)');
    }
  }
  if (alreadyExported.length > 0) {
    console.log('Already exported (skipped unless --force): ' + alreadyExported.length);
  }
  console.log('Output CSV: ' + CSV_FILE);
  console.log('Output copy list: ' + COPY_LIST_FILE);
  console.log('Next refill: ' + nextRefillDisplay);
  console.log('Next refill UTC: ' + (stale ? 'N/A' : nextRefillUtc));
  console.log('Next refill Local: ' + (stale ? 'N/A' : nextRefillLocal));
  console.log('Batch stale: ' + stale);
  console.log('Batch ID: ' + BATCH_ID);
  console.log('X network requests made: 0');
  console.log('Buffer network requests made: 0');
}

exportBuffer().catch((err) => {
  console.error(err);
  process.exit(1);
});
