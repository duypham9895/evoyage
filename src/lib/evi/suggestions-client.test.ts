import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallJsonLLM } = vi.hoisted(() => ({
  mockCallJsonLLM: vi.fn(),
}));
vi.mock('./llm-call', () => ({
  callJsonLLM: mockCallJsonLLM,
}));

import { generateSuggestions } from './suggestions-client';

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
    mockCallJsonLLM.mockReset();
  });

  it('returns parsed suggestions on success', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: { suggestions: ['Pin còn bao nhiêu?', 'Trạm sạc gần nhất?', 'Thời gian sạc?'] },
      provider: 'mimo',
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual(['Pin còn bao nhiêu?', 'Trạm sạc gần nhất?', 'Thời gian sạc?']);
  });

  it('filters out suggestions longer than 40 chars', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: {
        suggestions: [
          'Short one',
          'This is a very long suggestion that definitely exceeds the 40 character limit imposed',
          'Another short',
        ],
      },
      provider: 'mimo',
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual(['Short one', 'Another short']);
  });

  it('returns empty array on validation failure', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: { wrongShape: true },
      provider: 'mimo',
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual([]);
  });

  it('returns empty array on callJsonLLM failure (silent degradation)', async () => {
    mockCallJsonLLM.mockRejectedValueOnce(new Error('Both providers failed'));

    const result = await generateSuggestions(sampleMessages, sampleContext);
    expect(result).toEqual([]);
  });

  it('passes 3000ms primary timeout (chips are tight)', async () => {
    mockCallJsonLLM.mockResolvedValueOnce({
      json: { suggestions: ['a', 'b', 'c'] },
      provider: 'mimo',
    });

    await generateSuggestions(sampleMessages, sampleContext);
    const callArgs = mockCallJsonLLM.mock.calls[0][0] as { primaryTimeoutMs: number };
    expect(callArgs.primaryTimeoutMs).toBe(3000);
  });
});
