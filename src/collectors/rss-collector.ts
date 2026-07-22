import Parser from 'rss-parser';
import { Collector } from './index';
import { Story, SourceHealthReport } from '../types';
import { storyStorage } from '../storage';

interface FeedSource {
  name: string;
  configuredUrl: string;
  mode: 'rss' | 'atom' | 'html';
}

const FEEDS: FeedSource[] = [
  { name: 'OpenAI Blog', configuredUrl: 'https://openai.com/blog/rss.xml', mode: 'rss' },
  { name: 'Google AI Blog', configuredUrl: 'https://blog.google/rss/', mode: 'atom' },
  { name: 'Anthropic News', configuredUrl: 'https://www.anthropic.com/news', mode: 'html' },
  { name: 'Hugging Face Blog', configuredUrl: 'https://huggingface.co/blog/feed.xml', mode: 'rss' },
  { name: 'TechCrunch AI', configuredUrl: 'https://techcrunch.com/category/artificial-intelligence/feed/', mode: 'rss' },
];

const CUTOFF_MS = 72 * 60 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;

const xmlParser = new Parser({
  headers: {
    'User-Agent': USER_AGENT,
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

async function fetchWithRetry(url: string, attempts = 2): Promise<{ finalUrl: string; status: number | null; contentType: string | null; body: string; error: string | null }> {
  let lastError: string | null = 'Unknown error';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const finalUrl = response.url;
      const status = response.status;
      const contentType = response.headers.get('content-type');
      const body = await response.text();

      return { finalUrl, status, contentType, body, error: null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  return { finalUrl: url, status: null, contentType: null, body: '', error: lastError };
}

async function parseXmlItems(xml: string, feedUrl: string): Promise<{ items: Array<{ title: string; link: string; pubDate?: string; contentSnippet: string }>; error: string | null }> {
  try {
    const parsed = await xmlParser.parseString(xml);
    const items = (parsed.items || []).map((item: any) => ({
      title: item.title || 'Untitled',
      link: item.link || item.url || '',
      pubDate: item.pubDate,
      contentSnippet: item.contentSnippet || item.content || '',
    }));
    return { items, error: null };
  } catch (error) {
    return { items: [], error: error instanceof Error ? error.message : 'XML parse error' };
  }
}

function parseAnthropicHtml(html: string, baseUrl: string): Array<{ title: string; link: string; summary: string; publishedAt?: string; category?: string }> {
  const results: Array<{ title: string; link: string; summary: string; publishedAt?: string; category?: string }> = [];
  const itemRegex = /<a href="(\/news\/[^"]+)" class="(?:FeaturedGrid|PublicationList)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const linkPath = match[1];
    const inner = match[2];

    const titleMatch = inner.match(/<h[24][^>]*>([^<]+)<\/h[24]>/);
    const categoryMatch = inner.match(/<span class="caption bold">([^<]+)<\/span>/);
    const dateMatch = inner.match(/<time[^>]*>([^<]+)<\/time>/);

    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const category = categoryMatch ? categoryMatch[1].trim() : undefined;
    const dateStr = dateMatch ? dateMatch[1].trim() : undefined;
    let publishedAt: string | undefined;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        publishedAt = parsed.toISOString();
      }
    }

    results.push({
      title,
      link: `${baseUrl}${linkPath}`,
      summary: category ? `${category}` : '',
      publishedAt,
      category,
    });
  }

  return results;
}

export class RssCollector implements Collector {
  name = 'rss-collector';

  async collect(): Promise<Story[]> {
    const collectedStories: Story[] = [];
    const seen = new Set<string>();
    const existing = await storyStorage.readAll();
    const now = Date.now();
    const cutoff = now - CUTOFF_MS;
    const healthReports: SourceHealthReport[] = [];

    for (const existingStory of existing) {
      if (!existingStory.sourceName || existingStory.sourceName === 'mock') {
        continue;
      }
      const dedupKey = `${normalizeText(existingStory.title)}|${normalizeUrl(existingStory.articleUrl)}`;
      seen.add(dedupKey);
    }

    for (const feed of FEEDS) {
      let report: SourceHealthReport = {
        sourceName: feed.name,
        configuredUrl: feed.configuredUrl,
        finalUrl: feed.configuredUrl,
        mode: feed.mode,
        status: null,
        itemsFound: 0,
        recentItemsAccepted: 0,
        error: null,
      };

      try {
        let collected = 0;
        let filtered = 0;

        if (feed.mode === 'html') {
          const { finalUrl, status, contentType, body, error } = await fetchWithRetry(feed.configuredUrl);
          report.finalUrl = finalUrl;
          report.status = status;
          report.error = error;

          if (error || !body) {
            report.error = error || 'Empty response';
            console.error(`[rss-collector] ${feed.name} failed: ${report.error}`);
            healthReports.push(report);
            continue;
          }

          const articles = parseAnthropicHtml(body, 'https://www.anthropic.com');
          report.itemsFound = articles.length;

          for (const article of articles.slice(0, 10)) {
            if (article.publishedAt) {
              const publishedTime = new Date(article.publishedAt).getTime();
              if (!isNaN(publishedTime) && publishedTime < cutoff) {
                filtered++;
                continue;
              }
            }

            const dedupKey = `${normalizeText(article.title)}|${normalizeUrl(article.link)}`;
            if (seen.has(dedupKey)) {
              filtered++;
              continue;
            }
            seen.add(dedupKey);

            const story: Story = {
              id: generateId(),
              title: article.title,
              summary: article.summary,
              rssSummary: article.summary,
              articleText: '',
              contentSource: 'rss',
              fetchStatus: 'success',
              sourceName: feed.name,
              sourceUrl: feed.configuredUrl,
              articleUrl: article.link,
              publishedAt: article.publishedAt,
              collectedAt: new Date().toISOString(),
              evaluationStatus: 'pending',
            };

            collectedStories.push(story);
            collected++;
          }

          report.recentItemsAccepted = collected;
        } else {
          const { finalUrl, status, contentType, body, error } = await fetchWithRetry(feed.configuredUrl);
          report.finalUrl = finalUrl;
          report.status = status;
          report.error = error;

          if (error || !body) {
            report.error = error || 'Empty response';
            console.error(`[rss-collector] ${feed.name} failed: ${report.error}`);
            healthReports.push(report);
            continue;
          }

          const isXml = (contentType || '').includes('xml') || (contentType || '').includes('rss') || (contentType || '').includes('atom');
          if (!isXml) {
            report.error = `Non-XML content-type: ${contentType}`;
            console.error(`[rss-collector] ${feed.name} failed: ${report.error}`);
            healthReports.push(report);
            continue;
          }

          const { items, error: parseError } = await parseXmlItems(body, feed.configuredUrl);
          report.error = parseError;
          report.itemsFound = items.length;

          if (parseError) {
            console.error(`[rss-collector] ${feed.name} XML parse error: ${parseError}`);
            healthReports.push(report);
            continue;
          }

          for (const item of items.slice(0, 10)) {
            if (item.pubDate) {
              const publishedTime = new Date(item.pubDate).getTime();
              if (!isNaN(publishedTime) && publishedTime < cutoff) {
                filtered++;
                continue;
              }
            }

            const dedupKey = `${normalizeText(item.title)}|${normalizeUrl(item.link)}`;
            if (seen.has(dedupKey)) {
              filtered++;
              continue;
            }
            seen.add(dedupKey);

            const story: Story = {
              id: generateId(),
              title: item.title,
              summary: item.contentSnippet,
              rssSummary: item.contentSnippet,
              articleText: '',
              contentSource: 'rss',
              fetchStatus: 'success',
              sourceName: feed.name,
              sourceUrl: feed.configuredUrl,
              articleUrl: item.link,
              publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
              collectedAt: new Date().toISOString(),
              evaluationStatus: 'pending',
            };

            collectedStories.push(story);
            collected++;
          }

          report.recentItemsAccepted = collected;
        }

        console.log(`[rss-collector] ${feed.name}: collected=${collected}, filtered=${filtered}`);
      } catch (error) {
        report.error = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[rss-collector] ${feed.name} failed:`, report.error);
      }

      healthReports.push(report);
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

    console.log(`[rss-collector] total collected: ${collectedStories.length}, failed sources: ${healthReports.filter((r) => r.error).length}, total stories: ${fresh.length}`);
    console.log('[rss-collector] source health report:');
    for (const report of healthReports) {
      console.log(`  - ${report.sourceName}: status=${report.status ?? 'n/a'}, mode=${report.mode}, items=${report.itemsFound}, accepted=${report.recentItemsAccepted}, error=${report.error ?? 'none'}`);
    }

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
