import { loadConfig } from '../config';
import { StorageFactory } from '../storage/storage-factory';

async function dbStatus() {
  const config = loadConfig();
  const providerType = config.STORAGE_PROVIDER || 'json';

  console.log('Database Status');
  console.log('===============');
  console.log('Storage provider: ' + providerType);
  console.log('Database URL: ' + (config.DATABASE_URL ? '[REDACTED]' : 'not configured'));

  if (providerType === 'postgres') {
    if (!config.DATABASE_URL) {
      console.error('ERROR: DATABASE_URL is not configured.');
      process.exit(1);
    }

    try {
      const provider = await StorageFactory.createProvider();
      const db = (provider as any).stories['db'];
      if (!db) {
        console.error('PostgreSQL database connection not available.');
        process.exit(1);
      }

      const tables = ['stories', 'generated_posts', 'post_queue', 'publish_logs', 'buffer_export_batches', 'provider_request_logs', 'app_settings'];
      for (const table of tables) {
        const result = await db.query('SELECT COUNT(*) FROM ' + table);
        console.log(table + ': ' + result.rows[0].count + ' records');
      }
    } catch (error) {
      console.error('Database connection failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else {
    console.log('Local JSON storage active.');
    const fs = await import('fs');
    const files = ['data/stories.json', 'data/generated-posts.json', 'data/post-queue.json', 'data/publish-log.json', 'data/export-batches.json', 'data/provider-request-logs.json', 'data/token-metadata.json'];
    for (const file of files) {
      if (fs.existsSync(file)) {
        const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
        console.log(file + ': ' + content.length + ' records');
      } else {
        console.log(file + ': not found');
      }
    }
  }
}

dbStatus().catch((err) => {
  console.error(err);
  process.exit(1);
});
