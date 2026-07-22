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
        storyScore: 0,
        postQualityScore: 0,
        category: '',
        reason: 'Max Gemini calls reached',
        shouldPost: false,
        verifiedFacts: [],
        primaryPost: { type: '', text: '' },
        alternativePosts: [],
        confidence: 0,
        evaluationStatus: 'retry_pending',
        error: 'Max Gemini calls reached',
      };
    }

    if (story.contentSource === 'insufficient') {
      return {
        storyScore: 0,
        postQualityScore: 0,
        category: '',
        reason: 'Insufficient source material',
        shouldPost: false,
        verifiedFacts: [],
        primaryPost: { type: '', text: '' },
        alternativePosts: [],
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
          storyScore: 0,
          postQualityScore: 0,
          category: '',
          reason: `Article fetch failed: ${fetchError}`,
          shouldPost: false,
          verifiedFacts: [],
          primaryPost: { type: '', text: '' },
          alternativePosts: [],
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
            storyScore: 0,
            postQualityScore: 0,
            category: '',
            reason: `Gemini error: ${lastError}`,
            shouldPost: false,
            verifiedFacts: [],
            primaryPost: { type: '', text: '' },
            alternativePosts: [],
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
      storyScore: 0,
      postQualityScore: 0,
      category: '',
      reason: `Gemini error after retries: ${lastError}`,
      shouldPost: false,
      verifiedFacts: [],
      primaryPost: { type: '', text: '' },
      alternativePosts: [],
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
  "storyScore": 0,
  "postQualityScore": 0,
  "category": "",
  "reason": "",
  "shouldPost": false,
  "verifiedFacts": [
    {
      "claim": "",
      "sourceEvidence": ""
    }
  ],
  "primaryPost": {
    "type": "",
    "text": "",
    "hookStrength": 0,
    "clarity": 0,
    "usefulness": 0,
    "originality": 0,
    "factualGrounding": 0,
    "naturalVoice": 0,
    "overallPostQuality": 0
  },
  "alternativePosts": [
    {
      "type": "",
      "text": "",
      "hookStrength": 0,
      "clarity": 0,
      "usefulness": 0,
      "originality": 0,
      "factualGrounding": 0,
      "naturalVoice": 0,
      "overallPostQuality": 0
    }
  ],
  "confidence": 0
}

Rules:
- storyScore: 0-100 integer measuring the story's value to Lensly's audience. 80-100 = major launch/research/industry event. 65-79 = useful product update, workflow, creator opportunity, business use case, partnership, tool announcement, or industry observation. 50-64 = potentially useful but weak/incomplete. Below 50 = irrelevant, insufficient, no usable angle.
- postQualityScore: 0-100 integer measuring how well the primaryPost is written. 80-100 = sharp, specific, ready to publish. 65-79 = solid draft, minor cleanup needed. 50-64 = weak or generic. Below 50 = unusable draft.
- shouldPost: true only if storyScore >= 65. Post quality affects draft readiness, not story approval.
- category: one of [breaking_ai_news, model_update, tool_spotlight, creator_workflow, research_insight, business_observation, industry_trend, safety_ethics]
- primaryPost.type: breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation, trend_reaction, meme_caption
- verifiedFacts: array of objects with "claim" and "sourceEvidence". Every concrete claim in primaryPost.text and alternativePosts.text must have an entry. "sourceEvidence" must be a verbatim substring from the provided source material above. If a claim cannot be matched to the source, do NOT include it in the post text.
- primaryPost.text: 100-240 chars preferred, max 280 chars. Lead with the implication, tension, usefulness, or surprising detail — never just rewrite the headline. Use short, natural sentences. Sound like a sharp AI media account. Give creators, founders, designers, developers, or marketers a reason to care. Avoid: "This blog post explores", "announces", "discussing latest research and trends", "is a notable shift", vague commentary, unnecessary company praise, "helps organizations" without saying how. If the post could apply to almost any AI story, rewrite it with a specific angle.
- primaryPost quality rubric: hookStrength, clarity, usefulness, originality, factualGrounding, naturalVoice, overallPostQuality — all 0-100 integers.
- alternativePosts: up to 2 alternative posts as array of {type, text, hookStrength, clarity, usefulness, originality, factualGrounding, naturalVoice, overallPostQuality}. Each alternative MUST use a genuinely different angle from the primary. Primary = factual news, insight, or tool angle. Alternative 1 = creator insight, practical tip, founder take, comparison, or question. Alternative 2 = light humor, meme caption, or trend reaction when safe and relevant. Reject alternatives with high similarity to the primary.
- Humor/light_humor/meme_caption: light, clever, relevant to AI creators/founders/developers/designers, understandable without context, not insulting, not fabricated, not based on fake quotes. OK for light topics only; avoid when topic is serious, sensitive, tragic, political, legal, safety-related, or about harm.
- Do NOT reject a story simply because it is corporate or promotional. Look for a useful Lensly angle. Ask whether the audience can learn, react, discuss, or apply something from it. A neutral business announcement can become an industry observation. A product launch can become a creator insight or thoughtful question. A partnership can become a founder take, comparison, or industry observation. Promotional language should be removed, not automatically treated as disqualifying.
- A story may be valuable even when the generated draft needs cleanup. storyScore reflects the story, postQualityScore reflects the draft.
- confidence: 0-100 integer
- Do NOT invent product names, model names, prices, features, dates, quotes, benchmarks, stats, partnerships, funding amounts, or technical specs.`;
}

function parseEvaluation(text: string, minScore: number): EvaluationResult {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const storyScore = typeof parsed.storyScore === 'number' ? parsed.storyScore : (typeof parsed.score === 'number' ? parsed.score : 0);
    const postQualityScore = Math.max(0, Math.min(100, typeof parsed.postQualityScore === 'number' ? parsed.postQualityScore : 0));
    const confidence = Math.max(0, Math.min(100, typeof parsed.confidence === 'number' ? parsed.confidence : 0));
    const primaryPost = normalizePost(parsed.primaryPost);
    const alternativePosts = Array.isArray(parsed.alternativePosts)
      ? parsed.alternativePosts
          .map((p: any) => normalizePost(p))
          .filter((p: { type: string; text: string }) => p.type && p.text && !isNearDuplicate(primaryPost.text, p.text))
          .slice(0, 2)
      : [];
    const shouldPost = storyScore >= minScore && !!primaryPost.text && primaryPost.text.length <= 280;
    const verifiedFacts: Array<{ claim: string; sourceEvidence: string }> = Array.isArray(parsed.verifiedFacts)
      ? parsed.verifiedFacts.filter((f: any) => typeof f?.claim === 'string' && typeof f?.sourceEvidence === 'string').slice(0, 20)
      : [];
    return {
      storyScore,
      postQualityScore,
      category: typeof parsed.category === 'string' ? parsed.category : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      shouldPost,
      verifiedFacts,
      primaryPost,
      alternativePosts,
      confidence,
    };
  } catch {
    return {
      storyScore: 0,
      postQualityScore: 0,
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

function normalizePost(post: any): { type: string; text: string } {
  const type = typeof post?.type === 'string' ? post.type : '';
  let text = typeof post?.text === 'string' ? post.text : '';
  if (text.length > 280) {
    text = text.slice(0, 277) + '...';
  }
  return { type, text };
}

function isNearDuplicate(a: string, b: string): boolean {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
