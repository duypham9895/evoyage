import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

describe('Locale key consistency', () => {
  const enKeys = Object.keys(en).sort();
  const viKeys = Object.keys(vi).sort();

  it('both locales have the same number of keys', () => {
    expect(enKeys.length).toBe(viKeys.length);
  });

  it('every EN key exists in VI', () => {
    const missingInVi = enKeys.filter(k => !viKeys.includes(k));
    expect(missingInVi).toEqual([]);
  });

  it('every VI key exists in EN', () => {
    const missingInEn = viKeys.filter(k => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  it('no empty string values in EN', () => {
    const emptyKeys = enKeys.filter(k => (en as Record<string, string>)[k] === '');
    expect(emptyKeys).toEqual([]);
  });

  it('no empty string values in VI', () => {
    const emptyKeys = viKeys.filter(k => (vi as Record<string, string>)[k] === '');
    expect(emptyKeys).toEqual([]);
  });

  it('template variables match between EN and VI', () => {
    const templateRegex = /\{\{(\w+)\}\}/g;
    const mismatches: string[] = [];

    for (const key of enKeys) {
      const enVal = (en as Record<string, string>)[key] ?? '';
      const viVal = (vi as Record<string, string>)[key] ?? '';
      const enVars = [...enVal.matchAll(templateRegex)].map(m => m[1]).sort();
      const viVars = [...viVal.matchAll(templateRegex)].map(m => m[1]).sort();
      if (JSON.stringify(enVars) !== JSON.stringify(viVars)) {
        mismatches.push(`${key}: EN has {{${enVars.join(',')}}} but VI has {{${viVars.join(',')}}}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
