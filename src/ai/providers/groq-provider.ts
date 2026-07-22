import { AIProvider, EvaluationResult } from './types';
import { RequestBudget } from '../request-budget';

export class GroqProvider implements AIProvider {
  providerName = 'groq';
  private apiKey: string;
  private model: string;
  private delayMs: number;
  private maxRetries: number;
  private maxCalls: number;
  private requestCount = 0;

  constructor(apiKey: string, model: string, delayMs: number, maxRetries: number, maxCalls: number) {
    this.apiKey = apiKey;
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
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (budget) budget.recordInitial();
      this.requestCount++;

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}`, httpStatus: response.status };
      }

      const data = await response.json() as any;
      const hasModel = data.data?.some((m: any) => m.id === this.model);
      if (!hasModel) {
        return { success: false, error: `Model ${this.model} not found in available models`, httpStatus: null };
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
        postType: '',
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
              postType: '',
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

        const result = await this.callGroq(prompt);
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
            reason: `Groq error: ${lastError}`,
            shouldPost: false,
            verifiedFacts: [],
            postType: '',
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
      reason: `Groq error after retries: ${lastError}`,
      shouldPost: false,
      verifiedFacts: [],
      postType: '',
      confidence: 0,
      error: lastError,
      httpStatus,
    };
  }

  private async callGroq(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an AI content evaluator for Lensly. Return ONLY valid JSON. No markdown, no explanations.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429 || response.status === 503) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
        if (waitMs > 0) {
          await this.sleep(waitMs);
          throw new Error(`Rate limited, retry after ${retryAfter}s`);
        }
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      }

      const data = await response.json() as any;
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) {
        throw new Error('Empty response from Groq');
      }

      await this.sleep(this.delayMs);
      return text;
    } finally {
      clearTimeout(timeoutId);
    }
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

    return `Evaluate this story and return ONLY valid JSON.

Story:
- Title: ${story.title}
- Source: ${story.sourceName}
- Published: ${story.publishedAt || 'unknown'}
- URL: ${story.articleUrl}
${sourceMaterial}

Return JSON:
{
  "score": 0,
  "category": "",
  "reason": "",
  "shouldPost": false,
  "verifiedFacts": [],
  "postType": "",
  "postText": "",
  "alternativePosts": [],
  "confidence": 0
}

Rules:
- score: 0-100 integer
- shouldPost: true only if score >= 65
- category: breaking_ai_news, model_update, tool_spotlight, creator_workflow, research_insight, business_observation, industry_trend, safety_ethics
- postType: breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation, trend_reaction, meme_caption
- postText: 120-240 chars preferred, max 280 chars, natural tone, strong hook, no corporate language, no hashtags, no emojis by default, no "Here is a post", no "game-changing" / "revolutionary" / "insane"
- alternativePosts: up to 2 alternative posts as array of {type, text}. Use types: breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation, trend_reaction, meme_caption
- Humor/light_humor/meme_caption: light, clever, relevant to AI creators/founders/developers/designers, understandable without context, not insulting, not fabricated, not based on fake quotes. OK for light topics only; avoid when topic is serious, sensitive, tragic, political, legal, or safety-related.
- confidence: 0-100 integer
- Do NOT invent facts.`;
  }

  private parseResponse(text: string): EvaluationResult {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      const score = Math.max(0, Math.min(100, typeof parsed.score === 'number' ? parsed.score : 0));
      const confidence = Math.max(0, Math.min(100, typeof parsed.confidence === 'number' ? parsed.confidence : 0));
      let postText = typeof parsed.postText === 'string' ? parsed.postText : '';
      if (postText.length > 280) {
        postText = postText.slice(0, 277) + '...';
      }
      const shouldPost = score >= 65 && postText.length >= 100 && postText.length <= 280;
      const alternativePosts = Array.isArray(parsed.alternativePosts)
        ? parsed.alternativePosts
            .filter((p: any) => p && typeof p.type === 'string' && typeof p.text === 'string')
            .slice(0, 2)
            .map((p: any) => ({
              type: p.type,
              text: p.text.length > 280 ? p.text.slice(0, 277) + '...' : p.text,
            }))
        : [];
      return {
        score,
        category: typeof parsed.category === 'string' ? parsed.category : '',
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        shouldPost,
        verifiedFacts: Array.isArray(parsed.verifiedFacts) ? parsed.verifiedFacts : [],
        postType: typeof parsed.postType === 'string' ? parsed.postType : '',
        postText,
        alternativePosts,
        confidence,
      };
    } catch {
      return {
        score: 0,
        category: '',
        reason: 'Failed to parse Groq response',
        shouldPost: false,
        verifiedFacts: [],
        postType: '',
        postText: '',
        confidence: 0,
      };
    }
  }

  private isRetryableError(error: string): boolean {
    const retryablePatterns = ['429', '503', '500', 'rate limit', 'Rate limited', 'temporary'];
    return retryablePatterns.some((pattern) => error.toLowerCase().includes(pattern.toLowerCase()));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
