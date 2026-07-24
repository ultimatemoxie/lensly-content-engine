export interface StorageProvider {
  stories: StoryStorage;
  generatedPosts: GeneratedPostStorage;
  postQueue: PostQueueStorage;
  publishLogs: PublishLogStorage;
  exportBatches: ExportBatchStorage;
  providerRequestLogs: ProviderRequestLogStorage;
  tokenMetadata: TokenMetadataStorage;
}

export interface StoryStorage {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  insert(item: any): Promise<any>;
  update(id: string, item: any): Promise<any>;
  upsert(item: any): Promise<any>;
  delete(id: string): Promise<void>;
  queryByStatus(status: string): Promise<any[]>;
  queryByDateRange(start: Date, end: Date): Promise<any[]>;
  atomicStatusUpdate(id: string, status: string): Promise<any>;
  checkDuplicate(storyId: string, variation?: string): Promise<boolean>;
}

export interface GeneratedPostStorage {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  insert(item: any): Promise<any>;
  update(id: string, item: any): Promise<any>;
  upsert(item: any): Promise<any>;
  delete(id: string): Promise<void>;
  queryByStatus(status: string): Promise<any[]>;
  queryByDateRange(start: Date, end: Date): Promise<any[]>;
  checkDuplicate(storyId: string, variation?: string): Promise<boolean>;
}

export interface PostQueueStorage {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  insert(item: any): Promise<any>;
  update(id: string, item: any): Promise<any>;
  upsert(item: any): Promise<any>;
  delete(id: string): Promise<void>;
  queryByStatus(status: string): Promise<any[]>;
  queryByDateRange(start: Date, end: Date): Promise<any[]>;
  atomicStatusUpdate(id: string, status: string): Promise<any>;
  checkDuplicate(generatedPostId: string): Promise<boolean>;
}

export interface PublishLogStorage {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  insert(item: any): Promise<any>;
  update(id: string, item: any): Promise<any>;
  upsert(item: any): Promise<any>;
  delete(id: string): Promise<void>;
  queryByDateRange(start: Date, end: Date): Promise<any[]>;
  checkDuplicate(queueItemId: string, mode: string): Promise<boolean>;
}

export interface ExportBatchStorage {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  insert(item: any): Promise<any>;
  update(id: string, item: any): Promise<any>;
  upsert(item: any): Promise<any>;
  delete(id: string): Promise<void>;
  queryByDateRange(start: Date, end: Date): Promise<any[]>;
  checkDuplicate(queueItemId: string, batchId: string): Promise<boolean>;
}

export interface ProviderRequestLogStorage {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  insert(item: any): Promise<any>;
  update(id: string, item: any): Promise<any>;
  upsert(item: any): Promise<any>;
  delete(id: string): Promise<void>;
  queryByDateRange(start: Date, end: Date): Promise<any[]>;
}

export interface TokenMetadataStorage {
  findAll(): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  insert(item: any): Promise<any>;
  update(id: string, item: any): Promise<any>;
  upsert(item: any): Promise<any>;
  delete(id: string): Promise<void>;
}
