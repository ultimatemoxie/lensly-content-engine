import { StoryStorage, GeneratedPostStorage, PostQueueStorage, PublishLogStorage, ExportBatchStorage, ProviderRequestLogStorage, TokenMetadataStorage } from './storage-provider';
import type { Story, GeneratedPost, PostQueueItem, PublishLog, ExportBatch, ProviderRequestLog, TokenMetadata } from '../types';

interface PgClientLike {
  query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount?: number }>;
}

export class PostgresStoryStorage implements StoryStorage {
  constructor(private db: PgClientLike, private tableName = 'stories') {}

  async findAll(): Promise<Story[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' ORDER BY collected_at DESC');
    return result.rows;
  }

  async findById(id: string): Promise<Story | null> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async insert(item: Story): Promise<Story> {
    const result = await this.db.query(
      'INSERT INTO ' + this.tableName + ' (id, title, summary, rss_summary, article_text, content_source, fetch_status, fetch_error, source_name, source_url, article_url, published_at, collected_at, evaluation_status, story_score, post_quality_score, category, reason, should_post, verified_facts, post_type, confidence, last_evaluated_at, provider_attempts) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *',
      [item.id, item.title, item.summary, item.rssSummary, item.articleText, item.contentSource, item.fetchStatus, item.fetchError || null, item.sourceName, item.sourceUrl, item.articleUrl, item.publishedAt || null, item.collectedAt, item.evaluationStatus, item.storyScore || null, item.postQualityScore || null, item.category || null, item.reason || null, item.shouldPost || null, item.verifiedFacts ? JSON.stringify(item.verifiedFacts) : null, item.postType || null, item.confidence || null, item.lastEvaluatedAt || null, item.providerAttempts ? JSON.stringify(item.providerAttempts) : null]
    );
    return result.rows[0];
  }

  async update(id: string, item: Story): Promise<Story> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET title = $2, summary = $3, rss_summary = $4, article_text = $5, content_source = $6, fetch_status = $7, fetch_error = $8, source_name = $9, source_url = $10, article_url = $11, published_at = $12, collected_at = $13, evaluation_status = $14, story_score = $15, post_quality_score = $16, category = $17, reason = $18, should_post = $19, verified_facts = $20, post_type = $21, confidence = $22, last_evaluated_at = $23, provider_attempts = $24 WHERE id = $1 RETURNING *',
      [id, item.title, item.summary, item.rssSummary, item.articleText, item.contentSource, item.fetchStatus, item.fetchError || null, item.sourceName, item.sourceUrl, item.articleUrl, item.publishedAt || null, item.collectedAt, item.evaluationStatus, item.storyScore || null, item.postQualityScore || null, item.category || null, item.reason || null, item.shouldPost || null, item.verifiedFacts ? JSON.stringify(item.verifiedFacts) : null, item.postType || null, item.confidence || null, item.lastEvaluatedAt || null, item.providerAttempts ? JSON.stringify(item.providerAttempts) : null]
    );
    return result.rows[0];
  }

  async upsert(item: Story): Promise<Story> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM ' + this.tableName + ' WHERE id = $1', [id]);
  }

  async queryByStatus(status: string): Promise<Story[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE evaluation_status = $1', [status]);
    return result.rows;
  }

  async queryByDateRange(start: Date, end: Date): Promise<Story[]> {
    const result = await this.db.query(
      'SELECT * FROM ' + this.tableName + ' WHERE (published_at BETWEEN $1 AND $2) OR (collected_at BETWEEN $1 AND $2)',
      [start.toISOString(), end.toISOString()]
    );
    return result.rows;
  }

  async atomicStatusUpdate(id: string, status: string): Promise<Story> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET evaluation_status = $2 WHERE id = $1 RETURNING *',
      [id, status]
    );
    return result.rows[0];
  }

  async checkDuplicate(storyId: string, variation?: string): Promise<boolean> {
    const result = await this.db.query('SELECT COUNT(*) FROM ' + this.tableName + ' WHERE id = $1', [storyId]);
    return parseInt(result.rows[0].count) > 0;
  }
}

export class PostgresGeneratedPostStorage implements GeneratedPostStorage {
  constructor(private db: PgClientLike, private tableName = 'generated_posts') {}

  async findAll(): Promise<GeneratedPost[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' ORDER BY created_at DESC');
    return result.rows;
  }

  async findById(id: string): Promise<GeneratedPost | null> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async insert(item: GeneratedPost): Promise<GeneratedPost> {
    const result = await this.db.query(
      'INSERT INTO ' + this.tableName + ' (id, story_id, text, post_type, category, source_name, source_url, confidence, story_score, post_quality_score, status, created_at, ai_provider, ai_model, is_alternative, parent_post_id, character_count, validation_status, validation_notes, factual_validation_status, unsupported_claims, evidence_count, quality_rubric) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING *',
      [item.id, item.storyId, item.text, item.postType, item.category, item.sourceName, item.sourceUrl, item.confidence, item.storyScore, item.postQualityScore, item.status, item.createdAt, item.aiProvider, item.aiModel, item.isAlternative, item.parentPostId || null, item.characterCount, item.validationStatus, JSON.stringify(item.validationNotes), item.factualValidationStatus, JSON.stringify(item.unsupportedClaims), item.evidenceCount, JSON.stringify(item.qualityRubric)]
    );
    return result.rows[0];
  }

  async update(id: string, item: GeneratedPost): Promise<GeneratedPost> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET story_id = $2, text = $3, post_type = $4, category = $5, source_name = $6, source_url = $7, confidence = $8, story_score = $9, post_quality_score = $10, status = $11, ai_provider = $12, ai_model = $13, is_alternative = $14, parent_post_id = $15, character_count = $16, validation_status = $17, validation_notes = $18, factual_validation_status = $19, unsupported_claims = $20, evidence_count = $21, quality_rubric = $22 WHERE id = $1 RETURNING *',
      [id, item.storyId, item.text, item.postType, item.category, item.sourceName, item.sourceUrl, item.confidence, item.storyScore, item.postQualityScore, item.status, item.aiProvider, item.aiModel, item.isAlternative, item.parentPostId || null, item.characterCount, item.validationStatus, JSON.stringify(item.validationNotes), item.factualValidationStatus, JSON.stringify(item.unsupportedClaims), item.evidenceCount, JSON.stringify(item.qualityRubric)]
    );
    return result.rows[0];
  }

  async upsert(item: GeneratedPost): Promise<GeneratedPost> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM ' + this.tableName + ' WHERE id = $1', [id]);
  }

  async queryByStatus(status: string): Promise<GeneratedPost[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE status = $1', [status]);
    return result.rows;
  }

  async queryByDateRange(start: Date, end: Date): Promise<GeneratedPost[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE created_at BETWEEN $1 AND $2', [start.toISOString(), end.toISOString()]);
    return result.rows;
  }

  async checkDuplicate(storyId: string, variation?: string): Promise<boolean> {
    const result = await this.db.query('SELECT COUNT(*) FROM ' + this.tableName + ' WHERE story_id = $1 AND parent_post_id = $2', [storyId, variation || null]);
    return parseInt(result.rows[0].count) > 0;
  }
}

export class PostgresPostQueueStorage implements PostQueueStorage {
  constructor(private db: PgClientLike, private tableName = 'post_queue') {}

  async findAll(): Promise<PostQueueItem[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' ORDER BY scheduled_for_utc ASC');
    return result.rows;
  }

  async findById(id: string): Promise<PostQueueItem | null> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async insert(item: PostQueueItem): Promise<PostQueueItem> {
    const result = await this.db.query(
      'INSERT INTO ' + this.tableName + ' (id, generated_post_id, story_id, text, post_type, category, source_name, source_url, ai_provider, ai_model, story_score, overall_post_quality, factual_grounding, scheduled_for_utc, scheduled_for_local, timezone, status, created_at, is_test, buffer_exported_at, buffer_export_batch_id, export_created_at_utc, export_created_at_local, next_refill_at_utc, next_refill_at_local) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25) RETURNING *',
      [item.id, item.generatedPostId, item.storyId, item.text, item.postType, item.category, item.sourceName, item.sourceUrl, item.aiProvider, item.aiModel, item.storyScore, item.overallPostQuality, item.factualGrounding, item.scheduledForUtc, item.scheduledForLocal, item.timezone, item.status, item.createdAt, item.isTest || null, item.bufferExportedAt || null, item.bufferExportBatchId || null, item.exportCreatedAtUtc || null, item.exportCreatedAtLocal || null, item.nextRefillAtUtc || null, item.nextRefillAtLocal || null]
    );
    return result.rows[0];
  }

  async update(id: string, item: PostQueueItem): Promise<PostQueueItem> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET generated_post_id = $2, story_id = $3, text = $4, post_type = $5, category = $6, source_name = $7, source_url = $8, ai_provider = $9, ai_model = $10, story_score = $11, overall_post_quality = $12, factual_grounding = $13, scheduled_for_utc = $14, scheduled_for_local = $15, timezone = $16, status = $17, is_test = $18, buffer_exported_at = $19, buffer_export_batch_id = $20, export_created_at_utc = $21, export_created_at_local = $22, next_refill_at_utc = $23, next_refill_at_local = $24 WHERE id = $1 RETURNING *',
      [id, item.generatedPostId, item.storyId, item.text, item.postType, item.category, item.sourceName, item.sourceUrl, item.aiProvider, item.aiModel, item.storyScore, item.overallPostQuality, item.factualGrounding, item.scheduledForUtc, item.scheduledForLocal, item.timezone, item.status, item.isTest || null, item.bufferExportedAt || null, item.bufferExportBatchId || null, item.exportCreatedAtUtc || null, item.exportCreatedAtLocal || null, item.nextRefillAtUtc || null, item.nextRefillAtLocal || null]
    );
    return result.rows[0];
  }

  async upsert(item: PostQueueItem): Promise<PostQueueItem> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM ' + this.tableName + ' WHERE id = $1', [id]);
  }

  async queryByStatus(status: string): Promise<PostQueueItem[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE status = $1', [status]);
    return result.rows;
  }

  async queryByDateRange(start: Date, end: Date): Promise<PostQueueItem[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE scheduled_for_utc BETWEEN $1 AND $2', [start.toISOString(), end.toISOString()]);
    return result.rows;
  }

  async atomicStatusUpdate(id: string, status: string): Promise<PostQueueItem> {
    const result = await this.db.query('UPDATE ' + this.tableName + ' SET status = $2 WHERE id = $1 RETURNING *', [id, status]);
    return result.rows[0];
  }

  async checkDuplicate(generatedPostId: string): Promise<boolean> {
    const result = await this.db.query('SELECT COUNT(*) FROM ' + this.tableName + ' WHERE generated_post_id = $1', [generatedPostId]);
    return parseInt(result.rows[0].count) > 0;
  }
}

export class PostgresPublishLogStorage implements PublishLogStorage {
  constructor(private db: PgClientLike, private tableName = 'publish_logs') {}

  async findAll(): Promise<PublishLog[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' ORDER BY attempted_at DESC');
    return result.rows;
  }

  async findById(id: string): Promise<PublishLog | null> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async insert(item: PublishLog): Promise<PublishLog> {
    const result = await this.db.query(
      'INSERT INTO ' + this.tableName + ' (id, queue_item_id, generated_post_id, mode, text, scheduled_for_utc, attempted_at, status, x_post_id, http_status, error_code, sanitized_error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [item.id, item.queueItemId, item.generatedPostId, item.mode, item.text, item.scheduledForUtc, item.attemptedAt, item.status, item.xPostId || null, item.httpStatus || null, item.errorCode || null, item.sanitizedError || null]
    );
    return result.rows[0];
  }

  async update(id: string, item: PublishLog): Promise<PublishLog> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET queue_item_id = $2, generated_post_id = $3, mode = $4, text = $5, scheduled_for_utc = $6, attempted_at = $7, status = $8, x_post_id = $9, http_status = $10, error_code = $11, sanitized_error = $12 WHERE id = $1 RETURNING *',
      [id, item.queueItemId, item.generatedPostId, item.mode, item.text, item.scheduledForUtc, item.attemptedAt, item.status, item.xPostId || null, item.httpStatus || null, item.errorCode || null, item.sanitizedError || null]
    );
    return result.rows[0];
  }

  async upsert(item: PublishLog): Promise<PublishLog> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM ' + this.tableName + ' WHERE id = $1', [id]);
  }

  async queryByDateRange(start: Date, end: Date): Promise<PublishLog[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE attempted_at BETWEEN $1 AND $2', [start.toISOString(), end.toISOString()]);
    return result.rows;
  }

  async checkDuplicate(queueItemId: string, mode: string): Promise<boolean> {
    const result = await this.db.query('SELECT COUNT(*) FROM ' + this.tableName + ' WHERE queue_item_id = $1 AND mode = $2', [queueItemId, mode]);
    return parseInt(result.rows[0].count) > 0;
  }
}

export class PostgresExportBatchStorage implements ExportBatchStorage {
  constructor(private db: PgClientLike, private tableName = 'buffer_export_batches') {}

  async findAll(): Promise<ExportBatch[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' ORDER BY created_at DESC');
    return result.rows;
  }

  async findById(id: string): Promise<ExportBatch | null> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async insert(item: ExportBatch): Promise<ExportBatch> {
    const result = await this.db.query(
      'INSERT INTO ' + this.tableName + ' (id, batch_id, queue_item_id, generated_post_id, text, scheduled_for_utc, scheduled_for_local, timezone, source_url, exported_at, next_refill_at_utc, next_refill_at_local, stale, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      [item.id, item.batchId, item.queueItemId, item.generatedPostId, item.text, item.scheduledForUtc, item.scheduledForLocal, item.timezone, item.sourceUrl, item.exportedAt, item.nextRefillAtUtc || null, item.nextRefillAtLocal || null, item.stale, item.createdAt]
    );
    return result.rows[0];
  }

  async update(id: string, item: ExportBatch): Promise<ExportBatch> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET batch_id = $2, queue_item_id = $3, generated_post_id = $4, text = $5, scheduled_for_utc = $6, scheduled_for_local = $7, timezone = $8, source_url = $9, exported_at = $10, next_refill_at_utc = $11, next_refill_at_local = $12, stale = $13 WHERE id = $1 RETURNING *',
      [id, item.batchId, item.queueItemId, item.generatedPostId, item.text, item.scheduledForUtc, item.scheduledForLocal, item.timezone, item.sourceUrl, item.exportedAt, item.nextRefillAtUtc || null, item.nextRefillAtLocal || null, item.stale]
    );
    return result.rows[0];
  }

  async upsert(item: ExportBatch): Promise<ExportBatch> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM ' + this.tableName + ' WHERE id = $1', [id]);
  }

  async queryByDateRange(start: Date, end: Date): Promise<ExportBatch[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE created_at BETWEEN $1 AND $2', [start.toISOString(), end.toISOString()]);
    return result.rows;
  }

  async checkDuplicate(queueItemId: string, batchId: string): Promise<boolean> {
    const result = await this.db.query('SELECT COUNT(*) FROM ' + this.tableName + ' WHERE queue_item_id = $1 AND batch_id = $2', [queueItemId, batchId]);
    return parseInt(result.rows[0].count) > 0;
  }
}

export class PostgresProviderRequestLogStorage implements ProviderRequestLogStorage {
  constructor(private db: PgClientLike, private tableName = 'provider_request_logs') {}

  async findAll(): Promise<ProviderRequestLog[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' ORDER BY created_at DESC');
    return result.rows;
  }

  async findById(id: string): Promise<ProviderRequestLog | null> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async insert(item: ProviderRequestLog): Promise<ProviderRequestLog> {
    const result = await this.db.query(
      'INSERT INTO ' + this.tableName + ' (id, story_id, provider, model, http_status, result, error, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [item.id, item.storyId, item.provider, item.model, item.httpStatus || null, item.result, item.error || null, item.createdAt]
    );
    return result.rows[0];
  }

  async update(id: string, item: ProviderRequestLog): Promise<ProviderRequestLog> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET story_id = $2, provider = $3, model = $4, http_status = $5, result = $6, error = $7 WHERE id = $1 RETURNING *',
      [id, item.storyId, item.provider, item.model, item.httpStatus || null, item.result, item.error || null]
    );
    return result.rows[0];
  }

  async upsert(item: ProviderRequestLog): Promise<ProviderRequestLog> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM ' + this.tableName + ' WHERE id = $1', [id]);
  }

  async queryByDateRange(start: Date, end: Date): Promise<ProviderRequestLog[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE created_at BETWEEN $1 AND $2', [start.toISOString(), end.toISOString()]);
    return result.rows;
  }
}

export class PostgresTokenMetadataStorage implements TokenMetadataStorage {
  constructor(private db: PgClientLike, private tableName = 'app_settings') {}

  async findAll(): Promise<any[]> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName);
    return result.rows;
  }

  async findById(id: string): Promise<any | null> {
    const result = await this.db.query('SELECT * FROM ' + this.tableName + ' WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async insert(item: any): Promise<any> {
    const result = await this.db.query(
      'INSERT INTO ' + this.tableName + ' (id, key, value, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [item.id, item.key, JSON.stringify(item.value), item.createdAt, item.updatedAt]
    );
    return result.rows[0];
  }

  async update(id: string, item: any): Promise<any> {
    const result = await this.db.query(
      'UPDATE ' + this.tableName + ' SET key = $2, value = $3, updated_at = $4 WHERE id = $1 RETURNING *',
      [id, item.key, JSON.stringify(item.value), item.updatedAt]
    );
    return result.rows[0];
  }

  async upsert(item: any): Promise<any> {
    const existing = await this.findById(item.id);
    if (existing) {
      return this.update(item.id, item);
    }
    return this.insert(item);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM ' + this.tableName + ' WHERE id = $1', [id]);
  }
}
