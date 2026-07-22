import { ProviderRouter, ProviderAttempt } from './provider-router';
import { AIProvider, EvaluationResult } from './providers/types';
import { RequestBudget } from './request-budget';

export class ProviderFactory extends ProviderRouter {
  static async evaluateWithFallback(
    story: Parameters<AIProvider['evaluateAndGenerate']>[0],
    primary: AIProvider,
    fallbacks: AIProvider[],
    budget?: RequestBudget,
    track?: { attempts: ProviderAttempt[] }
  ): Promise<{ result: EvaluationResult & { error?: string; httpStatus?: number | null }; provider: string; model: string }> {
    return ProviderRouter.evaluateWithFallback(story, primary, fallbacks, budget, track);
  }
}
