import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { ProviderFactory } from '../ai/provider-factory';
import { RequestBudget } from '../ai/request-budget';
import { PostValidator } from '../ai/post-validator';
import { HumorSafety } from '../ai/humor-safety';
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

function pickBalancedSample(stories: Story[]): Story[] {
  const groups: Record<string, Story[]> = {};
  for (const s of stories) {
    const key = s.sourceName || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }

  const selected: Story[] = [];
  const prioritySources = ['OpenAI Blog', 'Google AI Blog', 'Hugging Face Blog', 'TechCrunch AI'];
  for (const src of prioritySources) {
    const pool = groups[src] || [];
    if (pool.length > 0) {
      selected.push(pool[0]);
    }
  }

  if (selected.length < 5) {
    const remaining = stories.filter(s => !selected.includes(s));
    remaining.sort((a, b) => (b.articleText?.length || 0) - (a.articleText?.length || 0));
    for (const s of remaining) {
      if (selected.length >= 5) break;
      if (!selected.includes(s)) selected.push(s);
    }
  }

  return selected.slice(0, 5);
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
    console.log(`  - ${s.title} [${s.sourceName}]`);
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

    if (result.primaryPost?.text && result.shouldPost) {
      const humorOk = HumorSafety.isHumorAppropriate(story.title, story.category || '');
      const isHumorPost = normalizedType === 'light_humor' || normalizedType === 'meme_caption';

      if (isHumorPost && !humorOk) {
        story.evaluationStatus = 'evaluated';
        story.reason = 'Humor not appropriate for this topic';
        status.rejectedStories++;
        console.log('  -> REJECTED (humor not appropriate)');
        await storyStorage.writeAll(stories);
        continue;
      }

      let primaryValidation = PostValidator.validate(result.primaryPost.text, normalizedType, []);
      let primaryText = result.primaryPost.text;
      if (!primaryValidation.valid) {
        const cleanup = tryCleanup(primaryText);
        const cleanupValidation = PostValidator.validate(cleanup, normalizedType, []);
        if (cleanupValidation.valid) {
          primaryText = cleanup;
          primaryValidation = cleanupValidation;
          primaryValidation.notes.push('Cleaned up invalid primary post');
        }
      }

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
        score: result.storyScore,
        status: primaryValidation.valid ? 'draft' : 'review',
        createdAt: new Date().toISOString(),
        aiProvider: provider,
        aiModel: model,
        isAlternative: false,
        characterCount: primaryValidation.characterCount,
        validationStatus: primaryValidation.valid ? 'valid' : 'review',
        validationNotes: primaryValidation.issues.length > 0 ? primaryValidation.issues : primaryValidation.notes,
      };
      await generatedPostStorage.append(primaryPost);
      approvedCount++;
      console.log('  -> APPROVED PRIMARY (storyScore=' + result.storyScore + ', postQuality=' + result.postQualityScore + ', type=' + normalizedType + ', status=' + (primaryValidation.valid ? 'valid' : 'review') + ', provider=' + provider + ', chars=' + primaryValidation.characterCount + ')');

      if (normalizedType === 'light_humor' || normalizedType === 'meme_caption') {
        humorPosts++;
      }

      if (result.alternativePosts && result.alternativePosts.length > 0) {
        const existingTexts = [result.primaryPost.text];
        for (const alt of result.alternativePosts) {
          const altType = PostValidator.normalizePostType(alt.type);
          const altValidation = PostValidator.validate(alt.text, altType, existingTexts);
          if (!altValidation.valid) {
            console.log('  -> SKIPPED ALTERNATIVE (validation failed: ' + altValidation.issues.join(', ') + ')');
            continue;
          }
          const altPost: GeneratedPost = {
            id: generateId(),
            storyId: story.id,
            text: alt.text,
            postType: altType,
            category: result.category,
            sourceName: story.sourceName,
            sourceUrl: story.sourceUrl,
            confidence: result.confidence,
            score: result.storyScore,
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiProvider: provider,
            aiModel: model,
            isAlternative: true,
            parentPostId: primaryPost.id,
            characterCount: altValidation.characterCount,
            validationStatus: altValidation.valid ? 'valid' : 'review',
            validationNotes: altValidation.notes,
          };
          await generatedPostStorage.append(altPost);
          existingTexts.push(alt.text);
          console.log('  -> ALTERNATIVE (type=' + altType + ', chars=' + altValidation.characterCount + ')');
        }
      }
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
