import { RequestBudget } from '../request-budget';

export interface EvaluationResult {
  score: number;
  category: string;
  reason: string;
  shouldPost: boolean;
  verifiedFacts: string[];
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

export interface AIProvider {
  providerName: string;
  modelName: string;
  checkConnection(budget?: RequestBudget): Promise<{ success: boolean; error?: string; httpStatus?: number | null }>;
  evaluateAndGenerate(story: {
    title: string;
    summary: string;
    rssSummary: string;
    articleText: string;
    contentSource: string;
    sourceName: string;
    articleUrl: string;
    publishedAt?: string;
  }, budget?: RequestBudget): Promise<EvaluationResult & { error?: string; httpStatus?: number | null }>;
  getRequestCount(): number;
}
