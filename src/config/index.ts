import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  AI_PROVIDER: string;
  AI_FALLBACK_ORDER: string;
  CEREBRAS_API_KEY: string | undefined;
  CEREBRAS_MODEL: string;
  GROQ_API_KEY: string | undefined;
  GROQ_MODEL: string;
  GEMINI_API_KEY: string | undefined;
  GEMINI_MODEL: string;
  GEMINI_REQUEST_DELAY_MS: number;
  GEMINI_MAX_RETRIES: number;
  MIN_STORY_SCORE: number;
  MAX_AI_CALLS_PER_RUN: number;
  AI_REQUEST_DELAY_MS: number;
  AI_MAX_RETRIES: number;
  MAX_APPROVED_POSTS_PER_RUN: number;
  X_PUBLISHING_ENABLED: string;
  X_DRY_RUN: string;
  X_AUTH_MODE: string;
  X_DUE_GRACE_MINUTES: string;
  X_CLIENT_ID: string | undefined;
  X_CLIENT_SECRET: string | undefined;
  X_ACCESS_TOKEN: string | undefined;
  X_REFRESH_TOKEN: string | undefined;
  X_ACCESS_TOKEN_EXPIRES_AT: string | undefined;
  X_USER_ID: string | undefined;
  MAX_POSTS_PER_RUN: string;
  STORAGE_PROVIDER: string;
  DATABASE_URL: string | undefined;
  DATABASE_SSL: string;
}

export function loadConfig(): EnvConfig {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: parseInt(process.env.PORT ?? '3000', 10),
    AI_PROVIDER: process.env.AI_PROVIDER || 'cerebras',
    AI_FALLBACK_ORDER: process.env.AI_FALLBACK_ORDER || 'groq,gemini',
    CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
    CEREBRAS_MODEL: process.env.CEREBRAS_MODEL || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    GEMINI_REQUEST_DELAY_MS: parseInt(process.env.GEMINI_REQUEST_DELAY_MS ?? '5000', 10),
    GEMINI_MAX_RETRIES: parseInt(process.env.GEMINI_MAX_RETRIES ?? '3', 10),
    MIN_STORY_SCORE: parseInt(process.env.MIN_STORY_SCORE ?? '65', 10),
    MAX_AI_CALLS_PER_RUN: parseInt(process.env.MAX_AI_CALLS_PER_RUN ?? '20', 10),
    AI_REQUEST_DELAY_MS: parseInt(process.env.AI_REQUEST_DELAY_MS ?? '3000', 10),
    AI_MAX_RETRIES: parseInt(process.env.AI_MAX_RETRIES ?? '3', 10),
    MAX_APPROVED_POSTS_PER_RUN: parseInt(process.env.MAX_APPROVED_POSTS_PER_RUN ?? '3', 10),
    X_PUBLISHING_ENABLED: process.env.X_PUBLISHING_ENABLED ?? 'false',
    X_DRY_RUN: process.env.X_DRY_RUN ?? 'true',
    X_AUTH_MODE: process.env.X_AUTH_MODE ?? 'oauth2',
    X_DUE_GRACE_MINUTES: process.env.X_DUE_GRACE_MINUTES ?? '30',
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_REFRESH_TOKEN: process.env.X_REFRESH_TOKEN,
    X_ACCESS_TOKEN_EXPIRES_AT: process.env.X_ACCESS_TOKEN_EXPIRES_AT,
    X_USER_ID: process.env.X_USER_ID,
    MAX_POSTS_PER_RUN: process.env.MAX_POSTS_PER_RUN ?? '1',
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER ?? 'json',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_SSL: process.env.DATABASE_SSL ?? 'true',
  };
}
