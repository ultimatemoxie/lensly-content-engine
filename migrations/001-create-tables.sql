-- Lensly PostgreSQL Schema
-- Run with: psql -f migrations/001-create-tables.sql -U postgres -d lensly

BEGIN;

-- Stories table
CREATE TABLE IF NOT EXISTS stories (
  id VARCHAR(255) PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  rss_summary TEXT,
  article_text TEXT,
  content_source VARCHAR(50) NOT NULL DEFAULT 'insufficient',
  fetch_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  fetch_error TEXT,
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL,
  article_url TEXT,
  published_at TIMESTAMP,
  collected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  evaluation_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  story_score INTEGER,
  post_quality_score INTEGER,
  category VARCHAR(255),
  reason TEXT,
  should_post BOOLEAN,
  verified_facts JSONB,
  post_type VARCHAR(255),
  confidence NUMERIC(3,2),
  last_evaluated_at TIMESTAMP,
  provider_attempts JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_evaluation_status ON stories(evaluation_status);
CREATE INDEX IF NOT EXISTS idx_stories_collected_at ON stories(collected_at);

-- Generated posts table
CREATE TABLE IF NOT EXISTS generated_posts (
  id VARCHAR(255) PRIMARY KEY,
  story_id VARCHAR(255) NOT NULL REFERENCES stories(id),
  text TEXT NOT NULL,
  post_type VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL,
  story_score INTEGER NOT NULL,
  post_quality_score INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ai_provider VARCHAR(255) NOT NULL,
  ai_model VARCHAR(255) NOT NULL,
  is_alternative BOOLEAN NOT NULL DEFAULT FALSE,
  parent_post_id VARCHAR(255),
  character_count INTEGER NOT NULL,
  validation_status VARCHAR(50) NOT NULL,
  validation_notes JSONB,
  factual_validation_status VARCHAR(50) NOT NULL,
  unsupported_claims JSONB,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  quality_rubric JSONB NOT NULL,
  UNIQUE(story_id, parent_post_id)
);

CREATE INDEX IF NOT EXISTS idx_generated_posts_status ON generated_posts(status);
CREATE INDEX IF NOT EXISTS idx_generated_posts_story_id ON generated_posts(story_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_created_at ON generated_posts(created_at);

-- Post queue table
CREATE TABLE IF NOT EXISTS post_queue (
  id VARCHAR(255) PRIMARY KEY,
  generated_post_id VARCHAR(255) NOT NULL,
  story_id VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  post_type VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL,
  ai_provider VARCHAR(255) NOT NULL,
  ai_model VARCHAR(255) NOT NULL,
  story_score INTEGER NOT NULL,
  overall_post_quality NUMERIC(5,2) NOT NULL,
  factual_grounding NUMERIC(5,2) NOT NULL,
  scheduled_for_utc TIMESTAMP NOT NULL,
  scheduled_for_local TIMESTAMP NOT NULL,
  timezone VARCHAR(255) NOT NULL DEFAULT 'Africa/Lagos',
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  buffer_exported_at TIMESTAMP,
  buffer_export_batch_id VARCHAR(255),
  export_created_at_utc TIMESTAMP,
  export_created_at_local TIMESTAMP,
  next_refill_at_utc TIMESTAMP,
  next_refill_at_local TIMESTAMP,
  UNIQUE(generated_post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_queue_status ON post_queue(status);
CREATE INDEX IF NOT EXISTS idx_post_queue_scheduled_utc ON post_queue(scheduled_for_utc);
CREATE INDEX IF NOT EXISTS idx_post_queue_story_id ON post_queue(story_id);

-- Publish logs table
CREATE TABLE IF NOT EXISTS publish_logs (
  id VARCHAR(255) PRIMARY KEY,
  queue_item_id VARCHAR(255) NOT NULL,
  generated_post_id VARCHAR(255) NOT NULL,
  mode VARCHAR(50) NOT NULL,
  text TEXT NOT NULL,
  scheduled_for_utc TIMESTAMP NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(50) NOT NULL,
  x_post_id VARCHAR(255),
  http_status INTEGER,
  error_code VARCHAR(255),
  sanitized_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(queue_item_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_publish_logs_attempted_at ON publish_logs(attempted_at);

-- Buffer export batches table
CREATE TABLE IF NOT EXISTS buffer_export_batches (
  id VARCHAR(255) PRIMARY KEY,
  batch_id VARCHAR(255) NOT NULL,
  queue_item_id VARCHAR(255) NOT NULL,
  generated_post_id VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  scheduled_for_utc TIMESTAMP NOT NULL,
  scheduled_for_local TIMESTAMP NOT NULL,
  timezone VARCHAR(255) NOT NULL,
  source_url TEXT,
  exported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  next_refill_at_utc TIMESTAMP,
  next_refill_at_local TIMESTAMP,
  stale BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(queue_item_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_export_batches_batch_id ON buffer_export_batches(batch_id);
CREATE INDEX IF NOT EXISTS idx_export_batches_created_at ON buffer_export_batches(created_at);

-- Provider request logs table
CREATE TABLE IF NOT EXISTS provider_request_logs (
  id VARCHAR(255) PRIMARY KEY,
  story_id VARCHAR(255),
  provider VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  http_status INTEGER,
  result VARCHAR(50) NOT NULL,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_request_logs_story_id ON provider_request_logs(story_id);
CREATE INDEX IF NOT EXISTS idx_provider_request_logs_created_at ON provider_request_logs(created_at);

-- App settings table (for tokens and metadata)
CREATE TABLE IF NOT EXISTS app_settings (
  id VARCHAR(255) PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

COMMIT;
