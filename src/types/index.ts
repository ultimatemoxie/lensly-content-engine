export interface VerifiedFact {
  claim: string;
  sourceEvidence: string;
}

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
  evaluationStatus: 'pending' | 'evaluated' | 'retry_pending' | 'insufficient' | 'failed_permanent';
  storyScore?: number;
  postQualityScore?: number;
  category?: string;
  reason?: string;
  shouldPost?: boolean;
  verifiedFacts?: VerifiedFact[];
  postType?: string;
  confidence?: number;
  lastEvaluatedAt?: string;
  providerAttempts?: Array<{
    provider: string;
    model: string;
    result: 'success' | 'temporary_failure' | 'permanent_failure';
    httpStatus: number | null;
    error?: string;
  }>;
}

export interface EvaluationResult {
  storyScore: number;
  postQualityScore: number;
  category: string;
  reason: string;
  shouldPost: boolean;
  verifiedFacts: VerifiedFact[];
  primaryPost: {
    type: string;
    text: string;
  };
  alternativePosts: Array<{
    type: string;
    text: string;
  }>;
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
  storyScore: number;
  postQualityScore: number;
  status: 'draft' | 'queued' | 'published' | 'failed' | 'review';
  createdAt: string;
  aiProvider: string;
  aiModel: string;
  isAlternative: boolean;
  parentPostId?: string;
  characterCount: number;
  validationStatus: 'valid' | 'invalid' | 'review';
  validationNotes: string[];
  factualValidationStatus: 'passed' | 'failed' | 'review';
  unsupportedClaims: string[];
  evidenceCount: number;
  qualityRubric: {
    hookStrength: number;
    clarity: number;
    usefulness: number;
    originality: number;
    factualGrounding: number;
    naturalVoice: number;
    overallPostQuality: number;
  };
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
  failedPermanentStories: number;
  pendingStories: number;
  totalHttpRequests: number;
  initialRequests: number;
  retryRequests: number;
  fallbackRequests: number;
  successfulProviderRequests: number;
  failedProviderRequests: number;
  remainingCandidates: number;
}

export type Platform = 'threads' | 'instagram' | 'twitter';
