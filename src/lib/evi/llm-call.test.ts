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

  it('strips <think>...</think> blocks before JSON.parse', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '<think>let me think about this...</think>\n{"answer":42}',
        },
      }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ answer: 42 });
  });

  it('strips ```json ... ``` markdown fences before JSON.parse', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: '```json\n{"wrapped":true}\n```' },
      }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ wrapped: true });
  });

  it('strips both <think> AND ```json fences in one response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '<think>thinking...</think>\n```json\n{"both":"stripped"}\n```',
        },
      }],
    });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ both: 'stripped' });
  });
});

describe('callJsonLLM — fallback on hard errors', () => {
  function expectMimoThenMinimaxCalled() {
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(constructorCalls).toHaveLength(2);
    expect(constructorCalls[0].baseURL).toBe('https://api.xiaomimimo.com/v1');
    expect(constructorCalls[1].baseURL).toBe('https://api.minimax.io/v1');
  }

  it('falls back to Minimax when MiMo throws a network error', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:443'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.json).toEqual({ from: 'minimax' });
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back when MiMo is aborted by timeout', async () => {
    const abortErr = Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
    mockCreate
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back on HTTP 5xx', async () => {
    const apiErr = Object.assign(new Error('Internal Server Error'), { status: 500 });
    mockCreate
      .mockRejectedValueOnce(apiErr)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back on HTTP 429 rate limit', async () => {
    const apiErr = Object.assign(new Error('Too Many Requests'), { status: 429 });
    mockCreate
      .mockRejectedValueOnce(apiErr)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('falls back when MiMo returns empty content', async () => {
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callJsonLLM(SAMPLE_INPUT);
    expect(result.provider).toBe('minimax');
    expectMimoThenMinimaxCalled();
  });

  it('throws aggregate error when both providers fail', async () => {
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 503 }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow(/both providers failed/i);
  });
});

describe('callJsonLLM — non-fallback paths', () => {
  it('does not fall back when MiMo returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not json at all' } }],
    });

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(1); // no fallback
  });

  it('does not fall back on HTTP 400 (caller bug, not infrastructure)', async () => {
    const apiErr = Object.assign(new Error('Bad Request'), { status: 400 });
    mockCreate.mockRejectedValueOnce(apiErr);

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow(/Bad Request/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('does not fall back on HTTP 401 (auth issue, fallback would also fail)', async () => {
    const apiErr = Object.assign(new Error('Unauthorized'), { status: 401 });
    mockCreate.mockRejectedValueOnce(apiErr);

    await expect(callJsonLLM(SAMPLE_INPUT)).rejects.toThrow(/Unauthorized/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
