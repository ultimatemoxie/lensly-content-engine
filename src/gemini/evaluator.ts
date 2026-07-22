import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import { Story, EvaluationResult } from '../types';
import { fetchArticleText } from '../utils/article-extractor';

export class GeminiEvaluator {
  private genAI: GoogleGenerativeAI;
  private model: string;
  private delayMs: number;
  private maxRetries: number;
  private minScore: number;
  private maxCalls: number;
  private callCount = 0;

  constructor(apiKey: string, model: string, delayMs: number, maxRetries: number, minScore: number, maxCalls: number) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.delayMs = delayMs;
    this.maxRetries = maxRetries;
    this.minScore = minScore;
    this.maxCalls = maxCalls;
  }

  async evaluateStory(story: Story): Promise<EvaluationResult & { evaluationStatus: Story['evaluationStatus']; error?: string }> {
    if (this.callCount >= this.maxCalls) {
      return {
        score: 0,
        category: '',
        reason: 'Max Gemini calls reached',
        shouldPost: false,
        verifiedFacts: [],
        postType: '',
        confidence: 0,
        evaluationStatus: 'retry_pending',
        error: 'Max Gemini calls reached',
      };
    }

    if (story.contentSource === 'insufficient') {
      return {
        score: 0,
        category: '',
        reason: 'Insufficient source material',
        shouldPost: false,
        verifiedFacts: [],
        postType: '',
        confidence: 0,
        evaluationStatus: 'insufficient',
      };
    }

    let articleText = story.articleText;
    if (!articleText && story.articleUrl) {
      const { text, error: fetchError } = await fetchArticleText(story.articleUrl);
      articleText = text;
      if (fetchError && !text) {
        return {
          score: 0,
          category: '',
          reason: `Article fetch failed: ${fetchError}`,
          shouldPost: false,
          verifiedFacts: [],
          postType: '',
          confidence: 0,
          evaluationStatus: 'retry_pending',
          error: fetchError,
        };
      }
    }

    const prompt = buildPrompt(story, articleText);
    let attempt = 0;
    let lastError: string | undefined;

    while (attempt < this.maxRetries) {
      try {
        this.callCount++;
        const result = await this.callGemini(prompt);
        const parsed = parseEvaluation(result, this.minScore);
        return {
          ...parsed,
          evaluationStatus: parsed.shouldPost ? 'evaluated' : 'evaluated',
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        const isRetryable = lastError.includes('429') || lastError.includes('500') || lastError.includes('503');
        if (!isRetryable || attempt >= this.maxRetries - 1) {
          return {
            score: 0,
            category: '',
            reason: `Gemini error: ${lastError}`,
            shouldPost: false,
            verifiedFacts: [],
            postType: '',
            confidence: 0,
            evaluationStatus: 'retry_pending',
            error: lastError,
          };
        }
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        await sleep(backoffMs);
        attempt++;
      }
    }

    return {
      score: 0,
      category: '',
      reason: `Gemini error after retries: ${lastError}`,
      shouldPost: false,
      verifiedFacts: [],
      postType: '',
      confidence: 0,
      evaluationStatus: 'retry_pending',
      error: lastError,
    };
  }

  getCallCount(): number {
    return this.callCount;
  }

  private async callGemini(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.model });
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    await sleep(this.delayMs);
    return text;
  }
}

function buildPrompt(story: Story, articleText: string): string {
  const sourceMaterial = articleText
    ? `Article text: ${articleText.slice(0, 3000)}`
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
  "postType": "",
  "postText": "",
  "confidence": 0
}

Rules:
- score: 0-100 integer
- shouldPost: true only if score >= 65
- category: one of [breaking_ai_news, model_update, tool_spotlight, creator_workflow, research_insight, business_observation, industry_trend, safety_ethics]
- postType: one of [breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation]
- verifiedFacts: array of specific facts found in source material only
- postText: under 240 chars, natural tone, strong first line, no corporate language, no hashtags, no emojis, no "Here is a post", no "game-changing" / "revolutionary" / "insane". Include only when shouldPost is true.
- confidence: 0-100 integer
- Do NOT invent product names, model names, prices, features, dates, quotes, benchmarks, stats, partnerships, funding amounts, or technical specs.`;
}

function parseEvaluation(text: string, minScore: number): EvaluationResult {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    const shouldPost = score >= minScore && !!parsed.postText;
    return {
      score,
      category: typeof parsed.category === 'string' ? parsed.category : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      shouldPost,
      verifiedFacts: Array.isArray(parsed.verifiedFacts) ? parsed.verifiedFacts : [],
      postType: typeof parsed.postType === 'string' ? parsed.postType : '',
      postText: typeof parsed.postText === 'string' ? parsed.postText : '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    };
  } catch {
    return {
      score: 0,
      category: '',
      reason: 'Failed to parse Gemini response',
      shouldPost: false,
      verifiedFacts: [],
      postType: '',
      postText: '',
      confidence: 0,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
