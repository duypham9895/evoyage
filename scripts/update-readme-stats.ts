/**
 * Sync README from auto-crawled data files:
 *   - VinFast station count       → src/data/station-stats.json
 *   - Live energy prices (4 rows) → src/data/energy-prices.json
 *
 * Designed to run from GitHub Actions immediately after the daily crawls.
 * Each block is bounded by HTML-comment markers so non-data copy is untouched.
 *
 * Run: npx tsx scripts/update-readme-stats.ts
 *
 * Exit code is 0 even when nothing changes — the workflow uses git diff to
 * decide whether to commit, not this script's exit code.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  replaceStationsBlock,
  replaceEnergyPricesBlock,
  type EnergyPricesReadmeBlock,
} from '../src/lib/station-stats';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const STATS_PATH = resolve(ROOT, 'src/data/station-stats.json');
const ENERGY_PATH = resolve(ROOT, 'src/data/energy-prices.json');
const README_PATH = resolve(ROOT, 'README.md');

interface StationStats {
  readonly count: number;
  readonly lastUpdated: string;
}

interface EnergyPricesFile {
  readonly petrolimex: {
    readonly products: Record<string, { readonly vndPerLiter: number }>;
  };
  readonly vgreen: { readonly vndPerKwh: number };
  readonly evnResidential: { readonly representativeVndPerKwh: number };
}

function main(): void {
  const stats = JSON.parse(readFileSync(STATS_PATH, 'utf-8')) as StationStats;
  if (!Number.isFinite(stats.count) || stats.count <= 0) {
    console.error(`Refusing to update README: invalid count "${stats.count}" in ${STATS_PATH}`);
    process.exit(1);
  }

  const before = readFileSync(README_PATH, 'utf-8');
  let after = replaceStationsBlock(before, stats.count);

  // Energy-prices block is best-effort — only sync when the JSON exists.
  // Older checkouts pre-energy-prices won't have it; the stations sync
  // still runs.
  if (existsSync(ENERGY_PATH)) {
    const energy = JSON.parse(readFileSync(ENERGY_PATH, 'utf-8')) as EnergyPricesFile;
    const block: EnergyPricesReadmeBlock = {
      gasolineVndPerLiter: energy.petrolimex.products.ron95iii?.vndPerLiter ?? 0,
      dieselVndPerLiter: energy.petrolimex.products.do005s?.vndPerLiter ?? 0,
      evnHomeVndPerKwh: energy.evnResidential.representativeVndPerKwh,
      vGreenVndPerKwh: energy.vgreen.vndPerKwh,
    };
    after = replaceEnergyPricesBlock(after, block);
  }

  if (before === after) {
    console.log(`README already in sync — no change.`);
    return;
  }

  writeFileSync(README_PATH, after);
  console.log(
    `README updated: station count → ${stats.count.toLocaleString('en-US')}+ (lastUpdated ${stats.lastUpdated}); energy-prices block synced.`,
  );
}

main();
