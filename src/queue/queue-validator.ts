import type { GeneratedPost } from '../types';

export interface QueueItem {
  id: string;
  generatedPostId: string;
  storyId: string;
  text: string;
  postType: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
  aiProvider: string;
  aiModel: string;
  storyScore: number;
  overallPostQuality: number;
  factualGrounding: number;
  scheduledForUtc: string;
  scheduledForLocal: string;
  timezone: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
}

export interface QueueEligibility {
  eligible: boolean;
  reasons: string[];
}

export class QueueValidator {
  static isQueueReady(post: GeneratedPost): QueueEligibility {
    const reasons: string[] = [];
    if (post.storyScore < 65) reasons.push('storyScore<65');
    if ((post.qualityRubric?.overallPostQuality ?? 0) < 70) reasons.push('overallPostQuality<70');
    if ((post.qualityRubric?.factualGrounding ?? 0) < 90) reasons.push('factualGrounding<90');
    if (post.factualValidationStatus !== 'passed') reasons.push('factualValidationStatus!=' + post.factualValidationStatus);
    if (post.validationStatus !== 'valid') reasons.push('validationStatus!=' + post.validationStatus);
    if (post.status !== 'draft') reasons.push('status!=' + post.status);
    if (post.characterCount > 280) reasons.push('characterCount>' + post.characterCount);
    return { eligible: reasons.length === 0, reasons };
  }

  static extractCompany(text: string): string {
    const upper = text.toUpperCase();
    const companies = ['OPENAI', 'GOOGLE', 'ANTHROPIC', 'META', 'HUGGING FACE', 'TECHCRUNCH', 'MICROSOFT', 'APPLE', 'AMAZON'];
    for (const c of companies) {
      if (upper.includes(c)) return c;
    }
    return '';
  }
}
