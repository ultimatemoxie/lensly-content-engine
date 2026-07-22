export interface Story {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  articleUrl: string;
  publishedAt?: string;
  collectedAt: string;
}

export interface GeneratedPost {
  id: string;
  storyId: string;
  platform: string;
  content: string;
  hashtags: string[];
  status: 'draft' | 'queued' | 'published' | 'failed';
  createdAt: string;
}

export interface PostQueueItem {
  id: string;
  generatedPostId: string;
  scheduledFor: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
}

export interface PublishLog {
  id: string;
  generatedPostId: string;
  platform: string;
  status: 'success' | 'error';
  message?: string;
  publishedAt: string;
}

export interface SourceHealthReport {
  sourceName: string;
  configuredUrl: string;
  finalUrl: string;
  mode: 'rss' | 'atom' | 'html';
  status: number | null;
  itemsFound: number;
  recentItemsAccepted: number;
  error: string | null;
}

export type Platform = 'threads' | 'instagram' | 'twitter';
