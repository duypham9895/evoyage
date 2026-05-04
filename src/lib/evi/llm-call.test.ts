import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture every OpenAI(...) constructor call so we can assert which
// provider was contacted (mimo baseURL vs minimax baseURL).
const constructorCalls: Array<{ apiKey: string; baseURL: string }> = [];
const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor(opts: { apiKey: string; baseURL: string }) {
      constructorCalls.push(opts);
    }
    chat = { completions: { create: mockCreate } };
  },
}));

import { callJsonLLM } from './llm-call';

beforeEach(() => {
  constructorCalls.length = 0;
  mockCreate.mockReset();
  vi.stubEnv('XIAOMI_MIMO_API_KEY', 'mimo-test-key');
  vi.stubEnv('MINIMAX_API_KEY', 'minimax-test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const SAMPLE_INPUT = {
  systemPrompt: 'You are a JSON bot. Respond with valid JSON.',
  userMessages: [{ role: 'user' as const, content: 'Say hi' }],
  maxTokens: 256,
  temperature: 0.1,
  primaryTimeoutMs: 1000,
  fallbackTimeoutMs: 2000,
  callerTag: 'test',
};

describe('callJsonLLM — primary success', () => {
  it('returns parsed JSON from MiMo when primary succeeds', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"hello":"world"}' } }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);

    expect(result.json).toEqual({ hello: 'world' });
    expect(result.provider).toBe('mimo');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(constructorCalls[0].apiKey).toBe('mimo-test-key');
  });

  it('passes model + max_tokens + temperature to the SDK', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
    });

    await callJsonLLM(SAMPLE_INPUT);

    const callArgs = mockCreate.mock.calls[0][0] as {
      model: string;
      max_tokens: number;
      temperature: number;
      response_format: { type: string };
    };
    expect(callArgs.model).toBe('mimo-v2-flash');
    expect(callArgs.max_tokens).toBe(256);
    expect(callArgs.temperature).toBe(0.1);
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
  });
});
