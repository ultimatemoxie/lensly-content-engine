import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { ProviderFactory } from '../ai/provider-factory';
import { RequestBudget } from '../ai/request-budget';
import { PostValidator } from '../ai/post-validator';
import { HumorSafety } from '../ai/humor-safety';
import { PostGrader } from '../ai/post-grader';
import { Story, EvaluationResult, GeneratedPost, PipelineStatus } from '../types';

function generateId(): string {
  return 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

const FALLBACK_REASONS = [
  'Insufficient source detail to create an accurate post.',
  'The story does not provide a strong Lensly audience angle.',
  'The topic is too repetitive compared with existing content.',
  'The source content is primarily promotional and lacks useful specifics.'
];

function pickFallbackReason(): string {
  return FALLBACK_REASONS[Math.floor(Math.random() * FALLBACK_REASONS.length)];
}

function isPermanentFailure(error: string | undefined): boolean {
  if (!error) return false;
  const permanentPatterns = ['Model ', 'not found in available models', 'not set', 'Invalid', '400', '401', '403', '404', 'unsupported'];
  return permanentPatterns.some((pattern) => error.toLowerCase().includes(pattern.toLowerCase()));
}

function classifyStory(story: Story): string[] {
  const text = (story.title + ' ' + (story.summary || '') + ' ' + (story.rssSummary || '')).toLowerCase();
  const categories: string[] = [];
  if (/\b(product|model|launch|release|gemini|galaxy|android|openai|chatgpt|project camellia)\b/.test(text)) categories.push('product_model');
  if (/\b(creator|workflow|tip|side hustle|tools for|builders|makers|small business|program)\b/.test(text)) categories.push('creator_workflow');
  if (/\b(research|simulation|overview|paper|study|alignment|safety)\b/.test(text)) categories.push('research');
  if (/\b(industry|business|market|data center|alliance|energy|investment|community)\b/.test(text)) categories.push('industry');
  if (/\b(browser|app|hustle|trend|startup|marketing|competition|naming|bedtime|universal)\b/.test(text)) categories.push('humor_friendly');
  if (categories.length === 0) categories.push('other');
  return categories;
}

function pickBalancedSample(stories: Story[]): Story[] {
  const targets = ['product_model', 'creator_workflow', 'research', 'industry', 'humor_friendly'];
  const selected: Story[] = [];
  const used = new Set<string>();

  for (const target of targets) {
    for (const s of stories) {
      if (used.has(s.id)) continue;
      const cats = classifyStory(s);
      if (cats.includes(target)) {
        selected.push(s);
        used.add(s.id);
        break;
      }
    }
  }

  if (selected.length < 5) {
    const remaining = stories.filter(s => !used.has(s.id));
    remaining.sort((a, b) => (b.articleText?.length || 0) - (a.articleText?.length || 0));
    for (const s of remaining) {
      if (selected.length >= 5) break;
      selected.push(s);
      used.add(s.id);
    }
  }

  return selected.slice(0, 5);
}

function getSourceText(story: Story): string {
  return story.articleText || story.rssSummary || story.summary || '';
}

async function evaluate() {
  const config = loadConfig();
  const primary = await ProviderFactory.createPrimary();
  if (!primary) {
    console.error('Failed to initialize AI provider. Check your configuration.');
    process.exit(1);
  }

  const fallbacks = await ProviderFactory.createFallbacks();

  const budget = new RequestBudget(config.MAX_AI_CALLS_PER_RUN);

  const stories = await storyStorage.readAll();
  const unevaluated = stories.filter((s) => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending');

  if (unevaluated.length === 0) {
    console.log('No unevaluated stories found.');
    return;
  }

  const sample = pickBalancedSample(unevaluated);

  let approvedCount = 0;
  let totalHttpRequests = 0;
  let initialRequests = 0;
  let retryRequests = 0;
  let fallbackRequests = 0;
  let successfulProviderRequests = 0;
  let failedProviderRequests = 0;
  let humorPosts = 0;
  let queueReadyCount = 0;
  let reviewCount = 0;

  const status: PipelineStatus = {
    totalStories: stories.length,
    evaluatedStories: 0,
    approvedPosts: 0,
    rejectedStories: 0,
    retryPendingStories: 0,
    failedPermanentStories: 0,
    pendingStories: 0,
    totalHttpRequests: 0,
    initialRequests: 0,
    retryRequests: 0,
    fallbackRequests: 0,
    successfulProviderRequests: 0,
    failedProviderRequests: 0,
    remainingCandidates: 0,
  };

  console.log('Selected sample:');
  for (const s of sample) {
    const cats = classifyStory(s);
    console.log(`  - ${s.title} [${s.sourceName}] (${cats.join(', ') || 'general'})`);
  }

  for (const story of sample) {
    if (approvedCount >= config.MAX_APPROVED_POSTS_PER_RUN) {
      break;
    }

    if (!budget.canRequest()) {
      story.evaluationStatus = 'pending';
      status.pendingStories++;
      console.log(`Skipping: ${story.title} (run limit reached)`);
      continue;
    }

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

    totalHttpRequests = budget.getTotal();
    initialRequests = budget.getInitial();
    retryRequests = budget.getRetries();
    fallbackRequests = budget.getFallbacks();

    if (!result.error) {
      successfulProviderRequests++;
    } else {
      failedProviderRequests++;
    }

    status.totalHttpRequests = totalHttpRequests;
    status.initialRequests = initialRequests;
    status.retryRequests = retryRequests;
    status.fallbackRequests = fallbackRequests;
    status.successfulProviderRequests = successfulProviderRequests;
    status.failedProviderRequests = failedProviderRequests;

    const normalizedType = PostValidator.normalizePostType(result.primaryPost?.type || '');

    story.storyScore = result.storyScore;
    story.postQualityScore = result.postQualityScore;
    story.category = result.category;
    story.reason = result.reason ? result.reason : (result.shouldPost ? 'Approved' : pickFallbackReason());
    story.shouldPost = result.shouldPost;
    story.verifiedFacts = result.verifiedFacts;
    story.postType = normalizedType;
    story.confidence = result.confidence;
    story.lastEvaluatedAt = new Date().toISOString();

    const humorOpportunity = HumorSafety.getHumorOpportunity(story);

    if (result.primaryPost?.text && result.shouldPost) {
      const humorOk = HumorSafety.isHumorAppropriate(story.title, story.category || '');
      const isHumorPost = normalizedType === 'light_humor' || normalizedType === 'meme_caption' || normalizedType === 'trend_reaction';

      if (isHumorPost && !humorOk) {
        story.evaluationStatus = 'evaluated';
        story.reason = 'Humor not appropriate for this topic';
        status.rejectedStories++;
        console.log('  -> REJECTED (humor not appropriate)');
        await storyStorage.writeAll(stories);
        continue;
      }

      let primaryText = result.primaryPost.text;
      let primaryValidation = PostValidator.validate(primaryText, normalizedType, []);
      if (!primaryValidation.valid) {
        const cleanup = tryCleanup(primaryText);
        const cleanupValidation = PostValidator.validate(cleanup, normalizedType, []);
        if (cleanupValidation.valid) {
          primaryText = cleanup;
          primaryValidation = cleanupValidation;
          primaryValidation.notes.push('Cleaned up invalid primary post');
        }
      }

      const sourceText = getSourceText(story);
      let primaryGrades = PostGrader.gradePost(primaryText, normalizedType, sourceText, result.verifiedFacts || []);
      if (primaryGrades.unsupportedClaims.length > 0) {
        const stripped = PostGrader.stripUnsupportedClaims(primaryText, primaryGrades.unsupportedClaims);
        const strippedValidation = PostValidator.validate(stripped, normalizedType, []);
        if (strippedValidation.valid && stripped.length >= 80) {
          primaryText = stripped;
          primaryGrades = PostGrader.gradePost(primaryText, normalizedType, sourceText, result.verifiedFacts || []);
          primaryValidation = strippedValidation;
        }
      }
      const isWeak = PostGrader.isWeakOrGeneric(primaryText, result.verifiedFacts || [], sourceText, normalizedType);

      let factualValidationStatus: 'passed' | 'failed' | 'review' = 'passed';
      if (primaryGrades.unsupportedClaims.length > 0 && primaryGrades.factualGrounding < 90) {
        factualValidationStatus = 'failed';
      } else if (primaryGrades.factualGrounding < 90) {
        factualValidationStatus = 'review';
      }

      if (isWeak) {
        factualValidationStatus = 'review';
        primaryValidation.issues.push('Post is generic or lacks meaningful verified detail');
      }

      const isQueueReady = PostGrader.isQueueReady(result.storyScore, primaryGrades, factualValidationStatus, primaryText.length);

      story.evaluationStatus = 'evaluated';
      status.evaluatedStories++;
      status.approvedPosts++;

      const primaryPost: GeneratedPost = {
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
        status: isQueueReady ? 'draft' : 'review',
        createdAt: new Date().toISOString(),
        aiProvider: provider,
        aiModel: model,
        isAlternative: false,
        characterCount: primaryValidation.characterCount,
        validationStatus: primaryValidation.valid ? 'valid' : 'review',
        validationNotes: primaryValidation.issues.length > 0 ? primaryValidation.issues : primaryValidation.notes,
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
      await generatedPostStorage.append(primaryPost);
      approvedCount++;
      if (isQueueReady) {
        queueReadyCount++;
      } else {
        reviewCount++;
      }

      console.log('  -> APPROVED PRIMARY (storyScore=' + result.storyScore + ', postQuality=' + result.postQualityScore + ', overall=' + primaryGrades.overallPostQuality + ', factual=' + primaryGrades.factualGrounding + ', type=' + normalizedType + ', status=' + primaryPost.status + ', provider=' + provider + ', chars=' + primaryValidation.characterCount + ')');
      console.log('     verifiedFacts=' + primaryGrades.evidenceCount + '/' + (result.verifiedFacts?.length || 0) + ' unsupportedClaims=' + primaryGrades.unsupportedClaims.length);
      console.log('     rubric: hook=' + primaryGrades.hookStrength + ' clarity=' + primaryGrades.clarity + ' usefulness=' + primaryGrades.usefulness + ' originality=' + primaryGrades.originality + ' voice=' + primaryGrades.naturalVoice);

      if (normalizedType === 'light_humor' || normalizedType === 'meme_caption' || normalizedType === 'trend_reaction') {
        humorPosts++;
      }

      if (result.alternativePosts && result.alternativePosts.length > 0) {
        const existingTexts = [primaryText];
        for (const alt of result.alternativePosts) {
          const altType = PostValidator.normalizePostType(alt.type);
          let altText = alt.text;
          const altValidation = PostValidator.validate(altText, altType, existingTexts);
          if (!altValidation.valid) {
            console.log('  -> SKIPPED ALTERNATIVE (validation failed: ' + altValidation.issues.join(', ') + ')');
            continue;
          }
          let altGrades = PostGrader.gradePost(altText, altType, sourceText, result.verifiedFacts || []);
          if (altGrades.unsupportedClaims.length > 0) {
            const altStripped = PostGrader.stripUnsupportedClaims(altText, altGrades.unsupportedClaims);
            const altStrippedValidation = PostValidator.validate(altStripped, altType, existingTexts);
            if (altStrippedValidation.valid && altStripped.length >= 80) {
              altText = altStripped;
              altGrades = PostGrader.gradePost(altText, altType, sourceText, result.verifiedFacts || []);
            }
          }
          const altWeak = PostGrader.isWeakOrGeneric(altText, result.verifiedFacts || [], sourceText, altType);
          let altFactualStatus: 'passed' | 'failed' | 'review' = 'passed';
          if (altGrades.unsupportedClaims.length > 0 && altGrades.factualGrounding < 90) {
            altFactualStatus = 'failed';
          } else if (altGrades.factualGrounding < 90) {
            altFactualStatus = 'review';
          }
          if (altWeak) {
            altFactualStatus = 'review';
          }
          const altQueueReady = PostGrader.isQueueReady(result.storyScore, altGrades, altFactualStatus, altText.length);

          const altPost: GeneratedPost = {
            id: generateId(),
            storyId: story.id,
            text: altText,
            postType: altType,
            category: result.category,
            sourceName: story.sourceName,
            sourceUrl: story.sourceUrl,
            confidence: result.confidence,
            storyScore: result.storyScore,
            postQualityScore: result.postQualityScore,
            status: altQueueReady ? 'draft' : 'review',
            createdAt: new Date().toISOString(),
            aiProvider: provider,
            aiModel: model,
            isAlternative: true,
            parentPostId: primaryPost.id,
            characterCount: altValidation.characterCount,
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
          existingTexts.push(altText);
          console.log('  -> ALTERNATIVE (type=' + altType + ', overall=' + altGrades.overallPostQuality + ', factual=' + altGrades.factualGrounding + ', chars=' + altValidation.characterCount + ', status=' + altPost.status + ')');
        }
      }

      console.log('     humorOpportunity: allowed=' + humorOpportunity.allowed + ' angle=' + humorOpportunity.suggestedAngle);
    } else {
      if (result.error && !isPermanentFailure(result.error)) {
        story.evaluationStatus = 'retry_pending';
        status.retryPendingStories++;
        console.log('  -> RETRY PENDING (storyScore=' + result.storyScore + ', reason=' + story.reason + ')');
      } else {
        story.evaluationStatus = isPermanentFailure(result.error) ? 'failed_permanent' : 'evaluated';
        status.rejectedStories++;
        console.log('  -> REJECTED (storyScore=' + result.storyScore + ', reason=' + story.reason + ')');
      }
    }
  }

  const remaining = stories.filter((s) => s.evaluationStatus === 'pending').length;
  status.remainingCandidates = remaining;
  status.totalStories = stories.length;

  await storyStorage.writeAll(stories);

  console.log('\nEvaluation Summary');
  console.log('==================');
  console.log('Total HTTP requests: ' + status.totalHttpRequests);
  console.log('Initial requests: ' + status.initialRequests);
  console.log('Retry requests: ' + status.retryRequests);
  console.log('Fallback requests: ' + status.fallbackRequests);
  console.log('Successful provider requests: ' + status.successfulProviderRequests);
  console.log('Failed provider requests: ' + status.failedProviderRequests);
  console.log('Approved stories: ' + status.approvedPosts);
  console.log('Rejected stories: ' + status.rejectedStories);
  console.log('Retry-pending stories: ' + status.retryPendingStories);
  console.log('Failed-permanent stories: ' + status.failedPermanentStories);
  console.log('Pending stories (not attempted): ' + status.pendingStories);
  console.log('Humor/meme posts: ' + humorPosts);
  console.log('Queue-ready posts: ' + queueReadyCount);
  console.log('Review posts: ' + reviewCount);
  console.log('Remaining candidates: ' + status.remainingCandidates);
}

function tryCleanup(text: string): string {
  return text
    .replace(/game-changing/gi, '')
    .replace(/revolutionary/gi, '')
    .replace(/insane/gi, '')
    .replace(/Here is a post/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

evaluate().catch((err) => {
  console.error(err);
  process.exit(1);
});
