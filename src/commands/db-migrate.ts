import { loadConfig } from '../config';
import { StorageFactory } from '../storage/storage-factory';

async function migrate() {
  const config = loadConfig();
  const providerType = config.STORAGE_PROVIDER || 'json';

  if (providerType === 'postgres') {
    console.log('Running PostgreSQL migrations...');
    const provider = await StorageFactory.createProvider();
    const db = (provider as any).stories['db'];
    if (!db) {
      console.error('PostgreSQL database connection not available.');
      process.exit(1);
    }
    try {
      const fs = await import('fs');
      const migrationSql = fs.readFileSync('migrations/001-create-tables.sql', 'utf-8');
      await db.query(migrationSql);
      console.log('Migrations completed successfully.');
    } catch (error) {
      console.error('Migration failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else {
    console.log('Storage provider is json. No migrations needed for local development.');
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
