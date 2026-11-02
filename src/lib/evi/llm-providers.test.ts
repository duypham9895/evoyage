import { describe, it, expect } from 'vitest';
import { MINIMAX_PROVIDER, OPENAI_PROVIDER } from './llm-providers';

describe('LLM provider config', () => {
  it('uses a MiniMax model that is still served (M2.7 retires on 2026-11-18)', () => {
    expect(MINIMAX_PROVIDER.defaultModel).toBe('MiniMax-M3.1-Flash');
  });

  it('keeps OpenAI gpt-5 as the primary model (ADR-0010)', () => {
    expect(OPENAI_PROVIDER.defaultModel).toBe('gpt-5');
  });
});
