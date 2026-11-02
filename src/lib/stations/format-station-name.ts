/**
 * Display formatting for station names. Display only: stored names and the
 * crawler output keep the feed's raw text.
 *
 * The VinFast feed marks expressway stations on each carriageway with a
 * literal "<chiều đi>" (outbound) or "<chiều về>" (return) tag. The direction
 * is what tells two otherwise identically named stations apart, so full-name
 * surfaces keep it as plain text "(chiều đi)"; space-constrained labels drop it.
 */

const DIRECTION_TAG = /\s*<\s*(chiều\s+(?:đi|về))\s*>\s*/giu;

function tidy(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function formatStationName(name: string): string {
  return tidy(
    name.normalize('NFC').replace(DIRECTION_TAG, (_, dir: string) => ` (${dir.toLowerCase().replace(/\s+/g, ' ')}) `),
  );
}

export function stripDirectionTag(name: string): string {
  return tidy(name.normalize('NFC').replace(DIRECTION_TAG, ' '));
}
