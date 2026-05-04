// src/lib/evi/llm-providers.ts
//
// Static configs for the two LLM providers eVi uses. Both speak the
// OpenAI chat-completions wire format, so the `openai` npm SDK works
// with each by swapping `apiKey` and `baseURL`.

export type LLMProviderName = 'mimo' | 'minimax';

export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly baseURL: string;
  readonly envVar: string;
  readonly defaultModel: string;
}

export const MIMO_PROVIDER: LLMProvider = {
  name: 'mimo',
  baseURL: 'https://api.xiaomimimo.com/v1',
  envVar: 'XIAOMI_MIMO_API_KEY',
  defaultModel: 'mimo-v2-flash',
};

export const MINIMAX_PROVIDER: LLMProvider = {
  name: 'minimax',
  baseURL: 'https://api.minimax.io/v1',
  envVar: 'MINIMAX_API_KEY',
  defaultModel: 'MiniMax-M2.7',
};

export const PRIMARY_PROVIDER: LLMProvider = MIMO_PROVIDER;
export const FALLBACK_PROVIDER: LLMProvider = MINIMAX_PROVIDER;
