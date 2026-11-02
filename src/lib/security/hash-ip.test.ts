import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

const IP = '203.0.113.42';

async function loadHashIp() {
  vi.resetModules();
  return (await import('./hash-ip')).hashIp;
}

describe('hashIp', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('gives a stable 64-char hex value for the same IP and secret', async () => {
    vi.stubEnv('IP_HASH_SECRET', 'secret-a');
    const hashIp = await loadHashIp();
    expect(hashIp(IP)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp(IP)).toBe(hashIp(IP));
  });

  it('gives different values for different secrets', async () => {
    vi.stubEnv('IP_HASH_SECRET', 'secret-a');
    const a = (await loadHashIp())(IP);
    vi.stubEnv('IP_HASH_SECRET', 'secret-b');
    const b = (await loadHashIp())(IP);
    expect(a).not.toBe(b);
  });

  it('is not the plain, reversible sha256 of the IP when a secret is set', async () => {
    vi.stubEnv('IP_HASH_SECRET', 'secret-a');
    const hashIp = await loadHashIp();
    expect(hashIp(IP)).not.toBe(createHash('sha256').update(IP).digest('hex'));
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to plain sha256 and warns only once when the secret is missing', async () => {
    vi.stubEnv('IP_HASH_SECRET', '');
    const hashIp = await loadHashIp();
    expect(hashIp(IP)).toBe(createHash('sha256').update(IP).digest('hex'));
    hashIp('198.51.100.7');
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain('IP_HASH_SECRET');
  });
});
