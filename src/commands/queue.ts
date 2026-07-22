import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { QueueBuilder } from '../queue/queue-builder';
import { QueueValidator, QueueItem } from '../queue/queue-validator';
import type { GeneratedPost } from '../types';

function generateId(): string {
  return 'queue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

async function buildQueue() {
  const config = loadConfig();
  const rawPosts = await generatedPostStorage.readAll();
  const posts: GeneratedPost[] = rawPosts as GeneratedPost[];
  const existing = await readQueue();

  const built = QueueBuilder.buildQueue(posts, existing);
  await writeQueue(built);

  console.log('Queue built. Total queued: ' + built.length);
}

async function queueStatus() {
  const config = loadConfig();
  const rawPosts = await generatedPostStorage.readAll();
  const posts: GeneratedPost[] = rawPosts as GeneratedPost[];
  const queue = await readQueue();
  const now = new Date();

  const queueReadyCount = posts.filter(p => {
    const { eligible } = QueueValidator.isQueueReady(p);
    return eligible && p.status === 'draft';
  }).length;
  const reviewCount = posts.filter(p => p.status === 'review').length;

  const typeCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  for (const q of queue) {
    typeCounts[q.postType] = (typeCounts[q.postType] || 0) + 1;
    sourceCounts[q.sourceName] = (sourceCounts[q.sourceName] || 0) + 1;
    const company = QueueValidator.extractCompany(q.text);
    if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
  }

  const future = queue.filter(q => new Date(q.scheduledForUtc) > now).sort((a, b) => new Date(a.scheduledForUtc).getTime() - new Date(b.scheduledForUtc).getTime());
  const next = future[0];

  console.log('Queue Status');
  console.log('============');
  console.log('Total queued: ' + queue.length);
  console.log('Future posts: ' + future.length);
  console.log('Queue-ready drafts remaining: ' + queueReadyCount);
  console.log('Review posts excluded: ' + reviewCount);
  console.log('Type distribution: ' + JSON.stringify(typeCounts));
  console.log('Source distribution: ' + JSON.stringify(sourceCounts));
  console.log('Company distribution: ' + JSON.stringify(companyCounts));
  if (next) {
    console.log('Next scheduled post: ' + next.text.slice(0, 60) + '...');
    console.log('  scheduledForLocal: ' + next.scheduledForLocal);
    console.log('  scheduledForUtc: ' + next.scheduledForUtc);
  }
  const mixGaps = Object.entries(MIX_TARGETS).filter(([type, target]) => (typeCounts[type] || 0) < target);
  if (mixGaps.length > 0) {
    console.log('Mix gaps preventing full 15-post queue: ' + mixGaps.map(([t, g]) => t + ' (need ' + g + ')').join(', '));
  } else {
    console.log('Mix gaps: none');
  }
}

async function clearTestQueue() {
  const queue = await readQueue();
  const testIds = new Set(queue.map(q => q.id));
  const filtered = queue.filter(q => !testIds.has(q.id));
  await writeQueue(filtered);
  console.log('Test queue cleared. Remaining: ' + filtered.length);
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

const MIX_TARGETS: Record<string, number> = {
  breaking_news: 3,
  creator_insight: 2,
  practical_tip: 2,
  light_humor: 2,
  founder_take: 2,
  industry_observation: 2,
  thoughtful_question: 1,
  comparison: 1,
  research_insight: 1,
};

const command = process.argv[2];
if (command === 'queue') {
  buildQueue().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (command === 'status') {
  queueStatus().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (command === 'clear-test') {
  clearTestQueue().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error('Unknown queue command: ' + command);
  process.exit(1);
}
