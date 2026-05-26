// src/lib/evi/llm-providers.ts
//
// Static configs for the two LLM providers eVi uses. Both speak the
// OpenAI chat-completions wire format, so the `openai` npm SDK works
// with each by swapping `apiKey` and `baseURL`.

export interface LLMProvider {
  readonly name: 'openai' | 'minimax';
  readonly baseURL: string;
  readonly envVar: string;
  readonly defaultModel: string;
}

export const OPENAI_PROVIDER: LLMProvider = {
  name: 'openai',
  baseURL: 'https://api.openai.com/v1',
  envVar: 'OPENAI_API_KEY',
  defaultModel: 'gpt-5',
};

export const MINIMAX_PROVIDER: LLMProvider = {
  name: 'minimax',
  baseURL: 'https://api.minimax.io/v1',
  envVar: 'MINIMAX_API_KEY',
  defaultModel: 'MiniMax-M2.7',
};
