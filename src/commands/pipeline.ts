import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { Pipeline } from '../scheduler/pipeline';
import { RssCollector } from '../collectors/rss-collector';
import { ProviderFactory } from '../ai/provider-factory';
import { Story } from '../types';

function generateId(): string {
  return 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

async function runPipeline() {
  const config = loadConfig();
  const primary = await ProviderFactory.createPrimary();
  if (!primary) {
    console.error('Failed to initialize AI provider. Check your configuration.');
    process.exit(1);
  }

  const fallbacks = await ProviderFactory.createFallbacks();

  const pipeline = new Pipeline([new RssCollector()]);
  const ctx = await pipeline.run();

  const unevaluated = ctx.stories.filter((s) => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending');

  let approvedCount = 0;
  let totalAiRequests = 0;
  let totalRetries = 0;
  let totalFallbackCalls = 0;

  for (const story of unevaluated) {
    if (approvedCount >= config.MAX_APPROVED_POSTS_PER_RUN) {
      break;
    }

    const startCalls = primary.getRequestCount() + fallbacks.reduce((sum, f) => sum + f.getRequestCount(), 0);
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
      fallbacks
    );
    const endCalls = primary.getRequestCount() + fallbacks.reduce((sum, f) => sum + f.getRequestCount(), 0);
    totalAiRequests += endCalls - startCalls;
    if (result.error && provider !== primary.providerName) {
      totalFallbackCalls += endCalls - startCalls;
    }

    const storyIndex = ctx.stories.findIndex((s) => s.id === story.id);
    if (storyIndex >= 0) {
      ctx.stories[storyIndex].score = result.score;
      ctx.stories[storyIndex].category = result.category;
      ctx.stories[storyIndex].reason = result.reason;
      ctx.stories[storyIndex].shouldPost = result.shouldPost;
      ctx.stories[storyIndex].verifiedFacts = result.verifiedFacts;
      ctx.stories[storyIndex].postType = result.postType;
      ctx.stories[storyIndex].confidence = result.confidence;
      ctx.stories[storyIndex].lastEvaluatedAt = new Date().toISOString();
      ctx.stories[storyIndex].evaluationStatus = result.error ? 'retry_pending' : 'evaluated';
    }

    if (result.postText && result.shouldPost) {
      const post = {
        id: generateId(),
        storyId: story.id,
        text: result.postText,
        postType: result.postType,
        category: result.category,
        sourceName: story.sourceName,
        sourceUrl: story.sourceUrl,
        confidence: result.confidence,
        score: result.score,
        status: 'draft' as const,
        createdAt: new Date().toISOString(),
        aiProvider: provider,
        aiModel: model,
        isAlternative: false,
      };
      await generatedPostStorage.append(post);
      approvedCount++;
    }

    if (result.error) {
      totalRetries++;
    }
  }

  await storyStorage.writeAll(ctx.stories);
  console.log('Pipeline complete. Approved posts: ' + approvedCount + ', AI requests: ' + totalAiRequests + ', Retries: ' + totalRetries + ', Fallback calls: ' + totalFallbackCalls);
}

runPipeline().catch((err) => {
  console.error(err);
  process.exit(1);
});
