import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { ProviderFactory } from '../ai/provider-factory';
import { RequestBudget } from '../ai/request-budget';
import { Story, EvaluationResult, GeneratedPost, PipelineStatus } from '../types';

function generateId(): string {
  return 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function isPermanentFailure(error: string | undefined): boolean {
  if (!error) return false;
  const permanentPatterns = ['Model ', 'not found in available models', 'not set', 'Invalid', '400', '401', '403', '404', 'unsupported'];
  return permanentPatterns.some((pattern) => error.toLowerCase().includes(pattern.toLowerCase()));
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

  let approvedCount = 0;
  let totalHttpRequests = 0;
  let initialRequests = 0;
  let retryRequests = 0;
  let fallbackRequests = 0;
  let successfulProviderRequests = 0;
  let failedProviderRequests = 0;

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

  for (const story of unevaluated) {
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

    story.score = result.score;
    story.category = result.category;
    story.reason = result.reason;
    story.shouldPost = result.shouldPost;
    story.verifiedFacts = result.verifiedFacts;
    story.postType = result.postType;
    story.confidence = result.confidence;
    story.lastEvaluatedAt = new Date().toISOString();

    if (result.postText && result.shouldPost) {
      story.evaluationStatus = 'evaluated';
      status.evaluatedStories++;
      status.approvedPosts++;

      const primaryPost: GeneratedPost = {
        id: generateId(),
        storyId: story.id,
        text: result.postText,
        postType: result.postType,
        category: result.category,
        sourceName: story.sourceName,
        sourceUrl: story.sourceUrl,
        confidence: result.confidence,
        score: result.score,
        status: 'draft',
        createdAt: new Date().toISOString(),
        aiProvider: provider,
        aiModel: model,
        isAlternative: false,
      };
      await generatedPostStorage.append(primaryPost);
      approvedCount++;
      console.log('  -> APPROVED PRIMARY (score=' + result.score + ', type=' + result.postType + ', provider=' + provider + ', chars=' + result.postText.length + ')');

      if (result.alternativePosts && result.alternativePosts.length > 0) {
        for (const alt of result.alternativePosts) {
          const altPost: GeneratedPost = {
            id: generateId(),
            storyId: story.id,
            text: alt.text,
            postType: alt.type,
            category: result.category,
            sourceName: story.sourceName,
            sourceUrl: story.sourceUrl,
            confidence: result.confidence,
            score: result.score,
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiProvider: provider,
            aiModel: model,
            isAlternative: true,
            parentPostId: primaryPost.id,
          };
          await generatedPostStorage.append(altPost);
          console.log('  -> ALTERNATIVE (type=' + alt.type + ', chars=' + alt.text.length + ')');
        }
      }
    } else {
      if (result.error && !isPermanentFailure(result.error)) {
        story.evaluationStatus = 'retry_pending';
        status.retryPendingStories++;
        console.log('  -> RETRY PENDING (score=' + result.score + ', reason=' + result.reason + ')');
      } else {
        story.evaluationStatus = isPermanentFailure(result.error) ? 'failed_permanent' : 'evaluated';
        status.rejectedStories++;
        console.log('  -> REJECTED (score=' + result.score + ', reason=' + result.reason + ')');
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
  console.log('Remaining candidates: ' + status.remainingCandidates);
}

evaluate().catch((err) => {
  console.error(err);
  process.exit(1);
});
