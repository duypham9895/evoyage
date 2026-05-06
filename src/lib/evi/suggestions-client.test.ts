import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallLLM = vi.hoisted(() => vi.fn());
vi.mock('./llm-module', async () => {
  const actual = await vi.importActual<typeof import('./llm-module')>('./llm-module');
  return {
    ...actual,
    callLLM: mockCallLLM,
  };
});

import { generateSuggestions } from './suggestions-client';
import { LLMSchemaError, LLMUnavailableError, LLMAbortedError } from './llm-module';

const sampleMessages = [
  { role: 'user' as const, content: 'Đi Đà Lạt từ Sài Gòn' },
  { role: 'assistant' as const, content: 'Bạn đang lái xe gì?' },
];

const sampleContext = {
  start: 'Sài Gòn',
  end: 'Đà Lạt',
  vehicleName: null,
  currentBattery: null,
  isComplete: false,
};

describe('generateSuggestions', () => {
  beforeEach(() => {
    mockCallLLM.mockReset();
  });

  it('returns parsed suggestions on success', async () => {
    mockCallLLM.mockResolvedValueOnce({
      suggestions: ['Pin còn bao nhiêu?', 'Trạm sạc gần nhất?', 'Thời gian sạc?'],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext, 'vi');
    expect(result).toEqual(['Pin còn bao nhiêu?', 'Trạm sạc gần nhất?', 'Thời gian sạc?']);
  });

  it('filters out suggestions longer than 40 chars', async () => {
    mockCallLLM.mockResolvedValueOnce({
      suggestions: [
        'Short one',
        'This is a very long suggestion that definitely exceeds the 40 character limit imposed',
        'Another short',
      ],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext, 'vi');
    expect(result).toEqual(['Short one', 'Another short']);
  });

  it('returns [] when llm-module throws LLMSchemaError (silent-fail contract)', async () => {
    mockCallLLM.mockRejectedValueOnce(new LLMSchemaError('schema mismatch', '{"wrong":"shape"}'));

    const result = await generateSuggestions(sampleMessages, sampleContext, 'vi');
    expect(result).toEqual([]);
  });

  it('returns [] when llm-module throws LLMUnavailableError (silent degradation)', async () => {
    mockCallLLM.mockRejectedValueOnce(new LLMUnavailableError('All LLM providers exhausted.'));

    const result = await generateSuggestions(sampleMessages, sampleContext, 'vi');
    expect(result).toEqual([]);
  });

  it('returns [] when llm-module throws LLMAbortedError (caller cancellation)', async () => {
    mockCallLLM.mockRejectedValueOnce(new LLMAbortedError());

    const result = await generateSuggestions(sampleMessages, sampleContext, 'vi');
    expect(result).toEqual([]);
  });

  it('passes timeoutMs=3000 (chips are tight)', async () => {
    mockCallLLM.mockResolvedValueOnce({ suggestions: ['a', 'b', 'c'] });

    await generateSuggestions(sampleMessages, sampleContext, 'vi');
    const callArgs = mockCallLLM.mock.calls[0][0] as { timeoutMs: number };
    expect(callArgs.timeoutMs).toBe(3000);
  });

  it('passes maxTokens=2048 to give M2.7 fallback room to think', async () => {
    mockCallLLM.mockResolvedValueOnce({ suggestions: ['a', 'b', 'c'] });

    await generateSuggestions(sampleMessages, sampleContext, 'vi');
    const callArgs = mockCallLLM.mock.calls[0][0] as { maxTokens: number };
    expect(callArgs.maxTokens).toBe(2048);
  });

  it('passes a SuggestionsSchema to callLLM (validation lives in the Module)', async () => {
    mockCallLLM.mockResolvedValueOnce({ suggestions: ['a', 'b', 'c'] });

    await generateSuggestions(sampleMessages, sampleContext, 'vi');
    const callArgs = mockCallLLM.mock.calls[0][0] as {
      schema: { safeParse: (v: unknown) => { success: boolean } };
    };
    expect(callArgs.schema).toBeDefined();
    expect(callArgs.schema.safeParse({ suggestions: ['x'] }).success).toBe(true);
    expect(callArgs.schema.safeParse({ wrongShape: true }).success).toBe(false);
  });

  it('builds Vietnamese system prompt when locale=vi (with explicit no-Chinese guard)', async () => {
    mockCallLLM.mockResolvedValueOnce({ suggestions: ['a', 'b', 'c'] });

    await generateSuggestions(sampleMessages, sampleContext, 'vi');
    const system = (mockCallLLM.mock.calls[0][0] as { system: string }).system;
    expect(system).toContain('in Vietnamese');
    expect(system).toContain('Phản hồi PHẢI hoàn toàn bằng tiếng Việt');
    expect(system).toContain('KHÔNG dùng ký tự tiếng Trung');
  });

  it('builds English system prompt when locale=en (with explicit no-Vietnamese-or-Chinese guard)', async () => {
    mockCallLLM.mockResolvedValueOnce({
      suggestions: ['How long is the trip?', 'Nearest charger?', 'Battery anxiety tips?'],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext, 'en');
    expect(result).toEqual(['How long is the trip?', 'Nearest charger?', 'Battery anxiety tips?']);
    const system = (mockCallLLM.mock.calls[0][0] as { system: string }).system;
    expect(system).toContain('in English');
    expect(system).toContain('Response MUST be entirely in English');
    expect(system).toContain('Do NOT mix in Vietnamese or Chinese');
  });

  it('defaults to Vietnamese when locale arg omitted (back-compat)', async () => {
    mockCallLLM.mockResolvedValueOnce({ suggestions: ['a', 'b', 'c'] });

    await generateSuggestions(sampleMessages, sampleContext);
    const system = (mockCallLLM.mock.calls[0][0] as { system: string }).system;
    expect(system).toContain('in Vietnamese');
  });
});
