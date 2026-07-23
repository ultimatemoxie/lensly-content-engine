import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { QueueBuilder } from '../queue/queue-builder';
import { QueueValidator, QueueItem } from '../queue/queue-validator';
import { DateTime } from 'luxon';
import type { GeneratedPost } from '../types';

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
  const now = DateTime.now().setZone('Africa/Lagos');

  const expired = queue.filter(q => q.status === 'expired' || q.status === 'published' || q.status === 'failed' || q.status === 'cancelled');
  const activeQueue = queue.filter(q => q.status === 'queued');
  const future = activeQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() > now.toMillis()).sort((a, b) => DateTime.fromISO(a.scheduledForUtc, { zone: 'utc' }).toMillis() - DateTime.fromISO(b.scheduledForUtc, { zone: 'utc' }).toMillis());
  const next = future[0];

  const queuedGeneratedIds = new Set(activeQueue.map(q => q.generatedPostId));
  const queueReadyCount = posts.filter(p => {
    const { eligible } = QueueValidator.isQueueReady(p);
    return eligible && p.status === 'draft' && !queuedGeneratedIds.has(p.id);
  }).length;
  const reviewCount = posts.filter(p => p.status === 'review').length;

  const typeCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  const storySlots: Record<string, number> = {};
  for (const q of activeQueue) {
    typeCounts[q.postType] = (typeCounts[q.postType] || 0) + 1;
    sourceCounts[q.sourceName] = (sourceCounts[q.sourceName] || 0) + 1;
    const company = QueueValidator.extractCompany(q.text);
    if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
    storySlots[q.storyId] = (storySlots[q.storyId] || 0) + 1;
  }

  console.log('Queue Status');
  console.log('============');
  console.log('Total records in post-queue.json: ' + queue.length);
  console.log('Active queued posts: ' + activeQueue.length);
  console.log('Expired/published/failed/cancelled posts: ' + expired.length);
  console.log('Future active posts: ' + future.length);
  console.log('Queue-ready drafts remaining: ' + queueReadyCount);
  console.log('Review posts excluded: ' + reviewCount);
  console.log('Type distribution: ' + JSON.stringify(typeCounts));
  console.log('Source distribution: ' + JSON.stringify(sourceCounts));
  console.log('Company distribution: ' + JSON.stringify(companyCounts));
  console.log('Story variation slots used: ' + JSON.stringify(storySlots));

  if (next) {
    console.log('Next scheduled post: ' + next.text.slice(0, 60) + '...');
    console.log('  scheduledForLocal: ' + next.scheduledForLocal);
    console.log('  scheduledForUtc: ' + next.scheduledForUtc);
    console.log('  timezone: ' + next.timezone);
    console.log('  timezone consistency: ' + QueueBuilder.validateTimezoneConsistency(next));
  }

  const mixGaps = Object.entries(MIX_TARGETS).filter(([type, target]) => (typeCounts[type] || 0) < target);
  if (mixGaps.length > 0) {
    console.log('Mix gaps preventing full 15-post queue: ' + mixGaps.map(([t, g]) => t + ' (need ' + g + ')').join(', '));
  } else {
    console.log('Mix gaps: none');
  }

  const eligibleExcluded = posts.filter(p => {
    const { eligible, reasons } = QueueValidator.isQueueReady(p);
    return !eligible && p.status === 'draft';
  });
  if (eligibleExcluded.length > 0) {
    console.log('Eligible drafts excluded by constraints:');
    for (const p of eligibleExcluded) {
      const reasons = QueueValidator.isQueueReady(p).reasons;
      console.log('  - ' + p.text.slice(0, 50) + '... [' + reasons.join(', ') + ']');
    }
  }

  const queueReadyDrafts = posts.filter(p => {
    const { eligible } = QueueValidator.isQueueReady(p);
    return eligible && p.status === 'draft' && !queuedGeneratedIds.has(p.id);
  });
  if (queueReadyDrafts.length > 0) {
    console.log('Queue-ready drafts not added to queue:');
    for (const p of queueReadyDrafts) {
      const reasons: string[] = [];
      if (QueueValidator.isQueueReady(p).reasons.length > 0) {
        reasons.push(...QueueValidator.isQueueReady(p).reasons);
      }
      if (!reasons.includes('source cap') && (typeCounts[p.postType] || 0) >= 3) reasons.push('post-type cap');
      if (!reasons.includes('company cap') && QueueValidator.extractCompany(p.text) && (companyCounts[QueueValidator.extractCompany(p.text)] || 0) >= 3) reasons.push('company cap');
      console.log('  - ' + p.text.slice(0, 50) + '... [' + (reasons.length > 0 ? reasons.join(', ') : 'already queued or lower-ranked') + ']');
    }
  }

  const sameStorySpacing: Record<string, string> = {};
  const storyTimes: Record<string, number[]> = {};
  for (const q of future) {
    if (!storyTimes[q.storyId]) storyTimes[q.storyId] = [];
    storyTimes[q.storyId].push(DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis());
  }
  for (const [storyId, times] of Object.entries(storyTimes)) {
    if (times.length > 1) {
      times.sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < times.length; i++) {
        const gapMinutes = Math.round((times[i] - times[i - 1]) / 60000);
        gaps.push(gapMinutes + 'min' + (gapMinutes < 240 ? ' (BELOW 4H MIN)' : ''));
      }
      sameStorySpacing[storyId] = gaps.join(', ');
    }
  }
  if (Object.keys(sameStorySpacing).length > 0) {
    console.log('Same-story spacing (minutes):');
    for (const [storyId, gaps] of Object.entries(sameStorySpacing)) {
      console.log('  ' + storyId + ': ' + gaps);
    }
  }

  const slotsRemaining = Math.max(0, 15 - future.length);
  const typesNeeded = Object.entries(MIX_TARGETS)
    .filter(([type, target]) => (typeCounts[type] || 0) < target)
    .map(([type, target]) => type + ' (need ' + (target - (typeCounts[type] || 0)) + ')');
  const sourcesAtCap = Object.entries(sourceCounts).filter(([, count]) => count >= 3).map(([src]) => src);
  const reviewPosts = posts.filter(p => p.status === 'review');
  const pendingStories = await getPendingStories();

  console.log('\nQueue Replenishment Report');
  console.log('==========================');
  console.log('Slots remaining: ' + slotsRemaining);
  console.log('Types needed: ' + (typesNeeded.length > 0 ? typesNeeded.join(', ') : 'none'));
  console.log('Sources at cap: ' + (sourcesAtCap.length > 0 ? sourcesAtCap.join(', ') : 'none'));
  console.log('Pending stories available for future evaluation: ' + pendingStories);
  console.log('Review posts that may become eligible after rewriting: ' + reviewPosts.length);
  console.log('Estimated additional AI evaluations needed: ' + Math.ceil((15 - future.length) / 3));
}

async function getPendingStories(): Promise<number> {
  try {
    const stories = await storyStorage.readAll();
    return stories.filter(s => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending').length;
  } catch {
    return 0;
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
