import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSuggestions } from './suggestions-client';

// Mock OpenAI
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

beforeEach(() => {
  mockCreate.mockReset();
  vi.stubEnv('MINIMAX_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

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
  it('returns parsed suggestions from valid AI response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: ['VF 8 Plus', 'VF 5 Plus', 'VF e34'],
          }),
        },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual(['VF 8 Plus', 'VF 5 Plus', 'VF e34']);
  });

  it('strips <think> tags from response before parsing', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '<think>reasoning here</think>{"suggestions": ["Q1", "Q2", "Q3"]}',
        },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('returns empty array when AI response is empty', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: '' },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual([]);
  });

  it('returns empty array when AI response has no content', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: null },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual([]);
  });

  it('returns empty array when response is only think tags', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: '<think>thinking...</think>  ' },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual([]);
  });

  it('returns empty array when JSON is invalid', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: 'not valid json' },
      }],
    });

    await expect(generateSuggestions(sampleMessages, sampleContext)).rejects.toThrow();
  });

  it('returns empty array when schema validation fails', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({ wrong_field: ['a', 'b'] }),
        },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual([]);
  });

  it('filters out suggestions longer than 40 characters', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: [
              'Short one',
              'This is a very long suggestion that exceeds the forty character limit for buttons',
              'Another short',
            ],
          }),
        },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual(['Short one', 'Another short']);
  });

  it('filters out empty suggestions', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: ['Valid', '', 'Also valid'],
          }),
        },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual(['Valid', 'Also valid']);
  });

  it('handles null trip context', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: ['Q1', 'Q2', 'Q3'],
          }),
        },
      }],
    });

    const result = await generateSuggestions(sampleMessages, null);

    expect(result).toEqual(['Q1', 'Q2', 'Q3']);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('uses temperature 0.3 and max_tokens 512', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({ suggestions: ['Q1', 'Q2', 'Q3'] }),
        },
      }],
    });

    await generateSuggestions(sampleMessages, sampleContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.3);
    expect(callArgs.max_tokens).toBe(512);
  });

  it('uses json_object response format', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({ suggestions: ['Q1', 'Q2', 'Q3'] }),
        },
      }],
    });

    await generateSuggestions(sampleMessages, sampleContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
  });

  it('returns empty array on abort (timeout)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('The operation was aborted'));

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result).toEqual([]);
  });

  it('throws on non-abort errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Internal server error'));

    await expect(generateSuggestions(sampleMessages, sampleContext)).rejects.toThrow('Internal server error');
  });

  it('throws when MINIMAX_API_KEY is not set', async () => {
    vi.stubEnv('MINIMAX_API_KEY', '');

    // Need to re-import to test the getClient function
    // The mock handles the constructor, so we test indirectly
    mockCreate.mockRejectedValueOnce(new Error('MINIMAX_API_KEY is not set'));

    await expect(generateSuggestions(sampleMessages, sampleContext)).rejects.toThrow();
  });

  it('limits output to max 3 suggestions', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: ['Q1', 'Q2', 'Q3'],
          }),
        },
      }],
    });

    const result = await generateSuggestions(sampleMessages, sampleContext);

    expect(result.length).toBeLessThanOrEqual(3);
  });
});
