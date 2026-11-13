import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseEvnTariff,
  parseEvnDecisionFromTitle,
  findRepresentativeTier,
  extractEvnTariffArticleUrls,
  selectEvnResidentialArticle,
  assertEvnDecisionNotOlderThanPublished,
  REPRESENTATIVE_MONTHLY_KWH,
} from './parse-evn';

const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/__fixtures__/energy-prices',
);
const fixture = (name: string) => readFileSync(resolve(FIXTURE_DIR, name), 'utf8');

// The exact uppercase heading is the only discriminator between the household
// tariff and the reseller price list EVN now serves from the old article id.
const HEADING = 'RETAIL ELECTRICITY TARIFF FOR RESIDENTIAL USE';

/** One `<td>`, in the nesting both real pages use. */
const cell = (text: string) => `<td><p><span>${text}</span></p></td>`;

/** A residential table from raw `<tr>` bodies, for rows with unusual cell counts. */
function syntheticRows(rows: ReadonlyArray<string>): string {
  return `<h2>${HEADING}</h2><table>${rows.map((r) => `<tr>${r}</tr>`).join('')}</table>`;
}

/** Build a minimal residential table in the row shape both real pages use. */
function syntheticTariff(rows: ReadonlyArray<readonly [string, string]>): string {
  return syntheticRows(rows.map(([label, price]) => cell(label) + cell(price)));
}

/** An article page whose `<title>` names a decision, for discovery tests. */
function syntheticArticle(titleDecision: string, body: string): string {
  return `<html><head><title>Retail Electricity Tariffs (${titleDecision})</title></head><body>${body}</body></html>`;
}

/** A clock just after the synthetic "Decision 3100/QD-BCT dated November 1, 2027". */
const AFTER_3100 = new Date('2027-11-05T00:00:00Z');

/** Today's clock, for drift scenarios where the next decision is days old. */
const NOW_2026_11_13 = new Date('2026-11-13T06:00:00Z');

/**
 * The real 2892 article re-dated to a plausible next decision, with one gate
 * broken. Used for the silent-stale scenarios the round-3 reviewers found.
 */
function nextDecisionArticle(
  html: string,
  breakIt: (html: string) => string = (h) => h,
): { url: string; html: string } {
  return {
    url: 'https://en.evn.com.vn/d/en-US/news/next-decision-60-28-600001',
    html: breakIt(
      html.replace(/2892\/QD-BCT dated October 31, 2026/g, '3500/QD-BCT dated November 10, 2026'),
    ),
  };
}

describe('parseEvnTariff — Decision 2892/QD-BCT (5 tiers)', () => {
  const html = fixture('evn-tariff-2892.html');

  it('extracts five residential tiers with their kWh ranges', () => {
    const result = parseEvnTariff(html);
    expect(result.tiers).toEqual([
      { minKwh: 0, maxKwh: 100, vndPerKwh: 1901 },
      { minKwh: 101, maxKwh: 200, vndPerKwh: 2289 },
      { minKwh: 201, maxKwh: 400, vndPerKwh: 2894 },
      { minKwh: 401, maxKwh: 700, vndPerKwh: 3456 },
      { minKwh: 701, maxKwh: null, vndPerKwh: 3844 },
    ]);
  });

  it('puts the 250 kWh representative anchor in tier 3', () => {
    const result = parseEvnTariff(html);
    expect(result.representativeTier).toBe(3);
    expect(result.representativeVndPerKwh).toBe(2894);
  });
});

describe('parseEvnTariff — Decision 1279/QD-BCT (6 tiers, kept as the generality proof)', () => {
  const html = fixture('evn-tariff-1279.html');

  it('extracts six residential tiers in ascending order', () => {
    const result = parseEvnTariff(html);
    expect(result.tiers).toHaveLength(6);
    expect(result.tiers.map((t) => t.vndPerKwh)).toEqual([
      1984, 2050, 2380, 2998, 3350, 3460,
    ]);
  });

  it('captures the kWh consumption ranges for each tier', () => {
    const result = parseEvnTariff(html);
    expect(result.tiers[0]).toEqual({ minKwh: 0, maxKwh: 50, vndPerKwh: 1984 });
    expect(result.tiers[1]).toEqual({ minKwh: 51, maxKwh: 100, vndPerKwh: 2050 });
    expect(result.tiers[2]).toEqual({ minKwh: 101, maxKwh: 200, vndPerKwh: 2380 });
    expect(result.tiers[3]).toEqual({ minKwh: 201, maxKwh: 300, vndPerKwh: 2998 });
    expect(result.tiers[4]).toEqual({ minKwh: 301, maxKwh: 400, vndPerKwh: 3350 });
    expect(result.tiers[5]).toEqual({ minKwh: 401, maxKwh: null, vndPerKwh: 3460 });
  });

  it('exposes the representative tier for an EV-owning household (tier 4)', () => {
    const result = parseEvnTariff(html);
    expect(result.representativeTier).toBe(4);
    expect(result.representativeVndPerKwh).toBe(2998);
  });

  it('ignores the lowercase "rate 3:" decoy paragraph below the table', () => {
    // A case-insensitive row match picks up "rate 3: From 101 to 200 kWh for
    // the whole electricity consumption…" and breaks contiguity.
    expect(parseEvnTariff(html).tiers).toHaveLength(6);
  });
});

describe('parseEvnTariff — rejects the reseller price list', () => {
  it('SPEC-TRAP: throws naming the missing residential heading (the reseller page must never parse)', () => {
    const html = fixture('evn-reseller-2892.html');
    expect(() => parseEvnTariff(html)).toThrow(
      /residential retail tariff heading not found/,
    );
  });

  it('throws on the archive listing too', () => {
    expect(() => parseEvnTariff(fixture('evn-listing.html'))).toThrow(/EVN parser/);
  });

  it('throws a descriptive error when no residential tier rows are found', () => {
    expect(() => parseEvnTariff('<html>no tariff here</html>')).toThrow(/EVN/i);
  });

  // The reseller page's own table becomes the "residential region" if a related-
  // article link anywhere above it carries the retail article's title. That
  // returns 1582/1795/2236/2754/3142 — 22.7% low, contiguous, ascending, inside
  // the plausibility bounds, same decision date. Link text is not a heading.
  it('R2-S1: ignores a heading that is only the text of an <a> link', () => {
    const decoyed = fixture('evn-reseller-2892.html').replace(
      /<body[^>]*>/i,
      (m) => `${m}<div class="related"><a href="/d/en-US/news/x-60-28-501776">${HEADING}S</a></div>`,
    );
    expect(() => parseEvnTariff(decoyed)).toThrow(
      /residential retail tariff heading not found/,
    );
  });

  it('R2-S1: still finds a real heading when a link above it also carries the text', () => {
    const real = fixture('evn-tariff-2892.html').replace(
      /<body[^>]*>/i,
      (m) => `${m}<div class="related"><a href="/d/en-US/news/x-60-28-252">${HEADING}S</a></div>`,
    );
    expect(parseEvnTariff(real).representativeVndPerKwh).toBe(2894);
  });
});

describe('parseEvnTariff — validation', () => {
  it('throws when fewer than 3 tiers are detected', () => {
    const partial = syntheticTariff([['Rate 1: For the kWh from 0 – 50', '1,984']]);
    expect(() => parseEvnTariff(partial)).toThrow(/at least 3 residential tiers, found 1/);
  });

  it('throws when the tier ranges are not contiguous', () => {
    const gap = syntheticTariff([
      ['Tier 1: First 100kWh', '1,901'],
      ['Tier 2: For the kWh from 201 - 400', '2,289'],
      ['Tier 3: For the kWh from 401 onwards', '2,894'],
    ]);
    expect(() => parseEvnTariff(gap)).toThrow(/contiguous/);
  });

  it('throws when prices are not strictly ascending', () => {
    const flat = syntheticTariff([
      ['Tier 1: First 100kWh', '1,901'],
      ['Tier 2: For the kWh from 101 - 200', '1,901'],
      ['Tier 3: For the kWh from 201 onwards', '2,894'],
    ]);
    expect(() => parseEvnTariff(flat)).toThrow(/ascending/);
  });

  it('throws on an unrecognised row label instead of skipping it', () => {
    const odd = syntheticTariff([
      ['Tier 1: First 100kWh', '1,901'],
      ['Tier 2: Somewhere between 101 and 200', '2,289'],
      ['Tier 3: For the kWh from 201 onwards', '2,894'],
    ]);
    expect(() => parseEvnTariff(odd)).toThrow(/unrecognised tier label/);
  });

  it('W7: reads a five-digit price cell whole (the old regex returned 2345 for 12,345)', () => {
    const big = syntheticTariff([
      ['Tier 1: First 100kWh', '1,901'],
      ['Tier 2: For the kWh from 101 - 200', '12,345'],
      ['Tier 3: For the kWh from 201 onwards', '13,000'],
    ]);
    expect(parseEvnTariff(big).tiers[1].vndPerKwh).toBe(12345);
  });

  it('R1-M3: throws when one price cell holds two numbers (VAT-exclusive / VAT-inclusive)', () => {
    const vat = syntheticRows([
      cell('Tier 1: First 100kWh') + cell('1,901 excl. VAT / 2,091 incl. VAT'),
      cell('Tier 2: For the kWh from 101 - 200') + cell('2,289'),
      cell('Tier 3: For the kWh from 201 onwards') + cell('2,894'),
    ]);
    expect(() => parseEvnTariff(vat)).toThrow(/exactly one price/);
  });

  it('R1-M3: throws when the row gains an extra price column instead of reading the first', () => {
    const extraColumn = syntheticRows([
      cell('Tier 1: First 100kWh') + cell('1,728') + cell('1,901'),
      cell('Tier 2: For the kWh from 101 - 200') + cell('2,081') + cell('2,289'),
      cell('Tier 3: For the kWh from 201 onwards') + cell('2,631') + cell('2,894'),
    ]);
    expect(() => parseEvnTariff(extraColumn)).toThrow(/exactly one price/);
  });

  it('R1-M2: parses a comma-grouped kWh boundary in the label instead of eating it as the price', () => {
    const wideBands = syntheticRows([
      cell('Tier 1: First 100kWh') + cell('1,901'),
      cell('Tier 2: For the kWh from 101 - 700') + cell('2,289'),
      cell('Tier 3: For the kWh from 701 - 1,000') + cell('2,894'),
      cell('Tier 4: For the kWh from 1,001 onwards') + cell('3,456'),
    ]);
    expect(parseEvnTariff(wideBands).tiers).toEqual([
      { minKwh: 0, maxKwh: 100, vndPerKwh: 1901 },
      { minKwh: 101, maxKwh: 700, vndPerKwh: 2289 },
      { minKwh: 701, maxKwh: 1000, vndPerKwh: 2894 },
      { minKwh: 1001, maxKwh: null, vndPerKwh: 3456 },
    ]);
  });

  it('rejects a price above the electricity plausibility bound', () => {
    const implausible = syntheticTariff([
      ['Tier 1: First 100kWh', '1,901'],
      ['Tier 2: For the kWh from 101 - 200', '2,289'],
      ['Tier 3: For the kWh from 201 onwards', '123,456'],
    ]);
    expect(() => parseEvnTariff(implausible)).toThrow(/implausible VND value/);
  });
});

describe('findRepresentativeTier', () => {
  const tiers2892 = () => parseEvnTariff(fixture('evn-tariff-2892.html')).tiers;
  const tiers1279 = () => parseEvnTariff(fixture('evn-tariff-1279.html')).tiers;

  it('uses a monthly kWh anchor, not a hardcoded tier index', () => {
    expect(REPRESENTATIVE_MONTHLY_KWH).toBe(250);
    expect(findRepresentativeTier(tiers2892(), REPRESENTATIVE_MONTHLY_KWH)).toBe(3);
    expect(findRepresentativeTier(tiers1279(), REPRESENTATIVE_MONTHLY_KWH)).toBe(4);
  });

  it('treats maxKwh === null as unbounded above', () => {
    expect(findRepresentativeTier(tiers2892(), 5000)).toBe(5);
    expect(findRepresentativeTier(tiers1279(), 5000)).toBe(6);
  });

  it('matches the first tier at its lower bound', () => {
    expect(findRepresentativeTier(tiers2892(), 0)).toBe(1);
  });

  it('throws rather than returning -1 when no tier contains the anchor', () => {
    expect(() => findRepresentativeTier(tiers2892(), -1)).toThrow(/no tier contains/);
  });
});

describe('parseEvnDecisionFromTitle', () => {
  it('reads "October 31, 2026" from the 2892 article title', () => {
    expect(parseEvnDecisionFromTitle(fixture('evn-tariff-2892.html'))).toEqual({
      decisionNo: '2892',
      isoDate: '2026-10-31',
    });
  });

  it('reads "9 May 2025" from the 1279 article title', () => {
    expect(parseEvnDecisionFromTitle(fixture('evn-tariff-1279.html'))).toEqual({
      decisionNo: '1279',
      isoDate: '2025-05-09',
    });
  });

  it('ignores decisions that appear only in the page body', () => {
    // The 2892 article body cites 1279/QD-BCT and 1305/QD-EVN in its sidebar.
    const body =
      '<html><head><title>Some unrelated news</title></head>' +
      '<body><p>Decision No. 1279/QD-BCT dated 9 May 2025</p></body></html>';
    expect(parseEvnDecisionFromTitle(body)).toBeNull();
  });

  it('returns null when the title names no QD-BCT decision', () => {
    expect(parseEvnDecisionFromTitle('<title>Electricity Tariff</title>')).toBeNull();
  });

  it('R2-S3: returns null for a decision date more than a week in the future', () => {
    // One mistyped year upstream would be written to effectiveAt and would then
    // make the freshness floor reject every real decision that follows.
    expect(
      parseEvnDecisionFromTitle(
        '<title>Retail Electricity Tariffs (Decision No. 2892/QD-BCT dated October 31, 2062)</title>',
      ),
    ).toBeNull();
    const nearFuture = new Date('2026-11-13T00:00:00Z');
    expect(
      parseEvnDecisionFromTitle(
        '<title>Retail Electricity Tariffs (Decision No. 3000/QD-BCT dated November 17, 2026)</title>',
        nearFuture,
      ),
    ).toEqual({ decisionNo: '3000', isoDate: '2026-11-17' });
    expect(
      parseEvnDecisionFromTitle(
        '<title>Retail Electricity Tariffs (Decision No. 3000/QD-BCT dated November 25, 2026)</title>',
        nearFuture,
      ),
    ).toBeNull();
  });

  it('reads the real 2892 article against a fixed clock', () => {
    expect(
      parseEvnDecisionFromTitle(fixture('evn-tariff-2892.html'), new Date('2026-11-13T00:00:00Z')),
    ).toEqual({ decisionNo: '2892', isoDate: '2026-10-31' });
  });

  it('returns null for a date that is not a real calendar date', () => {
    // An unreal date sorts above every real one and would be committed as effectiveAt.
    expect(
      parseEvnDecisionFromTitle(
        '<title>Tariffs (Decision No. 2892/QD-BCT dated February 99, 2026)</title>',
      ),
    ).toBeNull();
    expect(
      parseEvnDecisionFromTitle(
        '<title>Tariffs (Decision No. 2892/QD-BCT dated 31 February 2026)</title>',
      ),
    ).toBeNull();
    expect(
      parseEvnDecisionFromTitle(
        '<title>Tariffs (Decision No. 2892/QD-BCT dated Smarch 3, 2026)</title>',
      ),
    ).toBeNull();
  });
});

describe('extractEvnTariffArticleUrls', () => {
  const urls = () => extractEvnTariffArticleUrls(fixture('evn-listing.html'));

  it('collects the category 60-28 articles as absolute URLs', () => {
    expect(urls().length).toBeGreaterThanOrEqual(2);
    for (const url of urls()) {
      expect(url.startsWith('https://en.evn.com.vn/d/en-US/news/')).toBe(true);
    }
  });

  it('includes both the residential article and the reseller article', () => {
    expect(urls().some((u) => u.endsWith('-60-28-501776'))).toBe(true);
    expect(urls().some((u) => u.endsWith('-60-28-252'))).toBe(true);
  });

  it('dedupes repeated links and returns nothing for a page with no tariff links', () => {
    expect(new Set(urls()).size).toBe(urls().length);
    expect(extractEvnTariffArticleUrls('<a href="/d/en-US/news/other-1-2-3">x</a>')).toEqual([]);
  });
});

describe('selectEvnResidentialArticle', () => {
  const reseller = {
    url: 'https://en.evn.com.vn/d/en-US/news/Electricity-Selling-Prices-for-Retailers-60-28-252',
    html: fixture('evn-reseller-2892.html'),
  };
  const residential2892 = {
    url: 'https://en.evn.com.vn/d/en-US/news/Retail-Electricity-Tariffs-by-Customer-Categories-60-28-501776',
    html: fixture('evn-tariff-2892.html'),
  };
  const residential1279 = {
    url: 'https://en.evn.com.vn/d/en-US/news/Retail-Electricity-Tariff-1279-60-28-260',
    html: fixture('evn-tariff-1279.html'),
  };

  it('picks the article with the latest decision date', () => {
    const chosen = selectEvnResidentialArticle([reseller, residential2892, residential1279]);
    expect(chosen.url).toBe(residential2892.url);
    expect(chosen.effectiveAt).toBe('2026-10-31');
    expect(chosen.tariff.tiers).toHaveLength(5);
  });

  it('throws when only the reseller article is on offer', () => {
    expect(() => selectEvnResidentialArticle([reseller])).toThrow(/no residential/i);
  });

  it('throws on an empty candidate list', () => {
    expect(() => selectEvnResidentialArticle([])).toThrow(/no residential/i);
  });

  it('R1-A2: names every rejected candidate and why, so the failure issue has something to quote', () => {
    let message = '';
    try {
      selectEvnResidentialArticle([reseller]);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(reseller.url);
    expect(message).toContain('residential retail tariff heading not found');
  });

  // The whole reason discovery exists: detect a NEWER decision. If the newest
  // decision on offer does not parse, falling back to the one that does
  // republishes a repealed tariff with a fresh lastSyncedAt and nobody is told.
  it('R1-H1: refuses to fall back to an older decision when a newer one is listed but unparseable', () => {
    const newerBroken = {
      url: 'https://en.evn.com.vn/d/en-US/news/next-decision-60-28-600000',
      html: syntheticArticle(
        'Decision No. 3100/QD-BCT dated November 1, 2027',
        syntheticRows([
          cell('Tier 1: Consumption band up to 100 kWh') + cell('2,100'),
          cell('Tier 2: Consumption band 101 to 200 kWh') + cell('2,500'),
          cell('Tier 3: Consumption band over 200 kWh') + cell('3,100'),
        ]),
      ),
    };

    let message = '';
    try {
      // Clock set just after the new decision: a date far in the future is
      // rejected as a typo, so "newer" has to be plausibly newer.
      selectEvnResidentialArticle([residential2892, newerBroken], AFTER_3100);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/3100\/QD-BCT/);
    expect(message).toMatch(/2027-11-01/);
    expect(message).toMatch(/no residential tariff parsed/i);
    expect(message).toContain(newerBroken.url);
    expect(message).toContain('unrecognised tier label');
  });

  it('still succeeds when the newest decision is the one that parses', () => {
    const olderExtra = {
      url: 'https://en.evn.com.vn/d/en-US/news/older-60-28-1',
      html: residential1279.html,
    };
    expect(selectEvnResidentialArticle([olderExtra, residential2892]).decisionNo).toBe('2892');
  });

  // Three of the five articles live on the listing today are non-residential and
  // carry a QD-BCT date in their title (reseller 252, decision 501775, wholesale
  // 260). Letting any of them raise the "newest decision" bar hands each of them
  // a permanent kill switch over the whole crawl — Petrolimex and V-GREEN
  // included, because one failed source exits non-zero.
  it('R2-S2: ignores a newer decision on a non-residential article', () => {
    const resellerRetitled = {
      url: 'https://en.evn.com.vn/d/en-US/news/reseller-60-28-900001',
      html: reseller.html.replace(
        /2892\/QD-BCT dated October 31, 2026/g,
        '3100/QD-BCT dated November 1, 2027',
      ),
    };
    const chosen = selectEvnResidentialArticle([residential2892, resellerRetitled]);
    expect(chosen.url).toBe(residential2892.url);
    expect(chosen.decisionNo).toBe('2892');
  });

  it('R1-H1: still throws when the newer decision is on a residential page that will not parse', () => {
    const newerBroken = {
      url: 'https://en.evn.com.vn/d/en-US/news/next-decision-60-28-900002',
      html: syntheticArticle(
        'Decision No. 3100/QD-BCT dated November 1, 2027',
        syntheticRows([cell('Tier 1: Consumption band up to 100 kWh') + cell('2,100')]),
      ),
    };
    expect(() =>
      selectEvnResidentialArticle([residential2892, newerBroken], AFTER_3100),
    ).toThrow(/3100\/QD-BCT dated 2027-11-01/);
  });

  // R3-1/S3-1: gating the newest-decision bar on the exact heading literal means
  // a new decision's article disappears silently the moment EVN rewords that
  // heading — and the wording already changed once (TARIFF -> TARIFFS) between
  // the only two residential articles that exist. The repealed tariff is then
  // republished daily with a fresh lastSyncedAt, exit 0, auto-merged.
  it('S3-1: throws when the newest decision reworded the heading (TARIFFS -> PRICES)', () => {
    const reworded = nextDecisionArticle(residential2892.html, (h) =>
      h.replace(/RETAIL ELECTRICITY TARIFFS FOR RESIDENTIAL USE/g, 'RETAIL ELECTRICITY PRICES FOR RESIDENTIAL USE'),
    );
    expect(() =>
      selectEvnResidentialArticle([residential2892, reworded], NOW_2026_11_13),
    ).toThrow(/3500\/QD-BCT dated 2026-11-10/);
  });

  it('S3-1: throws when the newest decision renders the heading in Title Case', () => {
    const titleCase = nextDecisionArticle(residential2892.html, (h) =>
      h.replace(/RETAIL ELECTRICITY TARIFFS FOR RESIDENTIAL USE/g, 'Retail Electricity Tariffs for Residential Use'),
    );
    expect(() =>
      selectEvnResidentialArticle([residential2892, titleCase], NOW_2026_11_13),
    ).toThrow(/3500\/QD-BCT dated 2026-11-10/);
  });

  it('S3-1: a plausibly-dated non-residential article still cannot kill the source', () => {
    // Round-2 S2/N1 must stay closed: these three are live on the listing today
    // and none of them is a tariff page.
    const nonResidential = [
      ['Electricity Selling Prices for Electricity Retailers', 'reseller-60-28-252'],
      ['WHOLESALE ELECTRICITY TARIFF', 'wholesale-60-28-260'],
      ['Ministry of Industry and Trade Decision on Electricity Tariffs', 'decision-60-28-501775'],
    ] as const;
    for (const [title, slug] of nonResidential) {
      const candidate = {
        url: `https://en.evn.com.vn/d/en-US/news/${slug}`,
        html: `<html><head><title>${title} (Decision No. 3500/QD-BCT dated November 10, 2026)</title></head><body><p>No tariff table.</p></body></html>`,
      };
      expect(
        selectEvnResidentialArticle([residential2892, candidate], NOW_2026_11_13).url,
      ).toBe(residential2892.url);
    }
  });

  // BUG(p1-energy-crawl-evn-tariff-restructure): a newer residential article whose title date DECISION_RE cannot parse raises nothing, so the repealed tariff is republished silently. EVN's two real titles already use two different date formats. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-12-p1-energy-crawl-evn-tariff-restructure.md
  it.fails('R3-1: throws when the newest decision article writes its date in an unknown format', () => {
    const oddFormat = nextDecisionArticle(residential2892.html, (h) =>
      h.replace(/dated November 10, 2026/g, 'of November 10, 2026'),
    );
    expect(() =>
      selectEvnResidentialArticle([residential2892, oddFormat], NOW_2026_11_13),
    ).toThrow();
  });

  // BUG(p1-energy-crawl-evn-tariff-restructure): a newer residential article whose title names no decision at all is rejected silently and the old article is republished. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-12-p1-energy-crawl-evn-tariff-restructure.md
  it.fails('R3-1: throws when the newest decision article names no decision in its title', () => {
    const noDecision = {
      url: 'https://en.evn.com.vn/d/en-US/news/next-decision-60-28-600002',
      html: residential2892.html.replace(
        /\(Decision No\. 2892\/QD-BCT dated October 31, 2026 issued by Ministry of Industry and Trade\)/g,
        '',
      ),
    };
    expect(() =>
      selectEvnResidentialArticle([residential2892, noDecision], NOW_2026_11_13),
    ).toThrow();
  });

  it('rejects an article whose own title is not a retail electricity tariff', () => {
    // Second, independent discriminator: the reseller, wholesale and QD-EVN
    // articles all fail it, and both real residential articles pass it.
    const retitled = {
      url: 'https://en.evn.com.vn/d/en-US/news/mislabelled-60-28-900003',
      html: residential2892.html.replace(
        /Retail Electricity Tariffs by Customer Categories/g,
        'Electricity Selling Prices for Electricity Retailers',
      ),
    };
    let message = '';
    try {
      selectEvnResidentialArticle([retitled]);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(retitled.url);
    expect(message).toMatch(/title/i);
  });

  it('R2-S1: is not fooled by a link-text heading on a higher article id', () => {
    const decoy = {
      url: 'https://en.evn.com.vn/d/en-US/news/reseller-60-28-999999',
      html: reseller.html.replace(
        /<body[^>]*>/i,
        (m) => `${m}<div class="related"><a href="/x">${HEADING}S</a></div>`,
      ),
    };
    expect(selectEvnResidentialArticle([decoy, residential2892]).url).toBe(
      residential2892.url,
    );
  });

  it('R2-S3: excludes a candidate whose title date is in the future', () => {
    const futureDated = {
      url: 'https://en.evn.com.vn/d/en-US/news/typo-60-28-900004',
      html: residential2892.html.replace(
        /2892\/QD-BCT dated October 31, 2026/g,
        '2892/QD-BCT dated October 31, 2062',
      ),
    };
    expect(selectEvnResidentialArticle([futureDated, residential2892]).url).toBe(
      residential2892.url,
    );
    expect(() => selectEvnResidentialArticle([futureDated])).toThrow(/no residential/i);
  });

  it('R2-N3: throws when two articles share the newest decision date but disagree on price', () => {
    const shifted = {
      url: 'https://en.evn.com.vn/d/en-US/news/retail-60-28-999999',
      html: residential2892.html.replace(/>2,894</g, '>2,794<'),
    };
    let message = '';
    try {
      selectEvnResidentialArticle([residential2892, shifted]);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/different tiers|disagree/i);
    expect(message).toContain(residential2892.url);
    expect(message).toContain(shifted.url);
  });

  it('R2-N3: keeps the highest article id when tied candidates agree on every tier', () => {
    const duplicate = {
      url: 'https://en.evn.com.vn/d/en-US/news/retail-60-28-999999',
      html: residential2892.html,
    };
    expect(selectEvnResidentialArticle([residential2892, duplicate]).url).toBe(
      duplicate.url,
    );
    expect(selectEvnResidentialArticle([duplicate, residential2892]).url).toBe(
      duplicate.url,
    );
  });

  // The two guards compose the way `fetchEvn` calls them. The script itself is
  // outside both vitest and tsc, so this is where that sequence is covered.
  it('R1-H1b: the freshness floor catches the current article dropping off the listing', () => {
    const chosen = selectEvnResidentialArticle([residential1279]);
    expect(chosen.effectiveAt).toBe('2025-05-09');
    expect(() =>
      assertEvnDecisionNotOlderThanPublished(chosen, '2026-10-31'),
    ).toThrow(/older than/);
  });
});

describe('assertEvnDecisionNotOlderThanPublished', () => {
  const chosen = {
    url: 'https://en.evn.com.vn/d/en-US/news/old-60-28-260',
    decisionNo: '1279',
    effectiveAt: '2025-05-09',
  };

  it('throws when the chosen article predates what is already published', () => {
    // The current article fell off listing page 1; only the 2025 one is left.
    expect(() => assertEvnDecisionNotOlderThanPublished(chosen, '2026-10-31')).toThrow(
      /2025-05-09.*2026-10-31|older than/,
    );
    expect(() => assertEvnDecisionNotOlderThanPublished(chosen, '2026-10-31')).toThrow(
      /1279/,
    );
  });

  it('accepts the same decision re-crawled, and a newer one', () => {
    expect(() =>
      assertEvnDecisionNotOlderThanPublished(chosen, '2025-05-09'),
    ).not.toThrow();
    expect(() =>
      assertEvnDecisionNotOlderThanPublished(chosen, '2024-01-01'),
    ).not.toThrow();
  });

  it('accepts anything when nothing is published yet (first run / empty field)', () => {
    expect(() => assertEvnDecisionNotOlderThanPublished(chosen, null)).not.toThrow();
    expect(() => assertEvnDecisionNotOlderThanPublished(chosen, undefined)).not.toThrow();
    expect(() => assertEvnDecisionNotOlderThanPublished(chosen, '')).not.toThrow();
  });
});
