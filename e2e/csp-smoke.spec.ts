/**
 * CSP smoke regression test — catches the F6 class of bug from the
 * 2026-05-24 Phase 4 QA:
 *
 *   - Middleware imports Node-only APIs (e.g. node:crypto) that crash on
 *     Edge Runtime in production.
 *   - Statically-generated pages don't get the middleware-set nonce, so
 *     Next.js framework chunks load without nonces and `strict-dynamic`
 *     CSP blocks them all.
 *
 * Both shipped past 1300+ vitest cases and were only caught by an
 * in-browser console-error check. This test makes that check part of CI.
 */
import { expect, test, type Page, type ConsoleMessage } from 'playwright/test';

interface ConsoleFinding {
  readonly route: string;
  readonly text: string;
}

function collectConsoleErrors(page: Page, route: string, sink: ConsoleFinding[]): void {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // CSP violations carry the phrase "Content Security Policy"; Next.js
    // chunk-load failures phrase it as "violates the following Content
    // Security Policy directive". Either way, the substring `Content Security`
    // is the load-bearing one.
    if (text.includes('Content Security')) {
      sink.push({ route, text });
    }
  });
  page.on('pageerror', (err) => {
    // Surfacing page errors (e.g. middleware crashes that leak into the
    // HTML) is also valuable for catching the F6 class.
    if (err.message.includes('Content Security')) {
      sink.push({ route, text: err.message });
    }
  });
}

test.describe('CSP smoke — pages render without violations', () => {
  test('/ landing page', async ({ page }) => {
    const findings: ConsoleFinding[] = [];
    collectConsoleErrors(page, '/', findings);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(findings, `CSP violations on /: ${JSON.stringify(findings, null, 2)}`).toEqual([]);
  });

  test('/plan with OSM map mode', async ({ page }) => {
    const findings: ConsoleFinding[] = [];
    collectConsoleErrors(page, '/plan?map=osm', findings);
    await page.goto('/plan?map=osm');
    // Give client components + Leaflet a beat to mount + load their chunks.
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    expect(findings, `CSP violations on /plan (OSM): ${JSON.stringify(findings, null, 2)}`).toEqual([]);
  });

  test('/plan with Mapbox map mode', async ({ page }) => {
    const findings: ConsoleFinding[] = [];
    collectConsoleErrors(page, '/plan?map=mapbox', findings);
    await page.goto('/plan?map=mapbox');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    expect(findings, `CSP violations on /plan (Mapbox): ${JSON.stringify(findings, null, 2)}`).toEqual([]);
  });
});

test.describe('CSP smoke — required security headers', () => {
  test('every response carries CSP + HSTS + frame-options + content-type-options', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);

    const headers = res.headers();
    // Header keys are lowercased by Playwright's request API.
    expect(headers['content-security-policy'], 'CSP header missing').toBeDefined();
    expect(headers['content-security-policy']).toMatch(/script-src .*'nonce-[^']+'/);
    expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    // F5 / D.8b: hardenings that should be in the CSP
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain("form-action 'self'");
    expect(headers['content-security-policy']).toContain("base-uri 'self'");
  });

  test('admin routes are noindex even on auth-failure responses', async ({ request }) => {
    const res = await request.get('/admin/feedback', { failOnStatusCode: false });
    expect(res.status()).toBe(401);
    const headers = res.headers();
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['www-authenticate']).toContain('Basic');
  });
});
