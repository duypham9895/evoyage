import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor(_opts: { apiKey: string; baseURL: string }) {}
    chat = { completions: { create: mockCreate } };
  },
}));

import { callLLM, LLMSchemaError, LLMUnavailableError, LLMAbortedError } from './llm-module';

beforeEach(() => {
  mockCreate.mockReset();
  vi.stubEnv('XIAOMI_MIMO_API_KEY', 'mimo-test-key');
  vi.stubEnv('MINIMAX_API_KEY', 'minimax-test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('callLLM — happy path', () => {
  it('returns parsed object matching the schema when primary provider succeeds', async () => {
    const schema = z.object({ greeting: z.string() });

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"greeting":"hi"}' } }],
    });

    const result = await callLLM({
      schema,
      system: 'You are a JSON bot.',
      user: 'Say hi',
    });

    expect(result).toEqual({ greeting: 'hi' });
  });
});

describe('callLLM — schema validation', () => {
  it('throws LLMSchemaError carrying the raw response when response is valid JSON but fails schema', async () => {
    const schema = z.object({ greeting: z.string() });
    const rawJson = '{"wrong":"shape"}';

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: rawJson } }],
    });

    try {
      await callLLM({ schema, system: 's', user: 'u' });
      expect.fail('expected callLLM to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(LLMSchemaError);
      expect((e as LLMSchemaError).rawResponse).toBe(rawJson);
    }
  });
});

describe('callLLM — fallback', () => {
  it('falls back to Minimax when primary fails with infrastructure error', async () => {
    const schema = z.object({ from: z.string() });

    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 503 }))
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const result = await callLLM({ schema, system: 's', user: 'u' });

    expect(result).toEqual({ from: 'minimax' });
  });

  it('throws LLMUnavailableError when both providers fail with infrastructure errors', async () => {
    const schema = z.object({ x: z.string() });

    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('Bad gateway'), { status: 502 }));

    await expect(callLLM({ schema, system: 's', user: 'u' }))
      .rejects.toBeInstanceOf(LLMUnavailableError);
  });
});

describe('callLLM — abort', () => {
  it('throws LLMAbortedError when caller signal is already aborted', async () => {
    const schema = z.object({ x: z.string() });
    const controller = new AbortController();
    controller.abort();

    await expect(callLLM({ schema, system: 's', user: 'u', signal: controller.signal }))
      .rejects.toBeInstanceOf(LLMAbortedError);
  });
});

describe('callLLM — response cleaning', () => {
  it('strips <think>...</think> blocks before parsing', async () => {
    const schema = z.object({ answer: z.number() });
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '<think>let me think...</think>\n{"answer":42}' } }],
    });

    const result = await callLLM({ schema, system: 's', user: 'u' });

    expect(result).toEqual({ answer: 42 });
  });

  it('strips ```json...``` markdown fences before parsing (M2.7 workaround)', async () => {
    const schema = z.object({ wrapped: z.boolean() });
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '```json\n{"wrapped":true}\n```' } }],
    });

    const result = await callLLM({ schema, system: 's', user: 'u' });

    expect(result).toEqual({ wrapped: true });
  });
});

describe('callLLM — caller overrides', () => {
  it('passes caller-supplied maxTokens to the provider', async () => {
    const schema = z.object({ ok: z.boolean() });
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
    });

    await callLLM({ schema, system: 's', user: 'u', maxTokens: 8000 });

    const callArgs = mockCreate.mock.calls[0][0] as { max_tokens: number };
    expect(callArgs.max_tokens).toBe(8000);
  });

  it('aborts primary after timeoutMs elapses and falls back to secondary', async () => {
    vi.useFakeTimers();
    const schema = z.object({ from: z.string() });

    mockCreate
      .mockImplementationOnce(
        (_args: unknown, opts: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            opts.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
            );
          }),
      )
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"from":"minimax"}' } }],
      });

    const promise = callLLM({ schema, system: 's', user: 'u', timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    const result = await promise;

    expect(result).toEqual({ from: 'minimax' });
    vi.useRealTimers();
  });
});

describe('callLLM — no fallback on caller errors', () => {
  it('does not fall back on HTTP 401 (auth issue — fallback would also fail)', async () => {
    const schema = z.object({ ok: z.boolean() });
    mockCreate.mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
    );

    await expect(callLLM({ schema, system: 's', user: 'u' })).rejects.toThrow(/Unauthorized/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('does not fall back on HTTP 400 (caller bug — fallback would also fail)', async () => {
    const schema = z.object({ ok: z.boolean() });
    mockCreate.mockRejectedValueOnce(
      Object.assign(new Error('Bad Request'), { status: 400 }),
    );

    await expect(callLLM({ schema, system: 's', user: 'u' })).rejects.toThrow(/Bad Request/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
