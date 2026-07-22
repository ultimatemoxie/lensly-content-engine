import { AIProvider, EvaluationResult } from './providers/types';
import { GroqProvider } from './providers/groq-provider';
import { CerebrasProvider } from './providers/cerebras-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { RequestBudget } from './request-budget';
import { loadConfig } from '../config';

export interface ProviderAttempt {
  provider: string;
  model: string;
  result: 'success' | 'temporary_failure' | 'permanent_failure';
  httpStatus: number | null;
  error?: string;
}

export class ProviderRouter {
  static async createPrimary(): Promise<AIProvider | null> {
    const config = loadConfig();
    const provider = (config as any).AI_PROVIDER || 'groq';

    if (provider === 'groq') {
      const apiKey = (process.env.GROQ_API_KEY || '').trim();
      if (!apiKey) {
        console.error('GROQ_API_KEY is not set but AI_PROVIDER=groq');
        return null;
      }
      return new GroqProvider(
        apiKey,
        process.env.GROQ_MODEL || '',
        parseInt(process.env.AI_REQUEST_DELAY_MS || '3000', 10),
        parseInt(process.env.AI_MAX_RETRIES || '3', 10),
        parseInt(process.env.MAX_AI_CALLS_PER_RUN || '20', 10)
      );
    }

    if (provider === 'cerebras') {
      const apiKey = (process.env.CEREBRAS_API_KEY || '').trim();
      if (!apiKey) {
        console.error('CEREBRAS_API_KEY is not set but AI_PROVIDER=cerebras');
        return null;
      }
      return new CerebrasProvider(
        apiKey,
        process.env.CEREBRAS_MODEL || '',
        parseInt(process.env.AI_REQUEST_DELAY_MS || '3000', 10),
        parseInt(process.env.AI_MAX_RETRIES || '3', 10),
        parseInt(process.env.MAX_AI_CALLS_PER_RUN || '20', 10)
      );
    }

    if (provider === 'gemini') {
      if (!config.GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not set but AI_PROVIDER=gemini');
        return null;
      }
      return new GeminiProvider(
        config.GEMINI_API_KEY,
        config.GEMINI_MODEL,
        config.GEMINI_REQUEST_DELAY_MS,
        config.GEMINI_MAX_RETRIES,
        config.MAX_AI_CALLS_PER_RUN
      );
    }

    console.error(`Unknown AI_PROVIDER: ${provider}`);
    return null;
  }

  static async createFallbacks(): Promise<AIProvider[]> {
    const config = loadConfig();
    const fallbackOrder = ((config as any).AI_FALLBACK_ORDER || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const providers: AIProvider[] = [];

    for (const name of fallbackOrder) {
      if (name === 'cerebras') {
        const apiKey = (process.env.CEREBRAS_API_KEY || '').trim();
        if (!apiKey) {
          console.warn('CEREBRAS_API_KEY not set. Skipping Cerebras fallback.');
          continue;
        }
        providers.push(new CerebrasProvider(
          apiKey,
          process.env.CEREBRAS_MODEL || '',
          parseInt(process.env.AI_REQUEST_DELAY_MS || '3000', 10),
          parseInt(process.env.AI_MAX_RETRIES || '3', 10),
          parseInt(process.env.MAX_AI_CALLS_PER_RUN || '20', 10)
        ));
      } else if (name === 'gemini') {
        if (!config.GEMINI_API_KEY) {
          console.warn('GEMINI_API_KEY not set. Skipping Gemini fallback.');
          continue;
        }
        providers.push(new GeminiProvider(
          config.GEMINI_API_KEY,
          config.GEMINI_MODEL,
          config.GEMINI_REQUEST_DELAY_MS,
          config.GEMINI_MAX_RETRIES,
          config.MAX_AI_CALLS_PER_RUN
        ));
      } else if (name === 'groq') {
        const apiKey = (process.env.GROQ_API_KEY || '').trim();
        if (!apiKey) {
          console.warn('GROQ_API_KEY not set. Skipping Groq fallback.');
          continue;
        }
        providers.push(new GroqProvider(
          apiKey,
          process.env.GROQ_MODEL || '',
          parseInt(process.env.AI_REQUEST_DELAY_MS || '3000', 10),
          parseInt(process.env.AI_MAX_RETRIES || '3', 10),
          parseInt(process.env.MAX_AI_CALLS_PER_RUN || '20', 10)
        ));
      } else {
        console.warn(`Unsupported fallback provider: ${name}`);
      }
    }

    return providers;
  }

  static async evaluateWithFallback(
    story: Parameters<AIProvider['evaluateAndGenerate']>[0],
    primary: AIProvider,
    fallbacks: AIProvider[],
    budget?: RequestBudget,
    track?: { attempts: ProviderAttempt[] }
  ): Promise<{ result: EvaluationResult & { error?: string; httpStatus?: number | null }; provider: string; model: string }> {
    let result = await primary.evaluateAndGenerate(story, budget);
    if (track) {
      track.attempts.push({
        provider: primary.providerName,
        model: primary.modelName,
        result: result.error ? 'permanent_failure' : 'success',
        httpStatus: result.httpStatus ?? null,
        error: result.error,
      });
    }

    if (result.error && fallbacks.length > 0) {
      for (const fallback of fallbacks) {
        result = await fallback.evaluateAndGenerate(story, budget);
        if (track) {
          track.attempts.push({
            provider: fallback.providerName,
            model: fallback.modelName,
            result: result.error ? 'permanent_failure' : 'success',
            httpStatus: result.httpStatus ?? null,
            error: result.error,
          });
        }
        if (!result.error) {
          if (budget) {
            budget.reclassifyInitialToFallback();
          }
          return {
            result,
            provider: fallback.providerName,
            model: fallback.modelName,
          };
        }
      }
    }

    return {
      result,
      provider: primary.providerName,
      model: primary.modelName,
    };
  }
}
