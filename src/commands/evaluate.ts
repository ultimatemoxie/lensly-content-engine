import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { GeminiEvaluator } from '../gemini/evaluator';
import { Story } from '../types';

function generateId(): string {
  return 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

async function evaluate() {
  const config = loadConfig();

  if (!config.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  const stories = await storyStorage.readAll();
  const unevaluated = stories.filter((s) => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending');

  if (unevaluated.length === 0) {
    console.log('No unevaluated stories found.');
    return;
  }

  const evaluator = new GeminiEvaluator(config.GEMINI_API_KEY, config.GEMINI_MODEL, config.GEMINI_REQUEST_DELAY_MS, config.GEMINI_MAX_RETRIES, config.MIN_STORY_SCORE, config.MAX_GEMINI_CALLS_PER_RUN);

  let approvedCount = 0;

  for (const story of unevaluated) {
    if (evaluator.getCallCount() >= config.MAX_GEMINI_CALLS_PER_RUN) {
      console.log('Reached MAX_GEMINI_CALLS_PER_RUN (' + config.MAX_GEMINI_CALLS_PER_RUN + '). Stopping evaluation.');
      break;
    }

    if (approvedCount >= config.MAX_APPROVED_POSTS_PER_RUN) {
      break;
    }

    console.log('Evaluating: ' + story.title);
    const result = await evaluator.evaluateStory(story);

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
      console.log('  -> APPROVED (score=' + result.score + ', type=' + result.postType + ')');
    } else {
      story.evaluationStatus = result.evaluationStatus === 'retry_pending' ? 'retry_pending' : 'evaluated';
      console.log('  -> REJECTED (score=' + result.score + ', reason=' + result.reason + ')');
    }
  }

  await storyStorage.writeAll(stories);
  console.log('\nEvaluation complete. Approved posts: ' + approvedCount + ', Gemini calls: ' + evaluator.getCallCount());
}

evaluate().catch((err) => {
  console.error(err);
  process.exit(1);
});
