/**
 * Parser for the manual station CSV at data/manual-stations.csv.
 *
 * Format (one header row + N data rows):
 *   name,address,latitude,longitude,province,provider,connectorTypes,maxPowerKw,stationType,sourceUrl
 *
 * - `connectorTypes` is itself a comma-separated list (e.g. "CCS2,Type2_AC")
 *   so the cell must be wrapped in double quotes when it contains commas.
 * - `sourceUrl` is required — every manual entry has to link back to a
 *   public reference (news article, blog post, Facebook post) so we can
 *   audit later.
 * - Lines starting with `#` and blank lines are skipped, so the CSV can
 *   double as a working notebook.
 */

const EXPECTED_COLUMNS = 10;
const VIETNAM_LAT = { min: 8.0, max: 23.5 };
const VIETNAM_LNG = { min: 102.0, max: 110.0 };

export interface ManualStationRow {
  readonly name: string;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly province: string;
  readonly provider: string;
  readonly connectorTypes: ReadonlyArray<string>;
  readonly maxPowerKw: number;
  readonly stationType: string;
  readonly sourceUrl: string;
}

/**
 * Minimal CSV cell splitter that handles double-quoted cells with embedded
 * commas. Pulled in inline rather than importing a CSV library — every row
 * we'll ever process here is hand-edited in a text editor, so the parser
 * has the simplest possible job.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let insideQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }
    if (ch === ',' && !insideQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parseManualCsv(csv: string): ManualStationRow[] {
  const lines = csv.split(/\r?\n/);
  const rows: ManualStationRow[] = [];
  let lineNumber = 0;
  let sawHeader = false;

  for (const rawLine of lines) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!sawHeader) {
      sawHeader = true;
      continue;
    }

    const cells = splitCsvLine(rawLine);
    if (cells.length !== EXPECTED_COLUMNS) {
      throw new Error(
        `Line ${lineNumber}: expected ${EXPECTED_COLUMNS} columns, got ${cells.length}`,
      );
    }
    const [name, address, latStr, lngStr, province, provider, connectorStr, powerStr, stationType, sourceUrl] = cells;

    const latitude = parseFloat(latStr);
    if (!Number.isFinite(latitude)) {
      throw new Error(`Line ${lineNumber}: invalid latitude "${latStr}"`);
    }
    const longitude = parseFloat(lngStr);
    if (!Number.isFinite(longitude)) {
      throw new Error(`Line ${lineNumber}: invalid longitude "${lngStr}"`);
    }
    if (latitude < VIETNAM_LAT.min || latitude > VIETNAM_LAT.max) {
      throw new Error(`Line ${lineNumber}: latitude ${latitude} outside Vietnam bounds`);
    }
    if (longitude < VIETNAM_LNG.min || longitude > VIETNAM_LNG.max) {
      throw new Error(`Line ${lineNumber}: longitude ${longitude} outside Vietnam bounds`);
    }
    if (!sourceUrl) {
      throw new Error(`Line ${lineNumber}: sourceUrl is required for manual entries`);
    }

    const maxPowerKw = parseFloat(powerStr);
    rows.push({
      name,
      address,
      latitude,
      longitude,
      province,
      provider,
      connectorTypes: connectorStr.split(',').map((c) => c.trim()).filter(Boolean),
      maxPowerKw: Number.isFinite(maxPowerKw) ? maxPowerKw : 0,
      stationType,
      sourceUrl,
    });
  }
  return rows;
}
