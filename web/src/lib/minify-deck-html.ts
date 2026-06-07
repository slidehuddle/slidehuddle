// Read-path HTML minifier.
//
// Purpose: shrink the *transient* copy of a deck that the MCP read tools
// (get_deck_slides / fetch) hand to the model, so it fits Anthropic's 25k-token
// tool-result limit — WITHOUT modifying the stored deck. The output is only ever
// READ by the model (never rendered in a browser, never written back to the
// database: when the assistant saves a revision it emits its own fresh HTML).
// So this optimises for "same content, fewer tokens", not render-fidelity.
//
// What it guarantees (asserted by the verification harness against real decks):
//   - All VISIBLE TEXT is preserved word-for-word (only whitespace normalised).
//   - Every ELEMENT is preserved (the per-tag element inventory is unchanged).
//   - <script>, <pre>, and <textarea> contents are preserved BYTE-FOR-BYTE
//     (their whitespace can be semantically significant — JS newlines, preformatted
//     text — so we never touch them).
//   - <style> contents keep every selector and declaration; only CSS whitespace
//     and /* comments */ are collapsed (CSS has no newline-sensitivity, and the
//     big SlideHuddle decks are CSS-heavy, so this is where the real savings are).
//
// What it intentionally drops (none of which changes the content the model reads):
//   - HTML comments, indentation, line breaks, and whitespace that sits purely
//     between tags. Because the copy is never rendered, collapsing inter-tag
//     whitespace cannot cause a visible layout change.

// Blocks whose inner text is whitespace-sensitive: preserved verbatim.
const PROTECT_RE = /<(script|pre|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;
// <style> blocks: kept inline, but their CSS body is whitespace-collapsed.
const STYLE_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

// NUL byte — effectively never present in real deck HTML, so a placeholder built
// from it can't collide with document content, and (being non-whitespace) it is
// inert to the whitespace-collapsing passes.
const NUL = String.fromCharCode(0);
function placeholder(i: number): string {
  return `${NUL}${i}${NUL}`;
}
const PLACEHOLDER_RE = new RegExp(`${NUL}(\\d+)${NUL}`, "g");

// Collapse CSS whitespace + strip CSS comments, preserving every selector and
// declaration. Standard, low-risk CSS minification (CSS is not newline-sensitive).
function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "") // CSS comments
    .replace(/\s+/g, " ") // collapse whitespace runs
    .replace(/\s*([{}:;,>~+])\s*/g, "$1") // tighten around separators/combinators
    .replace(/;}/g, "}") // drop the redundant final semicolon in a block
    .trim();
}

/**
 * Minify a deck's HTML for inclusion in an MCP read-tool result. See the file
 * header for the exact preservation guarantees. Safe to call on any string; on
 * malformed HTML it degrades to "less minified", never to data loss.
 */
export function minifyDeckHtmlForRead(html: string): string {
  if (!html) return html;

  // 1. Stash whitespace-sensitive blocks verbatim so later steps can't touch them.
  const protectedBlocks: string[] = [];
  let work = html.replace(PROTECT_RE, (m) => {
    protectedBlocks.push(m);
    return placeholder(protectedBlocks.length - 1);
  });

  // 2. Collapse CSS whitespace inside <style> (kept inline — CSS is the bulk of
  //    the large decks' weight).
  work = work.replace(
    STYLE_RE,
    (_m, open: string, body: string, close: string) =>
      open + minifyCss(body) + close,
  );

  // 3. Minify ordinary markup: drop HTML comments, collapse whitespace runs to a
  //    single space, and remove whitespace that sits purely between tags.
  work = work
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

  // 4. Restore the protected blocks unchanged.
  work = work.replace(PLACEHOLDER_RE, (_m, i: string) => {
    const block = protectedBlocks[Number(i)];
    return block ?? "";
  });

  return work;
}
