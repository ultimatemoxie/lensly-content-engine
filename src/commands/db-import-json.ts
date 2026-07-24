import { loadConfig } from '../config';
import { StorageFactory } from '../storage/storage-factory';
import type { Story, GeneratedPost, PostQueueItem, PublishLog, ExportBatch, ProviderRequestLog, TokenMetadata } from '../types';

interface ImportStats {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

async function importJson(dryRun = false) {
  const config = loadConfig();
  const providerType = config.STORAGE_PROVIDER || 'json';

  if (providerType !== 'postgres') {
    console.log('Import is only supported for PostgreSQL. Current provider: ' + providerType);
    return;
  }

  if (!config.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not configured.');
    process.exit(1);
  }

  console.log('Importing JSON data to PostgreSQL' + (dryRun ? ' (DRY RUN)' : '') + '...');

  const provider = await StorageFactory.createProvider();
  const fs = await import('fs');

  const stats: ImportStats = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  async function importStories() {
    if (!fs.existsSync('data/stories.json')) {
      console.log('No stories.json found, skipping stories import.');
      return;
    }
    const stories: Story[] = JSON.parse(fs.readFileSync('data/stories.json', 'utf-8'));
    for (const story of stories) {
      try {
        const existing = await provider.stories.findById(story.id);
        if (existing) {
          stats.updated++;
          continue;
        }
        if (!dryRun) {
          await provider.stories.insert(story);
        }
        stats.inserted++;
      } catch (error) {
        stats.failed++;
        console.error('Failed to import story ' + story.id + ':', error instanceof Error ? error.message : error);
      }
    }
  }

  async function importGeneratedPosts() {
    if (!fs.existsSync('data/generated-posts.json')) {
      console.log('No generated-posts.json found, skipping generated_posts import.');
      return;
    }
    const posts: GeneratedPost[] = JSON.parse(fs.readFileSync('data/generated-posts.json', 'utf-8'));
    for (const post of posts) {
      try {
        const existing = await provider.generatedPosts.findById(post.id);
        if (existing) {
          stats.updated++;
          continue;
        }
        if (!dryRun) {
          await provider.generatedPosts.insert(post);
        }
        stats.inserted++;
      } catch (error) {
        stats.failed++;
        console.error('Failed to import generated_post ' + post.id + ':', error instanceof Error ? error.message : error);
      }
    }
  }

  async function importPostQueue() {
    if (!fs.existsSync('data/post-queue.json')) {
      console.log('No post-queue.json found, skipping post_queue import.');
      return;
    }
    const queue: PostQueueItem[] = JSON.parse(fs.readFileSync('data/post-queue.json', 'utf-8'));
    for (const item of queue) {
      try {
        const existing = await provider.postQueue.findById(item.id);
        if (existing) {
          stats.updated++;
          continue;
        }
        if (!dryRun) {
          await provider.postQueue.insert(item);
        }
        stats.inserted++;
      } catch (error) {
        stats.failed++;
        console.error('Failed to import queue item ' + item.id + ':', error instanceof Error ? error.message : error);
      }
    }
  }

  async function importPublishLogs() {
    if (!fs.existsSync('data/publish-log.json')) {
      console.log('No publish-log.json found, skipping publish_logs import.');
      return;
    }
    const logs: PublishLog[] = JSON.parse(fs.readFileSync('data/publish-log.json', 'utf-8'));
    for (const log of logs) {
      try {
        const existing = await provider.publishLogs.findById(log.id);
        if (existing) {
          stats.updated++;
          continue;
        }
        if (!dryRun) {
          await provider.publishLogs.insert(log);
        }
        stats.inserted++;
      } catch (error) {
        stats.failed++;
        console.error('Failed to import publish log ' + log.id + ':', error instanceof Error ? error.message : error);
      }
    }
  }

  async function importExportBatches() {
    if (!fs.existsSync('data/export-batches.json')) {
      console.log('No export-batches.json found, skipping export_batches import.');
      return;
    }
    const batches: ExportBatch[] = JSON.parse(fs.readFileSync('data/export-batches.json', 'utf-8'));
    for (const batch of batches) {
      try {
        const existing = await provider.exportBatches.findById(batch.id);
        if (existing) {
          stats.updated++;
          continue;
        }
        if (!dryRun) {
          await provider.exportBatches.insert(batch);
        }
        stats.inserted++;
      } catch (error) {
        stats.failed++;
        console.error('Failed to import export batch ' + batch.id + ':', error instanceof Error ? error.message : error);
      }
    }
  }

  async function importProviderRequestLogs() {
    if (!fs.existsSync('data/provider-request-logs.json')) {
      console.log('No provider-request-logs.json found, skipping provider_request_logs import.');
      return;
    }
    const logs: ProviderRequestLog[] = JSON.parse(fs.readFileSync('data/provider-request-logs.json', 'utf-8'));
    for (const log of logs) {
      try {
        const existing = await provider.providerRequestLogs.findById(log.id);
        if (existing) {
          stats.updated++;
          continue;
        }
        if (!dryRun) {
          await provider.providerRequestLogs.insert(log);
        }
        stats.inserted++;
      } catch (error) {
        stats.failed++;
        console.error('Failed to import provider request log ' + log.id + ':', error instanceof Error ? error.message : error);
      }
    }
  }

  async function importTokenMetadata() {
    if (!fs.existsSync('data/token-metadata.json')) {
      console.log('No token-metadata.json found, skipping token metadata import.');
      return;
    }
    const tokens: TokenMetadata[] = JSON.parse(fs.readFileSync('data/token-metadata.json', 'utf-8'));
    for (const token of tokens) {
      try {
        const existing = await provider.tokenMetadata.findById(token.id);
        if (existing) {
          stats.updated++;
          continue;
        }
        if (!dryRun) {
          await provider.tokenMetadata.insert(token);
        }
        stats.inserted++;
      } catch (error) {
        stats.failed++;
        console.error('Failed to import token metadata ' + token.id + ':', error instanceof Error ? error.message : error);
      }
    }
  }

  await importStories();
  await importGeneratedPosts();
  await importPostQueue();
  await importPublishLogs();
  await importExportBatches();
  await importProviderRequestLogs();
  await importTokenMetadata();

  console.log('\nImport Summary:');
  console.log('  Inserted: ' + stats.inserted);
  console.log('  Updated: ' + stats.updated);
  console.log('  Skipped: ' + stats.skipped);
  console.log('  Failed: ' + stats.failed);

  if (dryRun) {
    console.log('\nDRY RUN - no data was actually imported.');
  }
}

const dryRun = process.argv.includes('--dry-run');
importJson(dryRun).catch((err) => {
  console.error(err);
  process.exit(1);
});
