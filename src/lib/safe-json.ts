/**
 * Safely parse a JSON string into a string array.
 * Returns empty array on invalid input.
 */
export function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
