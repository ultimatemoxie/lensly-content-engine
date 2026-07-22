import { loadConfig } from '../config';
import { storyStorage, generatedPostStorage } from '../storage';
import { PipelineStatus } from '../types';

async function status() {
  const stories = await storyStorage.readAll();
  const posts = await generatedPostStorage.readAll();

  const evaluated = stories.filter((s) => s.evaluationStatus === 'evaluated').length;
  const approved = posts.filter((p) => p.status === 'draft').length;
  const rejected = stories.filter((s) => s.evaluationStatus === 'evaluated' && !s.shouldPost).length;
  const retryPending = stories.filter((s) => s.evaluationStatus === 'retry_pending').length;
  const remaining = stories.filter((s) => s.evaluationStatus === 'pending' || s.evaluationStatus === 'retry_pending').length;

  const status: PipelineStatus = {
    totalStories: stories.length,
    evaluatedStories: evaluated,
    approvedPosts: approved,
    rejectedStories: rejected,
    retryPendingStories: retryPending,
    geminiCallsMade: 0,
    remainingCandidates: remaining,
  };

  console.log('Lensly Pipeline Status');
  console.log('=====================');
  console.log('Total stories:       ' + status.totalStories);
  console.log('Evaluated stories:   ' + status.evaluatedStories);
  console.log('Approved posts:      ' + status.approvedPosts);
  console.log('Rejected stories:    ' + status.rejectedStories);
  console.log('Retry-pending:       ' + status.retryPendingStories);
  console.log('Gemini calls made:   ' + status.geminiCallsMade);
  console.log('Remaining candidates: ' + status.remainingCandidates);
}

status().catch((err) => {
  console.error(err);
  process.exit(1);
});
