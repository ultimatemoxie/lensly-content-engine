import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { ProviderFactory } from '../ai/provider-factory';
import { RequestBudget } from '../ai/request-budget';
import { PostValidator } from '../ai/post-validator';
import { PostGrader } from '../ai/post-grader';
import { HumorSafety } from '../ai/humor-safety';
import { QueueBuilder } from '../queue/queue-builder';
import { QueueValidator } from '../queue/queue-validator';
import { DateTime } from 'luxon';
import type { Story, GeneratedPost } from '../types';
import type { QueueItem } from '../queue/queue-validator';

const MAX_REWRITE_ATTEMPTS = 2;

function generateId(): string {
  return 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function isPermanentFailure(error: string | undefined): boolean {
  if (!error) return false;
  const permanentPatterns = ['Model ', 'not found in available models', 'not set', 'Invalid', '400', '401', '403', '404', 'unsupported'];
  return permanentPatterns.some((pattern) => error.toLowerCase().includes(pattern.toLowerCase()));
}

function getSourceText(story: Story): string {
  return story.articleText || story.rssSummary || story.summary || '';
}

function classifyStory(story: Story): string[] {
  const text = (story.title + ' ' + (story.summary || '') + ' ' + (story.rssSummary || '')).toLowerCase();
  const categories: string[] = [];
  if (/\b(product|model|launch|release|gemini|galaxy|android|openai|chatgpt|project camellia)\b/.test(text)) categories.push('product_model');
  if (/\b(creator|workflow|tip|side hustle|tools for|builders|makers|small business|program)\b/.test(text)) categories.push('creator_workflow');
  if (/\b(research|simulation|overview|paper|study|alignment|safety)\b/.test(text)) categories.push('research');
  if (/\b(industry|business|market|data center|alliance|energy|investment|community)\b/.test(text)) categories.push('industry');
  if (/\b(browser|app|hustle|trend|startup|marketing|competition|naming|bedtime|universal)\b/.test(text)) categories.push('humor_friendly');
  if (/\b(tool|spotlight|launches|introducing|updated|built|built|built|released|shipped|new feature|update)\b/.test(text)) categories.push('tool_insight');
  if (/\b(comparison|vs|versus|alternative|better|best|worst)\b/.test(text)) categories.push('comparison');
  if (/\b(question|think|opinion|should|why|how|what)\b/.test(text)) categories.push('thoughtful_question');
  if (categories.length === 0) categories.push('other');
  return categories;
}

function pickBalancedPending(stories: Story[], missingTypes: string[], maxPick: number, queueBefore: QueueItem[]): { story: Story; reason?: string }[] {
  const pending = stories.filter(s => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending');

  const sourceCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  for (const q of queueBefore) {
    sourceCounts[q.sourceName] = (sourceCounts[q.sourceName] || 0) + 1;
    const company = QueueValidator.extractCompany(q.text);
    if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
  }

  const scored = pending.map(s => {
    const cats = classifyStory(s);
    let typeScore = 0;
    for (const mt of missingTypes) {
      if (cats.includes(mt)) typeScore += 3;
    }

    const srcCount = sourceCounts[s.sourceName] || 0;
    const srcPenalty = srcCount >= 2 ? -10 : (srcCount >= 1 ? -3 : 0);
    const company = QueueValidator.extractCompany(s.title + ' ' + (s.summary || ''));
    const compCount = company ? (companyCounts[company] || 0) : 0;
    const compPenalty = compCount >= 2 ? -10 : (compCount >= 1 ? -3 : 0);

    const sourceDiversity = ['OpenAI Blog', 'Google AI Blog', 'Anthropic News', 'Hugging Face Blog', 'TechCrunch AI'];
    const srcBonus = sourceDiversity.includes(s.sourceName) ? 2 : 0;
    const textLen = (s.articleText || s.rssSummary || s.summary || '').length;
    const detailScore = Math.min(3, Math.floor(textLen / 500));
    const noveltyBonus = s.articleText && s.articleText.length > 1000 ? 2 : 0;

    const score = typeScore + srcBonus + detailScore + noveltyBonus + srcPenalty + compPenalty;

    const reason = srcPenalty < -5 ? 'source cap penalty' : (compPenalty < -5 ? 'company cap penalty' : 'high diversity score');
    return { story: s, score, reason: score > 0 ? reason : 'lower-ranked candidate' };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: { story: Story; reason?: string }[] = [];
  const usedSources = new Set<string>();
  const usedCompanies = new Set<string>();

  for (const item of scored) {
    if (selected.length >= maxPick) break;

    const company = QueueValidator.extractCompany(item.story.title + ' ' + (item.story.summary || ''));
    const srcCount = sourceCounts[item.story.sourceName] || 0;
    const compCount = company ? (companyCounts[company] || 0) : 0;

    if (srcCount >= 3) continue;
    if (company && compCount >= 3) continue;

    if (usedSources.size >= 3 && usedSources.has(item.story.sourceName)) continue;
    if (company && usedCompanies.size >= 2 && usedCompanies.has(company) && item.score < 5) continue;

    selected.push({ story: item.story, reason: item.reason });
    usedSources.add(item.story.sourceName);
    if (company) usedCompanies.add(company);
  }
  return selected;
}

function pickRewritableReviews(posts: GeneratedPost[], maxPick: number): GeneratedPost[] {
  return posts.filter(p => {
    if (p.status !== 'review') return false;
    const opq = p.qualityRubric?.overallPostQuality ?? 0;
    if (opq < 55) return false;
    const fg = p.qualityRubric?.factualGrounding ?? 0;
    if (fg < 70) return false;
    if (p.unsupportedClaims.length > 0 && fg < 90) return false;
    const rewriteCount = (p as any).rewriteCount ?? 0;
    if (rewriteCount >= MAX_REWRITE_ATTEMPTS) return false;
    return true;
  }).sort((a, b) => (b.qualityRubric?.overallPostQuality ?? 0) - (a.qualityRubric?.overallPostQuality ?? 0)).slice(0, maxPick);
}

async function callGroqRewrite(prompt: string, apiKey: string, model: string): Promise<{ rewrittenText: string; postType: string; verifiedFacts: Array<{ claim: string; sourceEvidence: string }>; reasonForChanges: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an AI content editor for Lensly. Return ONLY valid JSON. No markdown, no explanations.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Empty response from Groq');

    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      rewrittenText: typeof parsed.rewrittenText === 'string' ? parsed.rewrittenText : '',
      postType: typeof parsed.postType === 'string' ? parsed.postType : '',
      verifiedFacts: Array.isArray(parsed.verifiedFacts) ? parsed.verifiedFacts : [],
      reasonForChanges: typeof parsed.reasonForChanges === 'string' ? parsed.reasonForChanges : '',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRewritePrompt(post: GeneratedPost, story: Story): string {
  const sourceText = getSourceText(story);
  const facts: Array<{ claim: string; sourceEvidence: string }> = (post as any).verifiedFacts || [];
  return `Rewrite this Lensly post draft to improve its quality. Return ONLY valid JSON.

Original post:
- Type: ${post.postType}
- Text: ${post.text}
- Issues: ${(post.validationNotes || []).join('; ') || 'none'}

Source material:
${sourceText.slice(0, 3000)}

Verified facts to preserve:
${facts.map((f: any) => '- ' + f.claim + ' | ' + f.sourceEvidence).join('\n') || 'none'}

Return JSON:
{
  "rewrittenText": "",
  "postType": "",
  "verifiedFacts": [],
  "reasonForChanges": ""
}

Rules:
- rewrittenText: 100-240 chars preferred, max 280 chars. Improve hook, clarity, usefulness, originality, and natural voice. Keep short, natural sentences. Sound like a sharp AI media account. Avoid press-release language, "announces", "explores", "discussing latest research", "is a notable shift", "helps organizations" without saying how, vague commentary, unnecessary company praise.
- postType: one of [breaking_news, creator_insight, tool_spotlight, practical_tip, founder_take, research_insight, thoughtful_question, light_humor, comparison, industry_observation, trend_reaction, meme_caption]. If the model returns a reasonable but unsupported label, map it: model_update/product_update/news -> breaking_news; business_update -> industry_observation; workflow -> practical_tip; opinion -> founder_take; question -> thoughtful_question; humor -> light_humor; meme -> meme_caption.
- verifiedFacts: array of objects with "claim" and "sourceEvidence". Preserve verified facts from source material. Remove unsupported claims.
- reasonForChanges: brief explanation of what changed and why.
- Do NOT invent product names, model names, prices, features, dates, quotes, benchmarks, stats, partnerships, funding amounts, or technical specs.
- If humor/light_humor/meme_caption: keep light, clever, relevant to AI creators/founders/developers/designers, not insulting, not fabricated, not based on fake quotes. Avoid when topic is serious, sensitive, tragic, political, legal, safety-related, or about harm.`;
}

async function rewritePost(post: GeneratedPost, story: Story, budget: RequestBudget): Promise<{ rewrittenText: string; postType: string; verifiedFacts: Array<{ claim: string; sourceEvidence: string }>; reasonForChanges: string; error?: string }> {
  if (!budget.canRequest()) {
    return { rewrittenText: '', postType: '', verifiedFacts: [], reasonForChanges: '', error: 'Request budget exhausted' };
  }

  const config = loadConfig();
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    return { rewrittenText: '', postType: '', verifiedFacts: [], reasonForChanges: '', error: 'GROQ_API_KEY is not set' };
  }

  budget.recordInitial();

  try {
    const prompt = buildRewritePrompt(post, story);
    const result = await callGroqRewrite(prompt, apiKey, config.GROQ_MODEL || 'llama-3.1-8b-instant');
    return result;
  } catch (error) {
    budget.recordFailure();
    return {
      rewrittenText: '',
      postType: '',
      verifiedFacts: [],
      reasonForChanges: '',
      error: error instanceof Error ? error.message : 'Unknown rewrite error',
    };
  }
}

async function replenish() {
  const config = loadConfig();
  const primary = await ProviderFactory.createPrimary();
  if (!primary) {
    console.error('Failed to initialize AI provider. Check your configuration.');
    process.exit(1);
  }

  const fallbacks = await ProviderFactory.createFallbacks();
  const budget = new RequestBudget(config.MAX_AI_CALLS_PER_RUN);

  const stories = await storyStorage.readAll();
  const rawPosts = await generatedPostStorage.readAll();
  const posts: GeneratedPost[] = rawPosts as GeneratedPost[];
  const existingQueue = await readQueue();

  const queueBefore = existingQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() > DateTime.now().setZone('Africa/Lagos').toMillis());
  const slotsRemainingBefore = Math.max(0, 15 - queueBefore.length);

  const typeCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  for (const q of queueBefore) {
    typeCounts[q.postType] = (typeCounts[q.postType] || 0) + 1;
    sourceCounts[q.sourceName] = (sourceCounts[q.sourceName] || 0) + 1;
    const company = QueueValidator.extractCompany(q.text);
    if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
  }

  const missingTypes = Object.entries(MIX_TARGETS)
    .filter(([, target]) => (typeCounts[target] || 0) < target)
    .map(([target]) => target);

  const report = {
    queueSizeBefore: queueBefore.length,
    slotsRemainingBefore,
    reviewPostsConsidered: 0,
    reviewPostsRewritten: 0,
    rewritesPromotedToDraft: 0,
    rewritesStillInReview: 0,
    pendingStoriesSelected: 0,
    storiesEvaluated: 0,
    httpRequestsUsed: 0,
    retries: 0,
    approvedStories: 0,
    rejectedStories: 0,
    primaryPostsCreated: 0,
    alternativesCreated: 0,
    humorOrMemeCreated: 0,
    queueReadyPostsAdded: 0,
    finalQueueSize: 0,
    remainingMixGaps: [] as string[],
    remainingPendingStories: 0,
    remainingReviewPosts: 0,
    errors: [] as string[],
  };

  console.log('Replenishment Report');
  console.log('====================');
  console.log('Queue size before: ' + report.queueSizeBefore);
  console.log('Slots remaining: ' + report.slotsRemainingBefore);

  if (report.slotsRemainingBefore <= 0) {
    console.log('Queue is full. No replenishment needed.');
    return;
  }

  const rewritable = pickRewritableReviews(posts, Math.min(report.slotsRemainingBefore, budget.getRemaining()));
  report.reviewPostsConsidered = rewritable.length;
  console.log('Review posts considered: ' + report.reviewPostsConsidered);

  for (const post of rewritable) {
    if (!budget.canRequest()) break;
    const story = stories.find(s => s.id === post.storyId);
    if (!story) continue;

    console.log('Rewriting: ' + post.text.slice(0, 60) + '...');
    const rewriteResult = await rewritePost(post, story, budget);
    report.httpRequestsUsed++;

    if (rewriteResult.error) {
      report.errors.push('Rewrite failed for ' + post.id + ': ' + rewriteResult.error);
      continue;
    }

    const rewrittenText = rewriteResult.rewrittenText;
    const normalizedType = PostValidator.normalizePostType(rewriteResult.postType || post.postType);
    const validation = PostValidator.validate(rewrittenText, normalizedType, []);
    const grades = PostGrader.gradePost(rewrittenText, normalizedType, getSourceText(story), rewriteResult.verifiedFacts || []);
    const isHumorPost = normalizedType === 'light_humor' || normalizedType === 'meme_caption' || normalizedType === 'trend_reaction';
    const humorOk = !isHumorPost || HumorSafety.isHumorAppropriate(story.title, story.category || '');
    const humorTextOk = !isHumorPost || HumorSafety.validateHumorText(rewrittenText).valid;

    let factualValidationStatus: 'passed' | 'failed' | 'review' = 'passed';
    if (grades.unsupportedClaims.length > 0 && grades.factualGrounding < 90) {
      factualValidationStatus = 'failed';
    } else if (grades.factualGrounding < 90) {
      factualValidationStatus = 'review';
    }

    const isQueueReady = QueueValidator.isQueueReady({
      ...post,
      text: rewrittenText,
      postType: normalizedType,
      characterCount: rewrittenText.length,
      validationStatus: validation.valid ? 'valid' : 'review' as any,
      factualValidationStatus,
      qualityRubric: {
        hookStrength: grades.hookStrength,
        clarity: grades.clarity,
        usefulness: grades.usefulness,
        originality: grades.originality,
        factualGrounding: grades.factualGrounding,
        naturalVoice: grades.naturalVoice,
        overallPostQuality: grades.overallPostQuality,
      },
    }).eligible;

    const postIndex = posts.findIndex(p => p.id === post.id);
    if (postIndex >= 0) {
      posts[postIndex].text = rewrittenText;
      posts[postIndex].postType = normalizedType;
      posts[postIndex].validationStatus = validation.valid ? 'valid' : 'review';
      posts[postIndex].validationNotes = validation.issues.length > 0 ? validation.issues : validation.notes;
      posts[postIndex].factualValidationStatus = factualValidationStatus;
      posts[postIndex].unsupportedClaims = grades.unsupportedClaims;
      posts[postIndex].evidenceCount = grades.evidenceCount;
      posts[postIndex].qualityRubric = {
        hookStrength: grades.hookStrength,
        clarity: grades.clarity,
        usefulness: grades.usefulness,
        originality: grades.originality,
        factualGrounding: grades.factualGrounding,
        naturalVoice: grades.naturalVoice,
        overallPostQuality: grades.overallPostQuality,
      };
      posts[postIndex].status = isQueueReady && humorOk && humorTextOk ? 'draft' : 'review';
      (posts[postIndex] as any).rewriteCount = ((posts[postIndex] as any).rewriteCount || 0) + 1;
      (posts[postIndex] as any).lastRewriteAt = new Date().toISOString();
    }

    report.reviewPostsRewritten++;
    if (isQueueReady && humorOk && humorTextOk) {
      report.rewritesPromotedToDraft++;
    } else {
      report.rewritesStillInReview++;
    }

    console.log('  -> rewrite: ' + (isQueueReady ? 'promoted' : 'still review') + ' chars=' + rewrittenText.length + ' type=' + normalizedType + ' overall=' + grades.overallPostQuality);
  }

  await generatedPostStorage.writeAll(posts);

  const remainingSlots = Math.max(0, 15 - queueBefore.length - report.rewritesPromotedToDraft);
  if (remainingSlots > 0 && budget.canRequest()) {
    const pendingSelections = pickBalancedPending(stories, missingTypes, remainingSlots, queueBefore);
    report.pendingStoriesSelected = pendingSelections.length;
    console.log('Pending stories selected: ' + report.pendingStoriesSelected);

    for (const selection of pendingSelections) {
      const story = selection.story;
      if (!budget.canRequest()) break;

      console.log('Evaluating: ' + story.title);
      const attemptTracker: { attempts: Array<{ provider: string; model: string; result: 'success' | 'temporary_failure' | 'permanent_failure'; httpStatus: number | null; error?: string }> } = { attempts: [] };

      const { result, provider, model } = await ProviderFactory.evaluateWithFallback(
        {
          title: story.title,
          summary: story.summary,
          rssSummary: story.rssSummary,
          articleText: story.articleText,
          contentSource: story.contentSource,
          sourceName: story.sourceName,
          articleUrl: story.articleUrl,
          publishedAt: story.publishedAt,
        },
        primary,
        fallbacks,
        budget,
        attemptTracker
      );

      story.providerAttempts = attemptTracker.attempts;
      report.httpRequestsUsed += budget.getTotal() - report.httpRequestsUsed;
      if (result.error && !isPermanentFailure(result.error)) {
        report.retries++;
      }

      const normalizedType = PostValidator.normalizePostType(result.primaryPost?.type || '');
      story.storyScore = result.storyScore;
      story.postQualityScore = result.postQualityScore;
      story.category = result.category;
      story.reason = result.reason ? result.reason : (result.shouldPost ? 'Approved' : 'Insufficient quality');
      story.shouldPost = result.shouldPost;
      story.verifiedFacts = result.verifiedFacts;
      story.postType = normalizedType;
      story.confidence = result.confidence;
      story.lastEvaluatedAt = new Date().toISOString();
      story.evaluationStatus = result.error && isPermanentFailure(result.error) ? 'failed_permanent' : 'evaluated';

      if (result.error) {
        if (!isPermanentFailure(result.error)) {
          story.evaluationStatus = 'retry_pending';
          report.errors.push('Retry pending for ' + story.title + ': ' + result.error);
        } else {
          report.errors.push('Permanent failure for ' + story.title + ': ' + result.error);
        }
      } else if (result.primaryPost?.text && result.shouldPost) {
        report.storiesEvaluated++;
        report.approvedStories++;
        const sourceText = getSourceText(story);
        const primaryValidation = PostValidator.validate(result.primaryPost.text, normalizedType, []);
        let primaryText = result.primaryPost.text;
        if (!primaryValidation.valid) {
          const cleanup = result.primaryPost.text.replace(/game-changing/gi, '').replace(/revolutionary/gi, '').replace(/insane/gi, '').replace(/\s+/g, ' ').trim();
          const cleanupValidation = PostValidator.validate(cleanup, normalizedType, []);
          if (cleanupValidation.valid) {
            primaryText = cleanup;
          }
        }
        const primaryGrades = PostGrader.gradePost(primaryText, normalizedType, sourceText, result.verifiedFacts || []);
        const isHumorPost = normalizedType === 'light_humor' || normalizedType === 'meme_caption' || normalizedType === 'trend_reaction';
        const humorOk = !isHumorPost || HumorSafety.isHumorAppropriate(story.title, result.category || '');
        const humorTextOk = !isHumorPost || HumorSafety.validateHumorText(primaryText).valid;

        let factualValidationStatus: 'passed' | 'failed' | 'review' = 'passed';
        if (primaryGrades.unsupportedClaims.length > 0 && primaryGrades.factualGrounding < 90) {
          factualValidationStatus = 'failed';
        } else if (primaryGrades.factualGrounding < 90) {
          factualValidationStatus = 'review';
        }

        const isQueueReady = QueueValidator.isQueueReady({
          id: '',
          storyId: story.id,
          text: primaryText,
          postType: normalizedType,
          category: result.category,
          sourceName: story.sourceName,
          sourceUrl: story.sourceUrl,
          confidence: result.confidence,
          storyScore: result.storyScore,
          postQualityScore: result.postQualityScore,
          status: 'draft' as any,
          createdAt: new Date().toISOString(),
          aiProvider: provider,
          aiModel: model,
          isAlternative: false,
          characterCount: primaryText.length,
          validationStatus: primaryValidation.valid ? 'valid' : 'review' as any,
          validationNotes: primaryValidation.issues,
          factualValidationStatus,
          unsupportedClaims: primaryGrades.unsupportedClaims,
          evidenceCount: primaryGrades.evidenceCount,
          qualityRubric: {
            hookStrength: primaryGrades.hookStrength,
            clarity: primaryGrades.clarity,
            usefulness: primaryGrades.usefulness,
            originality: primaryGrades.originality,
            factualGrounding: primaryGrades.factualGrounding,
            naturalVoice: primaryGrades.naturalVoice,
            overallPostQuality: primaryGrades.overallPostQuality,
          },
        }).eligible;

        const newPost: GeneratedPost = {
          id: generateId(),
          storyId: story.id,
          text: primaryText,
          postType: normalizedType,
          category: result.category,
          sourceName: story.sourceName,
          sourceUrl: story.sourceUrl,
          confidence: result.confidence,
          storyScore: result.storyScore,
          postQualityScore: result.postQualityScore,
          status: isQueueReady && humorOk && humorTextOk ? 'draft' : 'review',
          createdAt: new Date().toISOString(),
          aiProvider: provider,
          aiModel: model,
          isAlternative: false,
          characterCount: primaryText.length,
          validationStatus: primaryValidation.valid ? 'valid' : 'review',
          validationNotes: primaryValidation.issues,
          factualValidationStatus,
          unsupportedClaims: primaryGrades.unsupportedClaims,
          evidenceCount: primaryGrades.evidenceCount,
          qualityRubric: {
            hookStrength: primaryGrades.hookStrength,
            clarity: primaryGrades.clarity,
            usefulness: primaryGrades.usefulness,
            originality: primaryGrades.originality,
            factualGrounding: primaryGrades.factualGrounding,
            naturalVoice: primaryGrades.naturalVoice,
            overallPostQuality: primaryGrades.overallPostQuality,
          },
        };
        await generatedPostStorage.append(newPost);
        report.primaryPostsCreated++;
        if (isQueueReady && humorOk && humorTextOk) {
          report.queueReadyPostsAdded++;
        }

        if (result.alternativePosts && result.alternativePosts.length > 0) {
          const existingTexts = [primaryText];
          for (const alt of result.alternativePosts) {
            const altType = PostValidator.normalizePostType(alt.type);
            const altValidation = PostValidator.validate(alt.text, altType, existingTexts);
            if (!altValidation.valid) continue;
            const altGrades = PostGrader.gradePost(alt.text, altType, sourceText, result.verifiedFacts || []);
            const isAltHumor = altType === 'light_humor' || altType === 'meme_caption' || altType === 'trend_reaction';
            const altHumorOk = !isAltHumor || HumorSafety.isHumorAppropriate(story.title, result.category || '');
            const altHumorTextOk = !isAltHumor || HumorSafety.validateHumorText(alt.text).valid;
            let altFactualStatus: 'passed' | 'failed' | 'review' = 'passed';
            if (altGrades.unsupportedClaims.length > 0 && altGrades.factualGrounding < 90) {
              altFactualStatus = 'failed';
            } else if (altGrades.factualGrounding < 90) {
              altFactualStatus = 'review';
            }
            const altQueueReady = QueueValidator.isQueueReady({
              ...newPost,
              text: alt.text,
              postType: altType,
              characterCount: alt.text.length,
              validationStatus: altValidation.valid ? 'valid' : 'review' as any,
              factualValidationStatus: altFactualStatus,
              qualityRubric: {
                hookStrength: altGrades.hookStrength,
                clarity: altGrades.clarity,
                usefulness: altGrades.usefulness,
                originality: altGrades.originality,
                factualGrounding: altGrades.factualGrounding,
                naturalVoice: altGrades.naturalVoice,
                overallPostQuality: altGrades.overallPostQuality,
              },
            }).eligible;

            const altPost: GeneratedPost = {
              id: generateId(),
              storyId: story.id,
              text: alt.text,
              postType: altType,
              category: result.category,
              sourceName: story.sourceName,
              sourceUrl: story.sourceUrl,
              confidence: result.confidence,
              storyScore: result.storyScore,
              postQualityScore: result.postQualityScore,
              status: altQueueReady && altHumorOk && altHumorTextOk ? 'draft' : 'review',
              createdAt: new Date().toISOString(),
              aiProvider: provider,
              aiModel: model,
              isAlternative: true,
              parentPostId: newPost.id,
              characterCount: alt.text.length,
              validationStatus: altValidation.valid ? 'valid' : 'review',
              validationNotes: altValidation.notes,
              factualValidationStatus: altFactualStatus,
              unsupportedClaims: altGrades.unsupportedClaims,
              evidenceCount: altGrades.evidenceCount,
              qualityRubric: {
                hookStrength: altGrades.hookStrength,
                clarity: altGrades.clarity,
                usefulness: altGrades.usefulness,
                originality: altGrades.originality,
                factualGrounding: altGrades.factualGrounding,
                naturalVoice: altGrades.naturalVoice,
                overallPostQuality: altGrades.overallPostQuality,
              },
            };
            await generatedPostStorage.append(altPost);
            report.alternativesCreated++;
            if (altQueueReady && altHumorOk && altHumorTextOk) {
              report.queueReadyPostsAdded++;
            }
            if (altType === 'light_humor' || altType === 'meme_caption' || altType === 'trend_reaction') {
              report.humorOrMemeCreated++;
            }
            existingTexts.push(alt.text);
          }
        }

        if (isHumorPost && (humorOk && humorTextOk)) {
          report.humorOrMemeCreated++;
        }
      } else if (result.error) {
        report.rejectedStories++;
      }
    }
  }

  await storyStorage.writeAll(stories);

  const updatedPosts = await generatedPostStorage.readAll();
  const { queue: rebuiltQueue } = QueueBuilder.buildQueue(updatedPosts as GeneratedPost[], existingQueue);
  await writeQueue(rebuiltQueue);

  const finalQueue = rebuiltQueue.filter(q => DateTime.fromISO(q.scheduledForUtc, { zone: 'utc' }).toMillis() > DateTime.now().setZone('Africa/Lagos').toMillis());
  report.finalQueueSize = finalQueue.length;

  const finalTypeCounts: Record<string, number> = {};
  const finalSourceCounts: Record<string, number> = {};
  const finalCompanyCounts: Record<string, number> = {};
  for (const q of finalQueue) {
    finalTypeCounts[q.postType] = (finalTypeCounts[q.postType] || 0) + 1;
    finalSourceCounts[q.sourceName] = (finalSourceCounts[q.sourceName] || 0) + 1;
    const company = QueueValidator.extractCompany(q.text);
    if (company) finalCompanyCounts[company] = (finalCompanyCounts[company] || 0) + 1;
  }
  report.remainingMixGaps = Object.entries(MIX_TARGETS)
    .filter(([type, target]) => (finalTypeCounts[type] || 0) < target)
    .map(([type, target]) => type + ' (need ' + (target - (finalTypeCounts[type] || 0)) + ')');

  const remainingPosts = await generatedPostStorage.readAll();
  report.remainingPendingStories = stories.filter(s => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending').length;
  report.remainingReviewPosts = (remainingPosts as GeneratedPost[]).filter(p => p.status === 'review').length;

  console.log('\nReplenishment Complete');
  console.log('======================');
  console.log('Queue size before: ' + report.queueSizeBefore);
  console.log('Slots remaining before: ' + report.slotsRemainingBefore);
  console.log('Review posts considered: ' + report.reviewPostsConsidered);
  console.log('Review posts rewritten: ' + report.reviewPostsRewritten);
  console.log('Rewrites promoted to draft: ' + report.rewritesPromotedToDraft);
  console.log('Rewrites still in review: ' + report.rewritesStillInReview);
  console.log('Pending stories selected: ' + report.pendingStoriesSelected);
  console.log('Stories evaluated: ' + report.storiesEvaluated);
  console.log('HTTP requests used: ' + report.httpRequestsUsed);
  console.log('Retries: ' + report.retries);
  console.log('Approved stories: ' + report.approvedStories);
  console.log('Rejected stories: ' + report.rejectedStories);
  console.log('Primary posts created: ' + report.primaryPostsCreated);
  console.log('Alternatives created: ' + report.alternativesCreated);
  console.log('Humor/meme content created: ' + report.humorOrMemeCreated);
  console.log('Queue-ready posts added: ' + report.queueReadyPostsAdded);
  console.log('Final queue size: ' + report.finalQueueSize);
  console.log('Remaining mix gaps: ' + (report.remainingMixGaps.length > 0 ? report.remainingMixGaps.join(', ') : 'none'));
  console.log('Remaining pending stories: ' + report.remainingPendingStories);
  console.log('Remaining review posts: ' + report.remainingReviewPosts);
  if (report.errors.length > 0) {
    console.log('Errors:');
    for (const e of report.errors) {
      console.log('  - ' + e);
    }
  }
}

async function readQueue(): Promise<QueueItem[]> {
  try {
    const fs = await import('fs');
    const data = fs.readFileSync('data/post-queue.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueueItem[]): Promise<void> {
  const fs = await import('fs');
  fs.writeFileSync('data/post-queue.json', JSON.stringify(queue, null, 2));
}

const MIX_TARGETS: Record<string, number> = {
  breaking_news: 3,
  creator_insight: 2,
  practical_tip: 2,
  light_humor: 2,
  founder_take: 2,
  industry_observation: 2,
  thoughtful_question: 1,
  comparison: 1,
  research_insight: 1,
};

replenish().catch((err) => {
  console.error(err);
  process.exit(1);
});
