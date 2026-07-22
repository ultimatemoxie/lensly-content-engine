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
  };
}
