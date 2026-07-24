import { loadConfig } from '../config';
import { generatedPostStorage } from '../storage';
import { QueueValidator, QueueItem } from '../queue/queue-validator';
import { DateTime } from 'luxon';
import type { GeneratedPost } from '../types';

async function createTestDue() {
  const config = loadConfig();
  const rawPosts = await generatedPostStorage.readAll();
  const posts: GeneratedPost[] = rawPosts as GeneratedPost[];

  const queueReady = posts.filter(p => {
    const { eligible } = QueueValidator.isQueueReady(p);
    return eligible && p.status === 'draft';
  });

  if (queueReady.length === 0) {
    console.log('No queue-ready drafts available for test creation.');
    return;
  }

  const testPost = queueReady[0];
  const now = DateTime.now().setZone('Africa/Lagos');
  const scheduledUtc = now.minus({ minutes: 1 }).toUTC();
  const scheduledLocal = scheduledUtc.setZone('Africa/Lagos');

  const testItem: QueueItem = {
    id: 'test-queue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    generatedPostId: testPost.id,
    storyId: testPost.storyId,
    text: testPost.text,
    postType: testPost.postType,
    category: testPost.category,
    sourceName: testPost.sourceName,
    sourceUrl: testPost.sourceUrl,
    aiProvider: testPost.aiProvider,
    aiModel: testPost.aiModel,
    storyScore: testPost.storyScore,
    overallPostQuality: testPost.qualityRubric?.overallPostQuality ?? 0,
    factualGrounding: testPost.qualityRubric?.factualGrounding ?? 0,
    scheduledForUtc: scheduledUtc.toISO()!,
    scheduledForLocal: scheduledLocal.toISO()!,
    timezone: 'Africa/Lagos',
    status: 'queued',
    createdAt: new Date().toISOString(),
    isTest: true,
  };

  const queue = await readQueue();
  queue.push(testItem);
  await writeQueue(queue);

  console.log('Test due item created:');
  console.log('  Queue item ID: ' + testItem.id);
  console.log('  Generated post ID: ' + testItem.generatedPostId);
  console.log('  Text: ' + testItem.text.slice(0, 80) + '...');
  console.log('  Scheduled UTC: ' + testItem.scheduledForUtc);
  console.log('  Scheduled Local: ' + testItem.scheduledForLocal);
  console.log('  Status: queued');
  console.log('  isTest: true');
  console.log('  Due: yes (scheduled 1 minute ago)');
  console.log('  X network requests: 0');
}

createTestDue().catch((err) => {
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
