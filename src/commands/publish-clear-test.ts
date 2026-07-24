import { publishLogStorage } from '../storage';
import { QueueItem } from '../queue/queue-validator';

async function clearTest() {
  const queue = await readQueue();
  const testQueueItems = queue.filter(q => q.isTest === true);
  const remainingQueue = queue.filter(q => q.isTest !== true);

  const logs = await publishLogStorage.readAll();
  const testLogIds = new Set(testQueueItems.map(q => q.generatedPostId));
  const remainingLogs = logs.filter(l => !testQueueItems.some(t => t.generatedPostId === l.generatedPostId));

  await writeQueue(remainingQueue);
  await publishLogStorage.writeAll(remainingLogs);

  console.log('Test cleanup:');
  console.log('  Queue test records removed: ' + testQueueItems.length);
  console.log('  Publish log test records removed: ' + (logs.length - remainingLogs.length));
  console.log('  Queue records remaining: ' + remainingQueue.length);
  console.log('  Publish log records remaining: ' + remainingLogs.length);
}

clearTest().catch((err) => {
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