/**
 * Sync README from auto-crawled data files:
 *   - VinFast station count       → src/data/station-stats.json
 *   - Live energy prices (4 rows) → src/data/energy-prices.json
 *
 * Designed to run from GitHub Actions immediately after the daily crawls.
 * Each block is bounded by HTML-comment markers so non-data copy is untouched.
 *
 * Run: npx tsx scripts/update-readme-stats.ts --only=stations|energy
 *
 * `--only` restricts the sync to one block so the station and energy crawl
 * jobs don't each rewrite the other's README section (see #94). Omit it for
 * a local manual run that syncs both.
 *
 * Exit code is 0 even when nothing changes — the workflow uses git diff to
 * decide whether to commit, not this script's exit code.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncReadmeBlocks, type EnergyPricesReadmeBlock } from '../src/lib/station-stats';

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

function parseOnly(argv: readonly string[]): 'stations' | 'energy' | undefined {
  const arg = argv.find((a) => a.startsWith('--only='));
  if (!arg) return undefined;
  const value = arg.slice('--only='.length);
  if (value !== 'stations' && value !== 'energy') {
    console.error(`Invalid --only value "${value}". Expected "stations" or "energy".`);
    process.exit(1);
  }
  return value;
}

function main(): void {
  const only = parseOnly(process.argv.slice(2));

  let stationCount: number | undefined;
  if (only !== 'energy') {
    const stats = JSON.parse(readFileSync(STATS_PATH, 'utf-8')) as StationStats;
    if (!Number.isFinite(stats.count) || stats.count <= 0) {
      console.error(`Refusing to update README: invalid count "${stats.count}" in ${STATS_PATH}`);
      process.exit(1);
    }
    stationCount = stats.count;
  }

  let energy: EnergyPricesReadmeBlock | undefined;
  if (only !== 'stations' && existsSync(ENERGY_PATH)) {
    const data = JSON.parse(readFileSync(ENERGY_PATH, 'utf-8')) as EnergyPricesFile;
    energy = {
      gasolineVndPerLiter: data.petrolimex.products.ron95iii?.vndPerLiter ?? 0,
      dieselVndPerLiter: data.petrolimex.products.do005s?.vndPerLiter ?? 0,
      evnHomeVndPerKwh: data.evnResidential.representativeVndPerKwh,
      vGreenVndPerKwh: data.vgreen.vndPerKwh,
    };
  }

  const before = readFileSync(README_PATH, 'utf-8');
  const after = syncReadmeBlocks(before, { only, stationCount, energy });

  if (before === after) {
    console.log(`README already in sync — no change.`);
    return;
  }

  writeFileSync(README_PATH, after);
  console.log(`README updated (--only=${only ?? 'all'}).`);
}

main();
