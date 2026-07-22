export type CompletionRequest = {
  prompt: string;
  model?: string;
};

export type CompletionResponse = {
  text: string;
};

export interface AIClient {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
