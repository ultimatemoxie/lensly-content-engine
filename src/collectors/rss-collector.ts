import Parser from 'rss-parser';
import { Collector } from './index';
import { Story } from '../types';
import { storyStorage } from '../storage';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Lensly/0.1',
  },
});

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

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function generateId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class RssCollector implements Collector {
  name = 'rss-collector';

  async collect(): Promise<Story[]> {
    const collectedStories: Story[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    const cutoff = now - CUTOFF_MS;
    let failedSources = 0;

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

          const dedupKey = `${normalize(title)}|${normalize(link)}`;
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
          await storyStorage.append(story);
          collected++;
        }

        console.log(`[rss-collector] ${feed.name}: collected=${collected}, filtered=${filtered}`);
      } catch (error) {
        failedSources++;
        console.error(`[rss-collector] ${feed.name} failed:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    console.log(`[rss-collector] total collected: ${collectedStories.length}, failed sources: ${failedSources}`);

    return collectedStories;
  }
}
