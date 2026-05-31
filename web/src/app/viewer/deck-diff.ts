// Derive an HONEST summary of what changed between two captured deck HTML
// snapshots, by comparing them slide-by-slide. We have the full stored HTML for
// every version, so this is real structural change-tracking — not a guess.
//
// Server-safe: pure string/regex work, no DOM (runs in the Next.js server).
// Slides are split on their start markers (the same markers countSlides keys
// on) and compared by normalised content, so an unchanged slide matches and a
// regenerated one doesn't.

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Split a deck's HTML into one normalised string per slide. Prefers explicit
// `.slide` class elements (Claude's inline-deck format), falls back to
// `<section>` blocks. Boundary-split: each chunk runs from one slide marker to
// the next, which is consistent across versions so content equality is stable.
export function splitSlidesForDiff(html: string): string[] {
  if (!html || !html.trim()) return [];

  // Element whose class attribute contains "slide" as a whole token (so
  // "slide-number" / "slide-title" don't count) — mirrors countSlides.
  const slideClassRe =
    /<[a-zA-Z][^>]*\bclass\s*=\s*"(?:[^"]*\s)?slide(?:\s[^"]*)?"[^>]*>/gi;
  const sectionRe = /<section\b[^>]*>/gi;

  const collect = (re: RegExp): number[] => {
    const out: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) out.push(m.index);
    return out;
  };

  let positions = collect(slideClassRe);
  if (positions.length === 0) positions = collect(sectionRe);
  if (positions.length === 0) return [normalize(html)];

  const chunks: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : html.length;
    chunks.push(normalize(html.slice(start, end)));
  }
  return chunks;
}

export type DeckChange = {
  oldCount: number;
  newCount: number;
  /** Slides in the new version not present (by content) in the old one — i.e.
   *  added or revised. */
  newOrRevised: number;
  /** Net slide-count delta (positive = added, negative = removed). */
  net: number;
};

export function summarizeDeckChange(
  oldHtml: string,
  newHtml: string,
): DeckChange {
  const oldSlides = splitSlidesForDiff(oldHtml);
  const newSlides = splitSlidesForDiff(newHtml);
  const oldSet = new Set(oldSlides);

  let unchanged = 0;
  for (const s of newSlides) {
    if (oldSet.has(s)) unchanged++;
  }

  return {
    oldCount: oldSlides.length,
    newCount: newSlides.length,
    newOrRevised: newSlides.length - unchanged,
    net: newSlides.length - oldSlides.length,
  };
}

// Human-readable banner detail. Leads with the version jump, then the most
// useful honest fact we can derive: how much of the current deck differs from
// the version the user last saw. `change` may be null if the old snapshot
// wasn't available (then we show the version jump alone).
export function describeChange(
  fromVersion: number,
  toVersion: number,
  change: DeckChange | null,
): string {
  const parts = [`v${fromVersion} → v${toVersion}`];
  if (change) {
    const added = change.net > 0 ? change.net : 0;
    const removed = change.net < 0 ? -change.net : 0;
    // Slides that changed in place ≈ new-or-revised minus the net additions.
    const revised = Math.max(0, change.newOrRevised - added);

    const bits: string[] = [];
    if (added > 0) bits.push(`${added} slide${added === 1 ? "" : "s"} added`);
    if (removed > 0)
      bits.push(`${removed} slide${removed === 1 ? "" : "s"} removed`);
    if (revised > 0)
      bits.push(`${revised} slide${revised === 1 ? "" : "s"} revised`);

    if (bits.length > 0) {
      parts.push(bits.join(", "));
    } else if (change.newOrRevised > 0) {
      parts.push(
        `${change.newOrRevised} of ${change.newCount} slides updated`,
      );
    }
  }
  return parts.join(" · ");
}
