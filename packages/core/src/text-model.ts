export const LLM_PROVIDERS = ['deepseek'] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type TextModelRequest = { system: string; user: string };

export interface TextModel {
  completeJson(request: TextModelRequest): Promise<string>;
}

export type TextModelErrorCode =
  | 'timeout'
  | 'request_failed'
  | 'http_error'
  | 'rejected_key'
  | 'bad_response';

export class TextModelError extends Error {
  constructor(
    public code: TextModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TextModelError';
  }
}
