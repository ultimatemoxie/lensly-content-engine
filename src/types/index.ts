export interface Story {
  id: string;
  title: string;
  summary: string;
  rssSummary: string;
  articleText: string;
  contentSource: 'rss' | 'article' | 'insufficient';
  fetchStatus: 'pending' | 'success' | 'failed';
  fetchError?: string;
  sourceName: string;
  sourceUrl: string;
  articleUrl: string;
  publishedAt?: string;
  collectedAt: string;
  evaluationStatus: 'pending' | 'evaluated' | 'retry_pending' | 'insufficient';
  score?: number;
  category?: string;
  reason?: string;
  shouldPost?: boolean;
  verifiedFacts?: string[];
  postType?: string;
  confidence?: number;
  lastEvaluatedAt?: string;
}

export interface EvaluationResult {
  score: number;
  category: string;
  reason: string;
  shouldPost: boolean;
  verifiedFacts: string[];
  postType: string;
  postText?: string;
  confidence: number;
}

export interface GeneratedPost {
  id: string;
  storyId: string;
  text: string;
  postType: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
  confidence: number;
  score: number;
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

export interface PipelineStatus {
  totalStories: number;
  evaluatedStories: number;
  approvedPosts: number;
  rejectedStories: number;
  retryPendingStories: number;
  geminiCallsMade: number;
  remainingCandidates: number;
}

export type Platform = 'threads' | 'instagram' | 'twitter';
