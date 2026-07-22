import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  GEMINI_API_KEY: string | undefined;
  GEMINI_MODEL: string;
  GEMINI_REQUEST_DELAY_MS: number;
  GEMINI_MAX_RETRIES: number;
  MIN_STORY_SCORE: number;
  MAX_GEMINI_CALLS_PER_RUN: number;
  MAX_APPROVED_POSTS_PER_RUN: number;
}

export function loadConfig(): EnvConfig {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: parseInt(process.env.PORT ?? '3000', 10),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    GEMINI_REQUEST_DELAY_MS: parseInt(process.env.GEMINI_REQUEST_DELAY_MS ?? '5000', 10),
    GEMINI_MAX_RETRIES: parseInt(process.env.GEMINI_MAX_RETRIES ?? '3', 10),
    MIN_STORY_SCORE: parseInt(process.env.MIN_STORY_SCORE ?? '65', 10),
    MAX_GEMINI_CALLS_PER_RUN: parseInt(process.env.MAX_GEMINI_CALLS_PER_RUN ?? '5', 10),
    MAX_APPROVED_POSTS_PER_RUN: parseInt(process.env.MAX_APPROVED_POSTS_PER_RUN ?? '3', 10),
  };
}
