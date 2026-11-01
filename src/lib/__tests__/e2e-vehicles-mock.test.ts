import { describe, it, expect } from 'vitest';
import type { Page, Route } from 'playwright/test';
import { mockAPIs } from '../../../e2e/helpers/app';

type Handler = (route: Route) => unknown;

/**
 * Registers the E2E API mocks against a fake Page, then sends one request
 * through the handler Playwright would pick for that URL. No browser runs.
 */
async function fulfilledBodyFor(url: string): Promise<unknown> {
  const routes: Array<{ pattern: string | RegExp; handler: Handler }> = [];
  const fakePage = {
    route: async (pattern: string | RegExp, handler: Handler) => {
      routes.push({ pattern, handler });
    },
  } as unknown as Page;

  await mockAPIs(fakePage);

  const entry = routes.find((r) => r.pattern === '**/api/vehicles**');
  if (!entry) throw new Error('mockAPIs no longer registers **/api/vehicles**');

  let body: string | undefined;
  const fakeRoute = {
    request: () => ({ url: () => url, method: () => 'GET' }),
    fulfill: async (opts: { body?: string }) => {
      body = opts.body;
    },
    continue: async () => undefined,
  } as unknown as Route;

  await entry.handler(fakeRoute);
  if (body === undefined) throw new Error('vehicles mock did not fulfill the request');
  return JSON.parse(body);
}

describe('E2E vehicles mock (e2e/helpers/app.ts)', () => {
  it('returns the list shape for a list query', async () => {
    const body = (await fulfilledBodyFor('http://localhost:3001/api/vehicles?vietnamOnly=true')) as {
      vehicles?: unknown[];
    };
    expect(Array.isArray(body.vehicles)).toBe(true);
  });

  // BUG(p3-e2e-precautionary-reopen-flake): the vehicles mock answers ?id= lookups with the list shape, unlike the real API. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p3-e2e-precautionary-reopen-flake.md
  it.fails('returns a single vehicle object for an ?id= lookup, like GET /api/vehicles?id=', async () => {
    const body = (await fulfilledBodyFor('http://localhost:3001/api/vehicles?id=vf8-plus')) as Record<string, unknown>;
    expect(body).not.toHaveProperty('vehicles');
    expect(body).toMatchObject({ id: 'vf8-plus', brand: 'VinFast', model: 'VF 8' });
  });
});
