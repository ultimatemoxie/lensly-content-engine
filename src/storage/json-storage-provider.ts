import { StoryStorage, GeneratedPostStorage, PostQueueStorage, PublishLogStorage, ExportBatchStorage, ProviderRequestLogStorage, TokenMetadataStorage } from './storage-provider';
import type { Story, GeneratedPost, PostQueueItem, PublishLog, ExportBatch, ProviderRequestLog, TokenMetadata } from '../types';

export class JsonStoryStorage implements StoryStorage {
  constructor(private filePath: string) {}

  async findAll(): Promise<Story[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async findById(id: string): Promise<Story | null> {
    const all = await this.findAll();
    return all.find(item => item.id === id) || null;
  }

  async insert(item: Story): Promise<Story> {
    const fs = await import('fs');
    const all = await this.findAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async update(id: string, item: Story): Promise<Story> {
    const fs = await import('fs');
    const all = await this.findAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) throw new Error('Story not found: ' + id);
    all[index] = item;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async upsert(item: Story): Promise<Story> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const all = await this.findAll();
    const filtered = all.filter(item => item.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }

  async queryByStatus(status: string): Promise<Story[]> {
    const all = await this.findAll();
    return all.filter(item => item.evaluationStatus === status);
  }

  async queryByDateRange(start: Date, end: Date): Promise<Story[]> {
    const all = await this.findAll();
    return all.filter(item => {
      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
      const collectedAt = new Date(item.collectedAt);
      return (publishedAt && publishedAt >= start && publishedAt <= end) ||
             (collectedAt >= start && collectedAt <= end);
    });
  }

  async atomicStatusUpdate(id: string, status: string): Promise<Story> {
    const item = await this.findById(id);
    if (!item) throw new Error('Story not found: ' + id);
    item.evaluationStatus = status as any;
    return this.update(id, item);
  }

  async checkDuplicate(storyId: string, variation?: string): Promise<boolean> {
    const all = await this.findAll();
    return all.some(item => item.id === storyId);
  }
}

export class JsonGeneratedPostStorage implements GeneratedPostStorage {
  constructor(private filePath: string) {}

  async findAll(): Promise<GeneratedPost[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async findById(id: string): Promise<GeneratedPost | null> {
    const all = await this.findAll();
    return all.find(item => item.id === id) || null;
  }

  async insert(item: GeneratedPost): Promise<GeneratedPost> {
    const fs = await import('fs');
    const all = await this.findAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async update(id: string, item: GeneratedPost): Promise<GeneratedPost> {
    const fs = await import('fs');
    const all = await this.findAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) throw new Error('GeneratedPost not found: ' + id);
    all[index] = item;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async upsert(item: GeneratedPost): Promise<GeneratedPost> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const all = await this.findAll();
    const filtered = all.filter(item => item.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }

  async queryByStatus(status: string): Promise<GeneratedPost[]> {
    const all = await this.findAll();
    return all.filter(item => item.status === status);
  }

  async queryByDateRange(start: Date, end: Date): Promise<GeneratedPost[]> {
    const all = await this.findAll();
    return all.filter(item => {
      const createdAt = new Date(item.createdAt);
      return createdAt >= start && createdAt <= end;
    });
  }

  async checkDuplicate(storyId: string, variation?: string): Promise<boolean> {
    const all = await this.findAll();
    return all.some(item => item.storyId === storyId && (!variation || item.parentPostId === variation));
  }
}

export class JsonPostQueueStorage implements PostQueueStorage {
  constructor(private filePath: string) {}

  async findAll(): Promise<PostQueueItem[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async findById(id: string): Promise<PostQueueItem | null> {
    const all = await this.findAll();
    return all.find(item => item.id === id) || null;
  }

  async insert(item: PostQueueItem): Promise<PostQueueItem> {
    const fs = await import('fs');
    const all = await this.findAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async update(id: string, item: PostQueueItem): Promise<PostQueueItem> {
    const fs = await import('fs');
    const all = await this.findAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) throw new Error('PostQueueItem not found: ' + id);
    all[index] = item;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async upsert(item: PostQueueItem): Promise<PostQueueItem> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const all = await this.findAll();
    const filtered = all.filter(item => item.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }

  async queryByStatus(status: string): Promise<PostQueueItem[]> {
    const all = await this.findAll();
    return all.filter(item => item.status === status);
  }

  async queryByDateRange(start: Date, end: Date): Promise<PostQueueItem[]> {
    const all = await this.findAll();
    return all.filter(item => {
      const scheduled = new Date(item.scheduledForUtc);
      return scheduled >= start && scheduled <= end;
    });
  }

  async atomicStatusUpdate(id: string, status: string): Promise<PostQueueItem> {
    const item = await this.findById(id);
    if (!item) throw new Error('PostQueueItem not found: ' + id);
    item.status = status as any;
    return this.update(id, item);
  }

  async checkDuplicate(generatedPostId: string): Promise<boolean> {
    const all = await this.findAll();
    return all.some(item => item.generatedPostId === generatedPostId);
  }
}

export class JsonPublishLogStorage implements PublishLogStorage {
  constructor(private filePath: string) {}

  async findAll(): Promise<PublishLog[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async findById(id: string): Promise<PublishLog | null> {
    const all = await this.findAll();
    return all.find(item => item.id === id) || null;
  }

  async insert(item: PublishLog): Promise<PublishLog> {
    const fs = await import('fs');
    const all = await this.findAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async update(id: string, item: PublishLog): Promise<PublishLog> {
    const fs = await import('fs');
    const all = await this.findAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) throw new Error('PublishLog not found: ' + id);
    all[index] = item;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async upsert(item: PublishLog): Promise<PublishLog> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const all = await this.findAll();
    const filtered = all.filter(item => item.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }

  async queryByDateRange(start: Date, end: Date): Promise<PublishLog[]> {
    const all = await this.findAll();
    return all.filter(item => {
      const attemptedAt = new Date(item.attemptedAt);
      return attemptedAt >= start && attemptedAt <= end;
    });
  }

  async checkDuplicate(queueItemId: string, mode: string): Promise<boolean> {
    const all = await this.findAll();
    return all.some(item => item.queueItemId === queueItemId && item.mode === mode);
  }
}

export class JsonExportBatchStorage implements ExportBatchStorage {
  constructor(private filePath: string) {}

  async findAll(): Promise<ExportBatch[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async findById(id: string): Promise<ExportBatch | null> {
    const all = await this.findAll();
    return all.find(item => item.id === id) || null;
  }

  async insert(item: ExportBatch): Promise<ExportBatch> {
    const fs = await import('fs');
    const all = await this.findAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async update(id: string, item: ExportBatch): Promise<ExportBatch> {
    const fs = await import('fs');
    const all = await this.findAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) throw new Error('ExportBatch not found: ' + id);
    all[index] = item;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async upsert(item: ExportBatch): Promise<ExportBatch> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const all = await this.findAll();
    const filtered = all.filter(item => item.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }

  async queryByDateRange(start: Date, end: Date): Promise<ExportBatch[]> {
    const all = await this.findAll();
    return all.filter(item => {
      const createdAt = new Date(item.createdAt);
      return createdAt >= start && createdAt <= end;
    });
  }

  async checkDuplicate(queueItemId: string, batchId: string): Promise<boolean> {
    const all = await this.findAll();
    return all.some(item => item.queueItemId === queueItemId && item.batchId === batchId);
  }
}

export class JsonProviderRequestLogStorage implements ProviderRequestLogStorage {
  constructor(private filePath: string) {}

  async findAll(): Promise<ProviderRequestLog[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async findById(id: string): Promise<ProviderRequestLog | null> {
    const all = await this.findAll();
    return all.find(item => item.id === id) || null;
  }

  async insert(item: ProviderRequestLog): Promise<ProviderRequestLog> {
    const fs = await import('fs');
    const all = await this.findAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async update(id: string, item: ProviderRequestLog): Promise<ProviderRequestLog> {
    const fs = await import('fs');
    const all = await this.findAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) throw new Error('ProviderRequestLog not found: ' + id);
    all[index] = item;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async upsert(item: ProviderRequestLog): Promise<ProviderRequestLog> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const all = await this.findAll();
    const filtered = all.filter(item => item.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }

  async queryByDateRange(start: Date, end: Date): Promise<ProviderRequestLog[]> {
    const all = await this.findAll();
    return all.filter(item => {
      const createdAt = new Date(item.createdAt);
      return createdAt >= start && createdAt <= end;
    });
  }
}

export class JsonTokenMetadataStorage implements TokenMetadataStorage {
  constructor(private filePath: string) {}

  async findAll(): Promise<TokenMetadata[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async findById(id: string): Promise<TokenMetadata | null> {
    const all = await this.findAll();
    return all.find(item => item.id === id) || null;
  }

  async insert(item: TokenMetadata): Promise<TokenMetadata> {
    const fs = await import('fs');
    const all = await this.findAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async update(id: string, item: TokenMetadata): Promise<TokenMetadata> {
    const fs = await import('fs');
    const all = await this.findAll();
    const index = all.findIndex(item => item.id === id);
    if (index === -1) throw new Error('TokenMetadata not found: ' + id);
    all[index] = item;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
    return item;
  }

  async upsert(item: TokenMetadata): Promise<TokenMetadata> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const all = await this.findAll();
    const filtered = all.filter(item => item.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }
}
