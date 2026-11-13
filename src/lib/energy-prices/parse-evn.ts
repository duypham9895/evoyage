/**
 * Parser and source discovery for the EVN residential electricity tariff.
 *
 * Discovery starts at the Electricity Tariff archive listing
 * (https://en.evn.com.vn/en-US/news-l/Electricity-Tariff-60-28) because nothing
 * on EVN's site is a stable identity: after Decision 2892/QD-BCT the article id
 * we used to scrape (252) started serving the price list EVN charges *resellers*,
 * which parses as a plausible-looking tariff and is 17-23% too low. The exact
 * uppercase heading "RETAIL ELECTRICITY TARIFF(S) FOR RESIDENTIAL USE" is the
 * only discriminator, so it is a hard anchor: no heading, no tariff.
 *
 * The tariff shape is read from the page rather than hardcoded — the 2025
 * decision had 6 tiers, the 2026 one has 5, and both wordings are covered by
 * the fixtures in `scripts/__fixtures__/energy-prices/`.
 */
import { assertPlausibleVnd, ELECTRICITY_VND_PER_KWH_BOUNDS } from './plausibility';

export interface EvnTier {
  readonly minKwh: number;
  readonly maxKwh: number | null;
  readonly vndPerKwh: number;
}

export interface EvnTariff {
  readonly tiers: readonly EvnTier[];
  readonly representativeTier: number;
  readonly representativeVndPerKwh: number;
}

/**
 * Monthly household consumption the "electricity at home" price represents.
 *
 * This is a **continuity anchor**, not an estimate of what an EV-owning
 * household uses: 250 kWh is the midpoint of the old 201-300 band, so it
 * reproduces exactly the price we published under Decision 1279 (tier 4,
 * 2,998 ₫) while following the new tariff to tier 3 (2,894 ₫). Decision D1,
 * docs/bugs/2026-11-12-p1-energy-crawl-evn-tariff-restructure.md.
 */
export const REPRESENTATIVE_MONTHLY_KWH = 250;

// `\s*` doesn't match HTML entities like `&nbsp;`; the `[\s ]|&nbsp;` set
// covers regular whitespace, non-breaking space, and the literal entity.
const SP = '(?:[\\s\\u00a0]|&nbsp;)*';

// Case-sensitive because the reseller page matches "residential use"
// case-insensitively four times; only the uppercase heading tells them apart.
const RESIDENTIAL_HEADING_RE = /RETAIL ELECTRICITY TARIFFS? FOR RESIDENTIAL USE/g;
const ANCHOR_RE = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
// Case-sensitive on purpose. The 1279 page carries a lowercase decoy
// ("rate 3: From 101 to 200 kWh…") in a paragraph below the table.
const ROW_PREFIX_RE = new RegExp(`(?:Tier|Rate)${SP}\\d+${SP}:`, 'g');

// Reads the whole grouped number. The previous `([12-9],[0-9]{3})(?!\d)`
// returned 2345 for a cell of "12,345".
const PRICE_RE = /(?<![\d,])(\d{1,3}(?:,\d{3})+)(?![\d,])/g;

// Tags and whitespace may sit between the row prefix and its label text, but
// nothing else: the label is matched from the start of the row so that the
// price search can begin where the label ends.
const LEAD = '(?:[\\s\\u00a0]|&nbsp;|<[^>]*>)*';
// A kWh boundary may be written with EVN's own thousands separator ("701 - 1,000");
// read as part of the label it cannot be mistaken for the price cell.
const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d+)';
const kwh = (raw: string) => Number.parseInt(raw.replace(/,/g, ''), 10);

const LABEL_SHAPES: ReadonlyArray<{
  readonly regex: RegExp;
  readonly range: (m: RegExpMatchArray) => { minKwh: number; maxKwh: number | null };
}> = [
  {
    // "For the kWh from 101 - 200" (hyphen, 2892) / "…from&nbsp;0 – 50" (en dash, 1279)
    regex: new RegExp(`^${LEAD}For${SP}the${SP}kWh${SP}from${SP}${NUM}${SP}[–-]${SP}${NUM}`),
    range: (m) => ({ minKwh: kwh(m[1]), maxKwh: kwh(m[2]) }),
  },
  {
    // "For the kWh from 701 onwards" / "For the kWh from 401 kWh onwards"
    regex: new RegExp(`^${LEAD}For${SP}the${SP}kWh${SP}from${SP}${NUM}${SP}(?:kWh${SP})?onwards`),
    range: (m) => ({ minKwh: kwh(m[1]), maxKwh: null }),
  },
  {
    // "First 100kWh"
    regex: new RegExp(`^${LEAD}First${SP}${NUM}${SP}kWh`),
    range: (m) => ({ minKwh: 0, maxKwh: kwh(m[1]) }),
  },
];

/**
 * End of the first residential heading that is NOT just the text of a link.
 *
 * A related-article link carrying the retail article's title is enough to make
 * the *reseller* page parse as a complete, plausible household tariff — 22.7%
 * low, contiguous, ascending, inside the plausibility bounds, same decision
 * date. Link text names another document; it never introduces a table.
 */
function residentialHeadingEnd(html: string): number | null {
  const links = [...html.matchAll(ANCHOR_RE)].map((a) => ({
    start: a.index,
    end: a.index + a[0].length,
  }));
  for (const heading of html.matchAll(RESIDENTIAL_HEADING_RE)) {
    const inLink = links.some((l) => heading.index >= l.start && heading.index < l.end);
    if (!inLink) return heading.index + heading[0].length;
  }
  return null;
}

/** Whether the page carries a residential tariff heading of its own. */
function hasResidentialHeading(html: string): boolean {
  return residentialHeadingEnd(html) !== null;
}

/** Text between the residential heading and the first `</table>` after it. */
function residentialRegion(html: string): string {
  const headingEnd = residentialHeadingEnd(html);
  if (headingEnd === null) {
    throw new Error('EVN parser: residential retail tariff heading not found');
  }
  const after = html.slice(headingEnd);
  const tableEnd = after.indexOf('</table>');
  return tableEnd === -1 ? after : after.slice(0, tableEnd);
}

/**
 * One tier per `Tier N:` / `Rate N:` row.
 *
 * The label is matched first, from the start of the row; the price is then read
 * from what follows it and must be the row's *only* grouped number. Taking "the
 * first grouped number after the prefix" instead would silently publish the
 * wrong column if EVN ever adds one (a VAT-exclusive price, say) — the same
 * plausible-but-wrong failure the heading anchor exists to prevent.
 */
function parseRows(region: string): EvnTier[] {
  const rows = [...region.matchAll(ROW_PREFIX_RE)];
  return rows.map((row, i) => {
    const start = row.index + row[0].length;
    const nextRow = i + 1 < rows.length ? rows[i + 1].index : region.length;
    const cell = region.slice(start, nextRow);
    // Stop at this row's own `</tr>`: the 1279 table continues with a
    // "prepaid card meter" row that is not a tier and carries its own price.
    const rowEnd = cell.indexOf('</tr>');
    const rowText = rowEnd === -1 ? cell : cell.slice(0, rowEnd);

    const shape = LABEL_SHAPES.map((s) => ({ s, m: s.regex.exec(rowText) })).find(
      (candidate) => candidate.m !== null,
    );
    if (!shape || !shape.m) {
      throw new Error(`EVN parser: unrecognised tier label after "${row[0].trim()}"`);
    }

    const afterLabel = rowText.slice(shape.m[0].length);
    const prices = [...afterLabel.matchAll(PRICE_RE)];
    if (prices.length !== 1) {
      throw new Error(
        `EVN parser: expected exactly one price after "${row[0].trim()}", found ${prices.length}` +
          (prices.length > 1 ? ` (${prices.map((p) => p[1]).join(', ')})` : ''),
      );
    }

    return {
      ...shape.s.range(shape.m),
      vndPerKwh: Number.parseInt(prices[0][1].replace(/,/g, ''), 10),
    };
  });
}

/**
 * Every structural rule a published tariff must satisfy. Exported so the data
 * contract test can run it against the committed `energy-prices.json` — the
 * automation's own sync PR runs `npm test`, so a malformed tariff cannot
 * auto-merge — without restating the rules a second time.
 */
export function assertTariffShape(tiers: readonly EvnTier[]): void {
  if (tiers.length < 3) {
    throw new Error(
      `EVN parser: expected at least 3 residential tiers, found ${tiers.length}`,
    );
  }
  if (tiers[0].minKwh !== 0) {
    throw new Error(`EVN parser: first tier starts at ${tiers[0].minKwh} kWh, expected 0`);
  }
  for (let i = 1; i < tiers.length; i++) {
    const previousMax = tiers[i - 1].maxKwh;
    if (previousMax === null || tiers[i].minKwh !== previousMax + 1) {
      throw new Error(
        `EVN parser: tier ranges are not contiguous at tier ${i + 1} (${previousMax} → ${tiers[i].minKwh})`,
      );
    }
    if (tiers[i].vndPerKwh <= tiers[i - 1].vndPerKwh) {
      throw new Error(
        `EVN parser: tier prices are not strictly ascending at tier ${i + 1} (${tiers[i - 1].vndPerKwh} → ${tiers[i].vndPerKwh})`,
      );
    }
  }
  if (tiers[tiers.length - 1].maxKwh !== null) {
    throw new Error('EVN parser: last tier is not open-ended');
  }
  for (const tier of tiers) {
    assertPlausibleVnd(
      tier.vndPerKwh,
      `EVN parser: tier ${tier.minKwh}-${tier.maxKwh ?? '∞'} kWh`,
      ELECTRICITY_VND_PER_KWH_BOUNDS,
    );
  }
}

/**
 * 1-based index of the tier that `monthlyKwh` falls in. `maxKwh === null` means
 * unbounded above, so the last tier matches anything at or over its `minKwh`.
 */
export function findRepresentativeTier(
  tiers: readonly EvnTier[],
  monthlyKwh: number,
): number {
  const index = tiers.findIndex(
    (t) => monthlyKwh >= t.minKwh && (t.maxKwh === null || monthlyKwh <= t.maxKwh),
  );
  if (index === -1) {
    throw new Error(`EVN parser: no tier contains ${monthlyKwh} kWh/month`);
  }
  return index + 1;
}

export function parseEvnTariff(html: string): EvnTariff {
  const tiers = parseRows(residentialRegion(html));
  assertTariffShape(tiers);

  const representativeTier = findRepresentativeTier(tiers, REPRESENTATIVE_MONTHLY_KWH);
  return {
    tiers,
    representativeTier,
    representativeVndPerKwh: tiers[representativeTier - 1].vndPerKwh,
  };
}

export interface EvnDecision {
  readonly decisionNo: string;
  readonly isoDate: string;
}

const MONTHS: Readonly<Record<string, number | undefined>> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * How far ahead of today a decision date may legitimately sit. MOIT publishes a
 * decision days before it takes effect, so a small lead is normal; a mistyped
 * year is not. A future date would be written to `effectiveAt` with the prices
 * still correct — so nobody would notice — and the freshness floor would then
 * reject every real decision after it, recoverable only by hand-editing a
 * committed data file.
 */
const MAX_DECISION_LEAD_DAYS = 7;

/** ISO date, or null if it is not a real day (February 99) or too far ahead. */
function toIsoDate(year: number, month: number, day: number, now: Date): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (date.getTime() > now.getTime() + MAX_DECISION_LEAD_DAYS * 86_400_000) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const OG_TITLE_RE = /<meta[^>]+og:title[^>]+content="([^"]*)"/i;
// "Decision No. 2892/QD-BCT dated October 31, 2026" / "…1279/QD-BCT dated 9 May 2025"
const DECISION_RE =
  /Decision\s+No\.\s*(\d+)\/QD-BCT\s+dated\s+(?:([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})|(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}))/i;
// Second discriminator, independent of the heading anchor. Of the articles
// listed in category 60-28, only the residential ones say this: the reseller
// ("Electricity Selling Prices for Electricity Retailers"), the wholesale
// ("WHOLESALE ELECTRICITY TARIFF") and the QD-EVN average-price article
// ("…average retail electricity price") all fail it.
const RETAIL_TARIFF_TITLE_RE = /retail electricity tariff/i;

function articleTitles(html: string): string[] {
  return [TITLE_RE.exec(html)?.[1], OG_TITLE_RE.exec(html)?.[1]].filter(
    (t): t is string => typeof t === 'string',
  );
}

/** Whether the article calls itself a retail electricity tariff. */
function titleClaimsRetailTariff(html: string): boolean {
  return articleTitles(html).some((t) => RETAIL_TARIFF_TITLE_RE.test(t));
}

/**
 * Decision number + date from the article's `<title>` / `og:title` only.
 *
 * Deliberately ignores the page body: the 2892 article cites Decision 1279 and
 * Decision 1305/QD-EVN in its sidebar, so a body-wide search picks the wrong
 * decision. Returns null when the title names no QD-BCT decision, or names one
 * whose date is not a real calendar date or sits more than
 * `MAX_DECISION_LEAD_DAYS` ahead of `now` — such a date would be written to
 * `effectiveAt` and would outrank every real decision in the sort below.
 */
export function parseEvnDecisionFromTitle(
  html: string,
  now: Date = new Date(),
): EvnDecision | null {
  for (const title of articleTitles(html)) {
    const match = DECISION_RE.exec(title);
    if (!match) continue;
    const [monthName, day, year] = match[2]
      ? [match[2], match[3], match[4]]
      : [match[6], match[5], match[7]];
    const month = MONTHS[monthName.toLowerCase()];
    if (month === undefined) continue;
    const isoDate = toIsoDate(Number(year), month, Number(day), now);
    if (isoDate === null) continue;
    return { decisionNo: match[1], isoDate };
  }
  return null;
}

const EVN_ORIGIN = 'https://en.evn.com.vn';
// Category 60-28 is "Electricity Tariff"; the article id is the final segment.
const TARIFF_ARTICLE_HREF_RE =
  /href="((?:https:\/\/en\.evn\.com\.vn)?\/d\/en-US\/news\/[^"]*-60-28-\d+)"/g;

/** Absolute, deduped URLs of the tariff-category articles linked from a listing page. */
export function extractEvnTariffArticleUrls(listingHtml: string): string[] {
  const urls = new Set<string>();
  for (const match of listingHtml.matchAll(TARIFF_ARTICLE_HREF_RE)) {
    const href = match[1];
    urls.add(href.startsWith('http') ? href : `${EVN_ORIGIN}${href}`);
  }
  return [...urls];
}

export interface EvnArticleCandidate {
  readonly url: string;
  readonly html: string;
}

export interface EvnResidentialArticle {
  readonly url: string;
  readonly tariff: EvnTariff;
  readonly decisionNo: string;
  /** Decision date (e.g. "2026-10-31"), not the date the tariff takes effect. */
  readonly effectiveAt: string;
}

function articleId(url: string): number {
  return Number.parseInt(url.match(/-(\d+)$/)?.[1] ?? '0', 10);
}

function sameTiers(a: readonly EvnTier[], b: readonly EvnTier[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (tier, i) =>
        tier.minKwh === b[i].minKwh &&
        tier.maxKwh === b[i].maxKwh &&
        tier.vndPerKwh === b[i].vndPerKwh,
    )
  );
}

/**
 * Pick the current residential tariff article out of a listing's candidates.
 *
 * A candidate qualifies only if it carries a residential tariff heading of its
 * own, calls itself a retail electricity tariff in its title, names a QD-BCT
 * decision there, and parses. The newest decision wins; ties go to the highest
 * article id, but only once the tied articles are shown to agree. Throws when
 * nothing qualifies — the EVN source then fails loudly rather than publishing a
 * reseller price list.
 *
 * It also throws when a **residential** candidate names a newer decision than
 * the winner but did not parse. Discovery exists to detect the next decision;
 * silently keeping the one that still parses would republish a repealed tariff
 * every day with a fresh `lastSyncedAt`. Non-residential articles cannot raise
 * that bar: three of the five articles listed in this category today are
 * reseller/wholesale/decision pages that carry a QD-BCT date and no tariff
 * table, and letting any of them veto the crawl would freeze Petrolimex and
 * V-GREEN too. Every rejected candidate and its reason go into the message,
 * because that message is what the failure issue quotes (W6).
 */
export function selectEvnResidentialArticle(
  candidates: readonly EvnArticleCandidate[],
  now: Date = new Date(),
): EvnResidentialArticle {
  const qualified: EvnResidentialArticle[] = [];
  const rejected: Array<{ url: string; reason: string }> = [];
  let newestDecision: EvnDecision | null = null;

  for (const { url, html } of candidates) {
    const isResidentialPage = hasResidentialHeading(html);
    const decision = parseEvnDecisionFromTitle(html, now);

    // Only a residential page can raise the newest-decision bar — but either
    // discriminator is enough to identify one. Requiring the heading alone made
    // the next decision's article vanish silently if EVN reworded that literal
    // (it already changed TARIFF -> TARIFFS once), republishing the repealed
    // tariff; requiring the title alone was how a reseller article could veto
    // the whole crawl. Either on its own is still a residential claim worth
    // failing loudly for, and no live non-residential article satisfies either.
    if ((isResidentialPage || titleClaimsRetailTariff(html)) && decision) {
      if (!newestDecision || decision.isoDate > newestDecision.isoDate) {
        newestDecision = decision;
      }
    }

    if (!isResidentialPage) {
      rejected.push({ url, reason: 'EVN parser: residential retail tariff heading not found' });
      continue;
    }
    if (!titleClaimsRetailTariff(html)) {
      rejected.push({ url, reason: 'title does not call this a retail electricity tariff' });
      continue;
    }
    if (!decision) {
      rejected.push({ url, reason: 'title names no QD-BCT decision with a valid date' });
      continue;
    }
    try {
      qualified.push({
        url,
        tariff: parseEvnTariff(html),
        decisionNo: decision.decisionNo,
        effectiveAt: decision.isoDate,
      });
    } catch (err) {
      rejected.push({ url, reason: (err as Error).message });
    }
  }

  const why = rejected.length
    ? ` Rejected: ${rejected.map((r) => `${r.url} — ${r.reason}`).join('; ')}`
    : '';

  if (qualified.length === 0) {
    throw new Error(
      `EVN discovery: no residential tariff article among ${candidates.length} candidate(s).${why}`,
    );
  }

  qualified.sort((a, b) =>
    a.effectiveAt === b.effectiveAt
      ? articleId(b.url) - articleId(a.url)
      : b.effectiveAt.localeCompare(a.effectiveAt),
  );
  const chosen = qualified[0];

  if (newestDecision && chosen.effectiveAt < newestDecision.isoDate) {
    throw new Error(
      `EVN discovery: no residential tariff parsed for the newest decision ` +
        `${newestDecision.decisionNo}/QD-BCT dated ${newestDecision.isoDate}; ` +
        `the newest that parsed is ${chosen.decisionNo}/QD-BCT dated ${chosen.effectiveAt} ` +
        `(${chosen.url}).${why}`,
    );
  }

  // EVN posted three articles for decision 2892 within hours of each other. If a
  // second one ever gains a residential table (an urban/rural split, a corrected
  // re-post), picking by article id would publish whichever happened to be
  // higher. Tied articles must agree before the tie-break is allowed to decide.
  for (const other of qualified) {
    if (other === chosen || other.effectiveAt !== chosen.effectiveAt) continue;
    if (!sameTiers(chosen.tariff.tiers, other.tariff.tiers)) {
      throw new Error(
        `EVN discovery: two articles both carry Decision ${chosen.decisionNo}/QD-BCT ` +
          `dated ${chosen.effectiveAt} but publish different tiers: ` +
          `${chosen.url} (${chosen.tariff.representativeVndPerKwh} VND/kWh) vs ` +
          `${other.url} (${other.tariff.representativeVndPerKwh} VND/kWh).${why}`,
      );
    }
  }

  return chosen;
}

/**
 * Refuse a tariff older than the one already in `src/data/energy-prices.json`.
 *
 * The listing has no fetchable page 2, so the current article can drop off it;
 * an older residential article left in place would then be selected, parse
 * cleanly and pass every shape check. Freshness is the only thing that catches
 * it. Pure so it is unit-tested — `scripts/` is outside both vitest and tsc.
 */
export function assertEvnDecisionNotOlderThanPublished(
  chosen: Pick<EvnResidentialArticle, 'url' | 'decisionNo' | 'effectiveAt'>,
  publishedEffectiveAt: string | null | undefined,
): void {
  if (!publishedEffectiveAt || chosen.effectiveAt >= publishedEffectiveAt) return;
  throw new Error(
    `EVN discovery: chosen article ${chosen.url} is Decision ${chosen.decisionNo}/QD-BCT ` +
      `dated ${chosen.effectiveAt}, older than the published ${publishedEffectiveAt}`,
  );
}
