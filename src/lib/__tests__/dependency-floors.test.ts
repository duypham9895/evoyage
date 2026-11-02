import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Dependency security floors (issue #95)', () => {
  const lockPath = resolve(__dirname, '../../../package-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    packages: Record<string, { version?: string } | undefined>;
  };

  /** Compares two dotted version strings. Returns true when `version` is >= `floor`. */
  function isAtLeast(version: string, floor: string): boolean {
    const v = version.split('.').map(Number);
    const f = floor.split('.').map(Number);
    for (let i = 0; i < Math.max(v.length, f.length); i++) {
      const vp = v[i] ?? 0;
      const fp = f[i] ?? 0;
      if (vp !== fp) return vp > fp;
    }
    return true;
  }

  it('nanoid is patched against the negative-size DoS (GHSA-28wg-ghj8-5hjv)', () => {
    const version = lock.packages['node_modules/nanoid']?.version;
    expect(version).toBeDefined();
    expect(isAtLeast(version as string, '5.1.16')).toBe(true);
  });

  it('the undici nested under @vercel/blob is absent or patched (GHSA-p88m-4jfj-68fv and others)', () => {
    const version = lock.packages['node_modules/@vercel/blob/node_modules/undici']?.version;
    if (version !== undefined) {
      expect(isAtLeast(version, '6.29.1')).toBe(true);
    }
  });

  it('the zod nested under @vercel/cli-config is absent or patched (GHSA-mrhx-c7xc-m3w5)', () => {
    const version = lock.packages['node_modules/@vercel/cli-config/node_modules/zod']?.version;
    if (version !== undefined) {
      expect(isAtLeast(version, '4.6.6')).toBe(true);
    }
  });

  it('the fflate nested under posthog-js is absent or patched (GHSA-px8p-9vwx-vf98)', () => {
    const version = lock.packages['node_modules/posthog-js/node_modules/fflate']?.version;
    if (version !== undefined) {
      expect(isAtLeast(version, '0.4.9')).toBe(true);
    }
  });

  it('@vercel/og is removed (unused, pulls in vulnerable satori/sharp)', () => {
    expect(lock.packages['node_modules/@vercel/og']).toBeUndefined();
  });
});
