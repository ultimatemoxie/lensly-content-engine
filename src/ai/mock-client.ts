import { AIClient, CompletionRequest, CompletionResponse } from './index';

export class MockAIClient implements AIClient {
  async complete({ prompt }: CompletionRequest): Promise<CompletionResponse> {
    return {
      text: `AI generated draft for: ${prompt}`,
    };
  }
}
