import { buildSystemPrompt } from './prompt';

describe('buildSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const result = buildSystemPrompt('VinFast VF 8, BYD Atto 3');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the vehicle list in output', () => {
    const vehicleList = 'VinFast VF 3, VinFast VF 8 Plus, BYD Atto 3';
    const result = buildSystemPrompt(vehicleList);
    expect(result).toContain(vehicleList);
  });

  it('contains key instruction phrases', () => {
    const result = buildSystemPrompt('VinFast VF 8');
    expect(result).toContain('eVi');
    expect(result).toContain('trip planning');
    expect(result).toContain('JSON');
  });

  it('does not include undefined or null text when vehicleList is empty', () => {
    const result = buildSystemPrompt('');
    expect(result).not.toContain('undefined');
    // The prompt template uses "null" in JSON schema examples (e.g. "string | null"),
    // so we only verify the vehicle list section is not literally "null" or "undefined"
    const vehicleSection = result.split('AVAILABLE VEHICLES IN VIETNAM:')[1]?.split('OUTPUT FORMAT')[0] ?? '';
    expect(vehicleSection.trim()).toBe('');
  });
});
