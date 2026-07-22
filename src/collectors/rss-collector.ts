import Parser from 'rss-parser';
import { Collector } from './index';
import { Story } from '../types';
import { storyStorage } from '../storage';

interface FeedSource {
  name: string;
  url: string;
}

const FEEDS: FeedSource[] = [
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml' },
  { name: 'Google AI Blog', url: 'https://ai.googleblog.com/feeds/posts/default?alt=rss' },
  { name: 'Anthropic News', url: 'https://www.anthropic.com/news/rss.xml' },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/ai/feed/' },
];

const CUTOFF_MS = 72 * 60 * 60 * 1000;

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Lensly/0.1',
  },
});

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const cleanSearch = parsed.search
      .split('&')
      .filter((param) => {
        const key = param.split('=')[0]?.toLowerCase() || '';
        return !['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].includes(key);
      })
      .join('&');

    let cleanPathname = parsed.pathname.replace(/\/+$/, '');
    if (!cleanPathname) cleanPathname = '/';

    return `${parsed.protocol}//${parsed.host}${cleanPathname}${cleanSearch ? '?' + cleanSearch : ''}`;
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

function generateId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class RssCollector implements Collector {
  name = 'rss-collector';

  async collect(): Promise<Story[]> {
    const collectedStories: Story[] = [];
    const seen = new Set<string>();
    const existing = await storyStorage.readAll();
    const now = Date.now();
    const cutoff = now - CUTOFF_MS;
    let failedSources = 0;

    for (const existingStory of existing) {
      if (!existingStory.sourceName || existingStory.sourceName === 'mock') {
        continue;
      }
      const dedupKey = `${normalizeText(existingStory.title)}|${normalizeUrl(existingStory.articleUrl)}`;
      seen.add(dedupKey);
    }

    for (const feed of FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);
        const items = parsed.items || [];

        let collected = 0;
        let filtered = 0;

        for (const item of items.slice(0, 10)) {
          const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : undefined;

          if (publishedAt) {
            const publishedTime = new Date(publishedAt).getTime();
            if (isNaN(publishedTime) || publishedTime < cutoff) {
              filtered++;
              continue;
            }
          }

          const title = item.title || 'Untitled';
          const link = item.link || item.url || '';
          const summary = item.contentSnippet || item.content || '';

          const dedupKey = `${normalizeText(title)}|${normalizeUrl(link)}`;
          if (seen.has(dedupKey)) {
            filtered++;
            continue;
          }
          seen.add(dedupKey);

          const story: Story = {
            id: generateId(),
            title,
            summary,
            sourceName: feed.name,
            sourceUrl: feed.url,
            articleUrl: link,
            publishedAt,
            collectedAt: new Date().toISOString(),
          };

          collectedStories.push(story);
          collected++;
        }

        console.log(`[rss-collector] ${feed.name}: collected=${collected}, filtered=${filtered}`);
      } catch (error) {
        failedSources++;
        console.error(`[rss-collector] ${feed.name} failed:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    const validExisting = existing.filter((s) => s.sourceName && s.sourceName !== 'mock');
    const merged = [...validExisting, ...collectedStories];
    const deduped = this.deduplicate(merged);
    const fresh = deduped.filter((story) => {
      if (!story.publishedAt) return true;
      const publishedTime = new Date(story.publishedAt).getTime();
      return !isNaN(publishedTime) && publishedTime >= cutoff;
    });

    await storyStorage.writeAll(fresh);

    console.log(`[rss-collector] total collected: ${collectedStories.length}, failed sources: ${failedSources}, total stories: ${fresh.length}`);

    return collectedStories;
  }

  private deduplicate(stories: Story[]): Story[] {
    const seen = new Map<string, Story>();
    for (const story of stories) {
      const key = `${normalizeText(story.title)}|${normalizeUrl(story.articleUrl)}`;
      if (!seen.has(key)) {
        seen.set(key, story);
      }
    }
    return Array.from(seen.values());
  }
}
