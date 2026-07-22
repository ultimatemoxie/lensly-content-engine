import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, EvaluationResult } from './types';
import { RequestBudget } from '../request-budget';
import { fetchArticleText } from '../../utils/article-extractor';

export class GeminiProvider implements AIProvider {
  providerName = 'gemini';
  private genAI: GoogleGenerativeAI;
  private model: string;
  private delayMs: number;
  private maxRetries: number;
  private maxCalls: number;
  private requestCount = 0;

  constructor(apiKey: string, model: string, delayMs: number, maxRetries: number, maxCalls: number) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.delayMs = delayMs;
    this.maxRetries = maxRetries;
    this.maxCalls = maxCalls;
  }

  get modelName(): string {
    return this.model;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  async checkConnection(budget?: RequestBudget): Promise<{ success: boolean; error?: string; httpStatus?: number | null }> {
    if (budget && !budget.canRequest()) {
      return { success: false, error: 'Request budget exhausted', httpStatus: null };
    }
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const response = await model.generateContent('Reply with OK.');
      const text = response.response.text();

      if (budget) budget.recordInitial();
      this.requestCount++;

      if (!text) {
        return { success: false, error: 'Empty response from Gemini', httpStatus: null };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', httpStatus: null };
    }
  }

  async evaluateAndGenerate(story: {
    title: string;
    summary: string;
    rssSummary: string;
    articleText: string;
    contentSource: string;
    sourceName: string;
    articleUrl: string;
    publishedAt?: string;
  }, budget?: RequestBudget): Promise<EvaluationResult & { error?: string; httpStatus?: number | null }> {
    if (budget && !budget.canRequest()) {
      return {
        score: 0,
        category: '',
        reason: 'Request budget exhausted',
        shouldPost: false,
        verifiedFacts: [],
        primaryPost: { type: '', text: '' },
        alternativePosts: [],
        confidence: 0,
        error: 'Request budget exhausted',
        httpStatus: null,
      };
    }

    const prompt = this.buildPrompt(story);
    let attempt = 0;
    let lastError: string | undefined;
    let httpStatus: number | null = null;

    while (attempt < this.maxRetries) {
      try {
        if (budget) {
          if (!budget.canRequest()) {
            return {
              score: 0,
              category: '',
              reason: 'Request budget exhausted during retry',
              shouldPost: false,
              verifiedFacts: [],
              primaryPost: { type: '', text: '' },
              alternativePosts: [],
              confidence: 0,
              error: 'Request budget exhausted during retry',
              httpStatus: null,
            };
          }
          if (attempt === 0) {
            budget.recordInitial();
          } else {
            budget.recordRetry();
          }
        }
        this.requestCount++;

        const result = await this.callGemini(prompt);
        const parsed = this.parseResponse(result);
        return { ...parsed, error: undefined, httpStatus: 200 };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        const statusMatch = lastError.match(/HTTP (\d+)/);
        httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;

        const isRetryable = this.isRetryableError(lastError);
        if (!isRetryable || attempt >= this.maxRetries - 1) {
          return {
            score: 0,
            category: '',
            reason: `Gemini error: ${lastError}`,
            shouldPost: false,
            verifiedFacts: [],
            primaryPost: { type: '', text: '' },
            alternativePosts: [],
            confidence: 0,
            error: lastError,
            httpStatus,
          };
        }
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        await this.sleep(backoffMs);
        attempt++;
      }
    }

    return {
      score: 0,
      category: '',
      reason: `Gemini error after retries: ${lastError}`,
      shouldPost: false,
      verifiedFacts: [],
      primaryPost: { type: '', text: '' },
      alternativePosts: [],
      confidence: 0,
      error: lastError,
      httpStatus,
    };
  }

  private async callGemini(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.model });
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    await this.sleep(this.delayMs);
    return text;
  }

  private buildPrompt(story: {
    title: string;
    summary: string;
    rssSummary: string;
    articleText: string;
    contentSource: string;
    sourceName: string;
    articleUrl: string;
    publishedAt?: string;
  }): string {
    const sourceMaterial = story.articleText
      ? `Article text: ${story.articleText.slice(0, 3000)}`
      : `Summary: ${story.rssSummary || story.summary}`;

    return `You are an AI content evaluator for Lensly, a publication for creators, founders, designers, developers, and AI builders.

Evaluate this story and return ONLY valid JSON. No markdown, no explanations.

Story:
- Title: ${story.title}
- Source: ${story.sourceName}
- Published: ${story.publishedAt || 'unknown'}
- URL: ${story.articleUrl}
${sourceMaterial}

Return JSON with these fields:
{
  "score": 0,
  "category": "",
  "reason": "",
  "shouldPost": false,
  "verifiedFacts": [],
  "primaryPost": {
    "type": "",
    "text": ""
  },
  "alternativePosts": [],
  "confidence": 0
}

Rules:
- score: 0-100 integer
- shouldPost: true only if score >= 65
- category: breaking_ai_news, model_update, tool_spotlight, creator_workflow, research_insight, business_observation, industry_trend, safety_ethics
- primaryPost.type: breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation, trend_reaction, meme_caption
- primaryPost.text: 120-240 chars preferred, max 280 chars, natural tone, strong hook, no corporate language, no hashtags, no emojis by default, no "Here is a post", no "game-changing" / "revolutionary" / "insane"
- alternativePosts: up to 2 alternative posts as array of {type, text}. Use types: breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation, trend_reaction, meme_caption
- Humor/light_humor/meme_caption: light, clever, relevant to AI creators/founders/developers/designers, understandable without context, not insulting, not fabricated, not based on fake quotes. OK for light topics only; avoid when topic is serious, sensitive, tragic, political, legal, safety-related, or about harm.
- confidence: 0-100 integer
- Do NOT invent product names, model names, prices, features, dates, quotes, benchmarks, stats, partnerships, funding amounts, or technical specs.`;
  }

  private parseResponse(text: string): EvaluationResult {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      const score = Math.max(0, Math.min(100, typeof parsed.score === 'number' ? parsed.score : 0));
      const confidence = Math.max(0, Math.min(100, typeof parsed.confidence === 'number' ? parsed.confidence : 0));
      const primaryPost = this.normalizePost(parsed.primaryPost);
      const alternativePosts = Array.isArray(parsed.alternativePosts)
        ? parsed.alternativePosts
            .map((p: any) => this.normalizePost(p))
            .filter((p: { type: string; text: string }) => p.type && p.text && !this.isNearDuplicate(primaryPost.text, p.text))
            .slice(0, 2)
        : [];
      const shouldPost = score >= 65 && primaryPost.text.length >= 100 && primaryPost.text.length <= 280;
      return {
        score,
        category: typeof parsed.category === 'string' ? parsed.category : '',
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        shouldPost,
        verifiedFacts: Array.isArray(parsed.verifiedFacts) ? parsed.verifiedFacts : [],
        primaryPost,
        alternativePosts,
        confidence,
      };
    } catch {
      return {
        score: 0,
        category: '',
        reason: 'Failed to parse Gemini response',
        shouldPost: false,
        verifiedFacts: [],
        primaryPost: { type: '', text: '' },
        alternativePosts: [],
        confidence: 0,
      };
    }
  }

  private normalizePost(post: any): { type: string; text: string } {
    const type = typeof post?.type === 'string' ? post.type : '';
    let text = typeof post?.text === 'string' ? post.text : '';
    if (text.length > 280) {
      text = text.slice(0, 277) + '...';
    }
    return { type, text };
  }

  private isNearDuplicate(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return false;
    const wordsA = na.split(' ');
    const wordsB = nb.split(' ');
    let matches = 0;
    for (const w of wordsA) {
      if (wordsB.includes(w)) matches++;
    }
    const similarity = matches / Math.max(wordsA.length, wordsB.length);
    return similarity > 0.75;
  }

  private isRetryableError(error: string): boolean {
    const retryablePatterns = ['429', '503', '500', 'rate limit', 'Rate limited', 'temporary'];
    return retryablePatterns.some((pattern) => error.toLowerCase().includes(pattern.toLowerCase()));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
