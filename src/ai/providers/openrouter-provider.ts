import { AIProvider, EvaluationResult } from './types';
import { RequestBudget } from '../request-budget';

export class OpenRouterProvider implements AIProvider {
  providerName = 'openrouter';
  private apiKey: string;
  private model: string;
  private siteUrl: string;
  private appName: string;
  private delayMs: number;
  private maxRetries: number;
  private maxCalls: number;
  private requestCount = 0;

  constructor(apiKey: string, model: string, siteUrl: string, appName: string, delayMs: number, maxRetries: number, maxCalls: number) {
    this.apiKey = apiKey;
    this.model = model;
    this.siteUrl = siteUrl;
    this.appName = appName;
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
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName,
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
        storyScore: 0,
        postQualityScore: 0,
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
storyScore: 0,
        postQualityScore: 0,
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

        const result = await this.callOpenRouter(prompt);
        const parsed = this.parseResponse(result);
        return { ...parsed, error: undefined, httpStatus: 200 };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        const statusMatch = lastError.match(/HTTP (\d+)/);
        httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;

        const isRetryable = this.isRetryableError(lastError);
        if (!isRetryable || attempt >= this.maxRetries - 1) {
          return {
storyScore: 0,
        postQualityScore: 0,
        category: '',
        reason: `OpenRouter error: ${lastError}`,
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
storyScore: 0,
        postQualityScore: 0,
        category: '',
        reason: `OpenRouter error after retries: ${lastError}`,
      shouldPost: false,
      verifiedFacts: [],
      primaryPost: { type: '', text: '' },
      alternativePosts: [],
      confidence: 0,
      error: lastError,
      httpStatus,
    };
  }

  private async callOpenRouter(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName,
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
        throw new Error('Empty response from OpenRouter');
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

    return `Evaluate this story for Lensly, a publication for creators, founders, designers, developers, and AI builders. Return ONLY valid JSON.

Story:
- Title: ${story.title}
- Source: ${story.sourceName}
- Published: ${story.publishedAt || 'unknown'}
- URL: ${story.articleUrl}
${sourceMaterial}

Return JSON:
{
  "storyScore": 0,
  "postQualityScore": 0,
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
- storyScore: 0-100 integer measuring the story's value to Lensly's audience. 80-100 = major launch/research/industry event. 65-79 = useful product update, workflow, creator opportunity, business use case, partnership, tool announcement, or industry observation. 50-64 = potentially useful but weak/incomplete. Below 50 = irrelevant, insufficient, no usable angle.
- postQualityScore: 0-100 integer measuring how well the primaryPost is written. 80-100 = sharp, specific, ready to publish. 65-79 = solid draft, minor cleanup needed. 50-64 = weak or generic. Below 50 = unusable draft.
- shouldPost: true only if storyScore >= 65. Post quality affects draft readiness, not story approval.
- category: breaking_ai_news, model_update, tool_spotlight, creator_workflow, research_insight, business_observation, industry_trend, safety_ethics
- primaryPost.type: breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation, trend_reaction, meme_caption. If the model returns a reasonable but unsupported label, map it: model_update/product_update/news -> breaking_news; business_update -> industry_observation; workflow -> practical_tip; opinion -> founder_take; question -> thoughtful_question; humor -> light_humor; meme -> meme_caption.
- primaryPost.text: 120-240 chars preferred, max 280 chars, natural tone, strong hook, no corporate language, no hashtags, no emojis by default, no "Here is a post", no "game-changing" / "revolutionary" / "insane"
- alternativePosts: up to 2 alternative posts as array of {type, text}. Use the same type set and mapping rules.
- Humor/light_humor/meme_caption: light, clever, relevant to AI creators/founders/developers/designers, understandable without context, not insulting, not fabricated, not based on fake quotes. OK for light topics only; avoid when topic is serious, sensitive, tragic, political, legal, or safety-related.
- Do NOT reject a story simply because it is corporate or promotional. Look for a useful Lensly angle. Ask whether the audience can learn, react, discuss, or apply something from it. A neutral business announcement can become an industry observation. A product launch can become a creator insight or thoughtful question. A partnership can become a founder take, comparison, or industry observation. Promotional language should be removed, not automatically treated as disqualifying.
- A story may be valuable even when the generated draft needs cleanup. storyScore reflects the story, postQualityScore reflects the draft.
- confidence: 0-100 integer
- Do NOT invent product names, model names, prices, features, dates, quotes, benchmarks, stats, partnerships, funding amounts, or technical specs.`;
  }

  private parseResponse(text: string): EvaluationResult {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      const storyScore = Math.max(0, Math.min(100, typeof parsed.storyScore === 'number' ? parsed.storyScore : (typeof parsed.score === 'number' ? parsed.score : 0)));
      const postQualityScore = Math.max(0, Math.min(100, typeof parsed.postQualityScore === 'number' ? parsed.postQualityScore : 0));
      const confidence = Math.max(0, Math.min(100, typeof parsed.confidence === 'number' ? parsed.confidence : 0));
      const primaryPost = this.normalizePost(parsed.primaryPost);
      const alternativePosts = Array.isArray(parsed.alternativePosts)
        ? parsed.alternativePosts
            .map((p: any) => this.normalizePost(p))
            .filter((p: { type: string; text: string }) => p.type && p.text && !this.isNearDuplicate(primaryPost.text, p.text))
            .slice(0, 2)
        : [];
      const shouldPost = storyScore >= 65;
      return {
        storyScore,
        postQualityScore,
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
        storyScore: 0,
        postQualityScore: 0,
        category: '',
        reason: 'Failed to parse OpenRouter response',
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
