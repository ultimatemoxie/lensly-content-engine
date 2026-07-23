import { QueueValidator } from './queue-validator';
import type { GeneratedPost } from '../types';
import type { QueueItem } from './queue-validator';
import { DateTime } from 'luxon';

const TZ = 'Africa/Lagos';
const ACTIVE_START = 7;
const ACTIVE_END = 23;
const ACTIVE_END_MIN = 30;
const MIN_GAP_MINUTES = 45;
const MAX_GAP_MINUTES = 110;
const MIN_SAME_STORY_GAP_MINUTES = 4 * 60;
const MAX_QUEUE_SIZE = 15;
const MAX_PER_STORY_PER_DAY = 2;

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

export class QueueBuilder {
  static buildQueue(queueReadyPosts: GeneratedPost[], existingQueue: QueueItem[] = []): QueueItem[] {
    const now = DateTime.now().setZone(TZ);
    const eligible = queueReadyPosts.filter(p => QueueValidator.isQueueReady(p).eligible);

    if (eligible.length === 0) {
      return existingQueue;
    }

    const future = existingQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() > now.toMillis());
    const usedGeneratedIds = new Set(future.map(q => q.generatedPostId));
    const scheduledTimes = future.map(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis()).sort((a, b) => a - b);
    const typeCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    const companyCounts: Record<string, number> = {};
    const storyVariationCount: Record<string, number> = {};
    const storyLastScheduled: Record<string, number> = {};
    for (const q of future) {
      typeCounts[q.postType] = (typeCounts[q.postType] || 0) + 1;
      sourceCounts[q.sourceName] = (sourceCounts[q.sourceName] || 0) + 1;
      const company = QueueValidator.extractCompany(q.text);
      if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
      storyVariationCount[q.storyId] = (storyVariationCount[q.storyId] || 0) + 1;
      const qt = DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis();
      if (!storyLastScheduled[q.storyId] || qt > storyLastScheduled[q.storyId]) {
        storyLastScheduled[q.storyId] = qt;
      }
    }

    const available = eligible.filter(p => !usedGeneratedIds.has(p.id));
    const selected: GeneratedPost[] = [];
    const selectedIds = new Set<string>();
    const selectedStoryIds = new Set<string>();
    const resultTimes: number[] = [...scheduledTimes];

    const scorePost = (p: GeneratedPost): number => {
      const mix = MIX_TARGETS[p.postType] || 1;
      const src = sourceCounts[p.sourceName] || 0;
      const comp = companyCounts[QueueValidator.extractCompany(p.text)] || 0;
      const storyVar = storyVariationCount[p.storyId] || 0;
      const opq = p.qualityRubric?.overallPostQuality ?? 0;
      const fg = p.qualityRubric?.factualGrounding ?? 0;
      return mix * 10 - src * 5 - comp * 5 - storyVar * 8 + (opq / 100) * 5 + (fg / 100) * 5;
    };

    available.sort((a, b) => scorePost(b) - scorePost(a));

    for (const post of available) {
      if (selected.length >= MAX_QUEUE_SIZE) break;

      const company = QueueValidator.extractCompany(post.text);
      const typeCount = typeCounts[post.postType] || 0;
      const srcCount = sourceCounts[post.sourceName] || 0;
      const compCount = companyCounts[company] || 0;
      const storyVar = storyVariationCount[post.storyId] || 0;

      if (typeCount >= 3) continue;
      if (srcCount >= 3) continue;
      if (company && compCount >= 3) continue;
      if (storyVar >= MAX_PER_STORY_PER_DAY) continue;
      if (selectedStoryIds.has(post.storyId) && storyVar >= MAX_PER_STORY_PER_DAY) continue;

      selected.push(post);
      selectedIds.add(post.id);
      selectedStoryIds.add(post.storyId);
      typeCounts[post.postType] = typeCount + 1;
      sourceCounts[post.sourceName] = srcCount + 1;
      if (company) companyCounts[company] = compCount + 1;
      storyVariationCount[post.storyId] = storyVar + 1;
    }

    const newItems: QueueItem[] = [];
    let cursor = resultTimes.length > 0 ? resultTimes[resultTimes.length - 1] : now.toMillis();
    if (cursor <= now.toMillis()) {
      cursor = now.plus({ minutes: 30 }).toMillis();
    }

    const plannedItems: { post: GeneratedPost; scheduledUtc: DateTime }[] = [];

    for (const post of selected) {
      let next = cursor + this.randomGap() * 60 * 1000;
      let attempts = 0;
      while (attempts < 20) {
        const local = DateTime.fromMillis(next, { zone: TZ });
        const hour = local.hour;
        const minute = local.minute;
        if (hour >= ACTIVE_START && (hour < ACTIVE_END || (hour === ACTIVE_END && minute <= ACTIVE_END_MIN))) {
          break;
        }
        next += 30 * 60 * 1000;
        attempts++;
      }
      if (plannedItems.length > 0) {
        const prev = plannedItems[plannedItems.length - 1].scheduledUtc;
        const diff = (prev.toMillis() - next) / 60000;
        if (Math.abs(diff) < MIN_GAP_MINUTES) {
          next = prev.plus({ minutes: this.randomGap() }).toMillis();
        }
      }
      plannedItems.push({ post, scheduledUtc: DateTime.fromMillis(next, { zone: 'utc' }) });
      cursor = next;
    }

    const validPlannedItems = this.enforceSameStorySpacing(plannedItems, future);

    for (const { post, scheduledUtc } of validPlannedItems) {
      const localTime = scheduledUtc.setZone(TZ);
      newItems.push({
        id: 'queue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
        generatedPostId: post.id,
        storyId: post.storyId,
        text: post.text,
        postType: post.postType,
        category: post.category,
        sourceName: post.sourceName,
        sourceUrl: post.sourceUrl,
        aiProvider: post.aiProvider,
        aiModel: post.aiModel,
        storyScore: post.storyScore,
        overallPostQuality: post.qualityRubric?.overallPostQuality ?? 0,
        factualGrounding: post.qualityRubric?.factualGrounding ?? 0,
        scheduledForUtc: scheduledUtc.toISO()!,
        scheduledForLocal: localTime.toISO()!,
        timezone: TZ,
        status: 'queued',
        createdAt: new Date().toISOString(),
      });
    }

    return [...future, ...newItems];
  }

  private static enforceSameStorySpacing(
    plannedItems: { post: GeneratedPost; scheduledUtc: DateTime }[],
    existingFutureItems: QueueItem[]
  ): { post: GeneratedPost; scheduledUtc: DateTime }[] {
    const allItems: { storyId: string; scheduledUtc: DateTime; post: GeneratedPost }[] = [];

    for (const q of existingFutureItems) {
      allItems.push({
        storyId: q.storyId,
        scheduledUtc: DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }),
        post: null as any,
      });
    }

    for (const item of plannedItems) {
      allItems.push({
        storyId: item.post.storyId,
        scheduledUtc: item.scheduledUtc,
        post: item.post,
      });
    }

    allItems.sort((a, b) => a.scheduledUtc.toMillis() - b.scheduledUtc.toMillis());

    const storyGroups: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      if (!storyGroups[item.storyId]) storyGroups[item.storyId] = [];
      storyGroups[item.storyId].push(item);
    }

    const validItems: typeof allItems = [];
    for (const [storyId, items] of Object.entries(storyGroups)) {
      if (items.length <= 1) {
        validItems.push(...items);
        continue;
      }
      const newItems = items.filter(i => i.post !== null);
      const existingItems = items.filter(i => i.post === null);

      if (newItems.length === 0) {
        validItems.push(...items);
        continue;
      }

      newItems.sort((a, b) => a.scheduledUtc.toMillis() - b.scheduledUtc.toMillis());

      if (existingItems.length > 0) {
        const lastExisting = existingItems[existingItems.length - 1].scheduledUtc.toMillis();
        const firstNew = newItems[0].scheduledUtc.toMillis();
        const gap = (firstNew - lastExisting) / 60000;
        if (gap < MIN_SAME_STORY_GAP_MINUTES) {
          newItems[0].scheduledUtc = DateTime.fromMillis(lastExisting + MIN_SAME_STORY_GAP_MINUTES * 60 * 1000, { zone: 'utc' });
        }
      }

      for (let i = 1; i < newItems.length; i++) {
        const prev = newItems[i - 1].scheduledUtc.toMillis();
        const curr = newItems[i].scheduledUtc.toMillis();
        const gap = (curr - prev) / 60000;
        if (gap < MIN_SAME_STORY_GAP_MINUTES) {
          newItems[i].scheduledUtc = DateTime.fromMillis(prev + MIN_SAME_STORY_GAP_MINUTES * 60 * 1000, { zone: 'utc' });
        }
      }

      validItems.push(...existingItems, ...newItems);
    }

    return validItems
      .filter(i => i.post !== null)
      .map(i => ({ post: i.post, scheduledUtc: i.scheduledUtc }));
  }

  static validateTimezoneConsistency(queueItem: QueueItem): boolean {
    const utc = DateTime.fromISO(queueItem.scheduledForUtc, { zone: 'utc' });
    const local = DateTime.fromISO(queueItem.scheduledForLocal, { zone: TZ });
    const converted = utc.setZone(TZ);
    const diffMinutes = Math.abs(converted.toMillis() - local.toMillis()) / 60000;
    return queueItem.timezone === TZ && diffMinutes < 1 && converted.toISO() === local.toISO();
  }

  private static randomGap(): number {
    return MIN_GAP_MINUTES + Math.floor(Math.random() * (MAX_GAP_MINUTES - MIN_GAP_MINUTES));
  }
}
