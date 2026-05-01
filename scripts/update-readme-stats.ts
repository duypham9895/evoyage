/**
 * Sync the README station count from src/data/station-stats.json.
 *
 * Designed to run from GitHub Actions immediately after the daily VinFast
 * crawl writes a fresh count. Replacement is bounded by HTML-comment markers,
 * so non-station copy is left alone.
 *
 * Run: npx tsx scripts/update-readme-stats.ts
 *
 * Exit code is 0 even when the README is unchanged — the workflow uses git
 * diff to decide whether to commit, not this script's exit code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceStationsBlock } from '../src/lib/station-stats';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const STATS_PATH = resolve(ROOT, 'src/data/station-stats.json');
const README_PATH = resolve(ROOT, 'README.md');

interface StationStats {
  readonly count: number;
  readonly lastUpdated: string;
}

function main(): void {
  const stats = JSON.parse(readFileSync(STATS_PATH, 'utf-8')) as StationStats;
  if (!Number.isFinite(stats.count) || stats.count <= 0) {
    console.error(`Refusing to update README: invalid count "${stats.count}" in ${STATS_PATH}`);
    process.exit(1);
  }

  const before = readFileSync(README_PATH, 'utf-8');
  const after = replaceStationsBlock(before, stats.count);

  if (before === after) {
    console.log(`README station count already at ${stats.count.toLocaleString('en-US')}+ — no change.`);
    return;
  }

  writeFileSync(README_PATH, after);
  console.log(`README updated: station count → ${stats.count.toLocaleString('en-US')}+ (lastUpdated ${stats.lastUpdated}).`);
}

main();
