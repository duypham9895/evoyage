// Pure, filesystem-free CSS parser used by the design-token parity test
// (src/lib/design-tokens/tokens.test.ts, D8-A). Finds every `--color-NAME: value;`
// declaration inside a Tailwind v4 `@theme` / `@theme inline` block, brace-matched
// so formatting doesn't matter. Declarations outside a `@theme` block (e.g. a
// `:root` rule) are intentionally ignored — this parser mirrors only the source
// that the TypeScript token export (src/lib/design-tokens/tokens.ts) is meant to
// stay in sync with.

const THEME_BLOCK_START = /@theme(?:\s+inline)?\s*\{/g;
const COLOR_DECLARATION_RE = /--color-([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;

/** Maps `--color-NAME` to its declared value for every `@theme` block in the given CSS source. */
export function parseThemeColorVars(css: string): Record<string, string> {
  const result: Record<string, string> = {};
  const blockStart = new RegExp(THEME_BLOCK_START);
  let match: RegExpExecArray | null;

  while ((match = blockStart.exec(css))) {
    const openBrace = blockStart.lastIndex - 1;
    let depth = 1;
    let i = openBrace + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    const block = css.slice(openBrace + 1, i - 1);
    for (const decl of block.matchAll(COLOR_DECLARATION_RE)) {
      result[decl[1]] = decl[2].trim();
    }
    blockStart.lastIndex = i;
  }

  return result;
}
