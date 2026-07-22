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
  const failedPermanent = stories.filter((s) => s.evaluationStatus === 'failed_permanent').length;
  const pending = stories.filter((s) => s.evaluationStatus === 'pending').length;

  const status: PipelineStatus = {
    totalStories: stories.length,
    evaluatedStories: evaluated,
    approvedPosts: approved,
    rejectedStories: rejected,
    retryPendingStories: retryPending,
    failedPermanentStories: failedPermanent,
    pendingStories: pending,
    totalHttpRequests: 0,
    initialRequests: 0,
    retryRequests: 0,
    fallbackRequests: 0,
    successfulProviderRequests: 0,
    failedProviderRequests: 0,
    remainingCandidates: pending + retryPending,
  };

  console.log('Lensly Pipeline Status');
  console.log('=====================');
  console.log('Total stories:       ' + status.totalStories);
  console.log('Evaluated stories:   ' + status.evaluatedStories);
  console.log('Approved posts:      ' + status.approvedPosts);
  console.log('Rejected stories:    ' + status.rejectedStories);
  console.log('Retry-pending:       ' + status.retryPendingStories);
  console.log('Failed-permanent:    ' + status.failedPermanentStories);
  console.log('Pending stories:     ' + status.pendingStories);
  console.log('Total HTTP requests: ' + status.totalHttpRequests);
  console.log('Initial requests:    ' + status.initialRequests);
  console.log('Retry requests:      ' + status.retryRequests);
  console.log('Fallback requests:   ' + status.fallbackRequests);
  console.log('Successful requests: ' + status.successfulProviderRequests);
  console.log('Failed requests:     ' + status.failedProviderRequests);
  console.log('Remaining candidates: ' + status.remainingCandidates);
}

status().catch((err) => {
  console.error(err);
  process.exit(1);
});
