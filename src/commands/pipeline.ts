import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { Pipeline } from '../scheduler/pipeline';
import { RssCollector } from '../collectors/rss-collector';
import { GeminiEvaluator } from '../gemini/evaluator';
import { Story } from '../types';

function generateId(): string {
  return 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

async function runPipeline() {
  const config = loadConfig();

  if (!config.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  const pipeline = new Pipeline([new RssCollector()]);
  const ctx = await pipeline.run();

  const evaluator = new GeminiEvaluator(config.GEMINI_API_KEY, config.GEMINI_MODEL, config.GEMINI_REQUEST_DELAY_MS, config.GEMINI_MAX_RETRIES, config.MIN_STORY_SCORE, config.MAX_GEMINI_CALLS_PER_RUN);

  const unevaluated = ctx.stories.filter((s) => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending');

  let approvedCount = 0;

  for (const story of unevaluated) {
    if (evaluator.getCallCount() >= config.MAX_GEMINI_CALLS_PER_RUN) break;
    if (approvedCount >= config.MAX_APPROVED_POSTS_PER_RUN) break;

    const result = await evaluator.evaluateStory(story);

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
      ctx.stories[storyIndex].evaluationStatus = result.evaluationStatus === 'retry_pending' ? 'retry_pending' : 'evaluated';
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
      };
      await generatedPostStorage.append(post);
      approvedCount++;
    }
  }

  await storyStorage.writeAll(ctx.stories);
  console.log('Pipeline complete. Approved posts: ' + approvedCount + ', Gemini calls: ' + evaluator.getCallCount());
}

runPipeline().catch((err) => {
  console.error(err);
  process.exit(1);
});
