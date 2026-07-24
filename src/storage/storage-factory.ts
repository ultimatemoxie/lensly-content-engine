import { loadConfig } from '../config';
import { StorageProvider, StoryStorage, GeneratedPostStorage, PostQueueStorage, PublishLogStorage, ExportBatchStorage, ProviderRequestLogStorage, TokenMetadataStorage } from './storage-provider';
import { JsonStoryStorage, JsonGeneratedPostStorage, JsonPostQueueStorage, JsonPublishLogStorage, JsonExportBatchStorage, JsonProviderRequestLogStorage, JsonTokenMetadataStorage } from './json-storage-provider';
import { PostgresStoryStorage, PostgresGeneratedPostStorage, PostgresPostQueueStorage, PostgresPublishLogStorage, PostgresExportBatchStorage, PostgresProviderRequestLogStorage, PostgresTokenMetadataStorage } from './postgres-storage-provider';

let cachedProvider: StorageProvider | null = null;

export class StorageFactory {
  static async createProvider(): Promise<StorageProvider> {
    if (cachedProvider) {
      return cachedProvider;
    }

    const config = loadConfig();
    const providerType = config.STORAGE_PROVIDER || 'json';

    if (providerType === 'postgres') {
      const databaseUrl = config.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is required when STORAGE_PROVIDER=postgres');
      }

      let pgClient: any;
      try {
        const { Client } = await import('pg');
        pgClient = new Client({ connectionString: databaseUrl, ssl: config.DATABASE_SSL === 'true' });
        await pgClient.connect();
      } catch (error) {
        throw new Error('Failed to connect to PostgreSQL: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }

      cachedProvider = {
        stories: new PostgresStoryStorage(pgClient),
        generatedPosts: new PostgresGeneratedPostStorage(pgClient),
        postQueue: new PostgresPostQueueStorage(pgClient),
        publishLogs: new PostgresPublishLogStorage(pgClient),
        exportBatches: new PostgresExportBatchStorage(pgClient),
        providerRequestLogs: new PostgresProviderRequestLogStorage(pgClient),
        tokenMetadata: new PostgresTokenMetadataStorage(pgClient),
      };
    } else {
      cachedProvider = {
        stories: new JsonStoryStorage('data/stories.json'),
        generatedPosts: new JsonGeneratedPostStorage('data/generated-posts.json'),
        postQueue: new JsonPostQueueStorage('data/post-queue.json'),
        publishLogs: new JsonPublishLogStorage('data/publish-log.json'),
        exportBatches: new JsonExportBatchStorage('data/export-batches.json'),
        providerRequestLogs: new JsonProviderRequestLogStorage('data/provider-request-logs.json'),
        tokenMetadata: new JsonTokenMetadataStorage('data/token-metadata.json'),
      };
    }

    return cachedProvider;
  }

  static resetCache(): void {
    cachedProvider = null;
  }
}
