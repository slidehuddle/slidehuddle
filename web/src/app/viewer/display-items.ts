import type { StubRow } from "@/lib/slide-store";

// The viewer shows a single ordered sequence built from two sources: the
// deck's real slides (stable 0-based indices into the parsed HTML) and any
// requested stub slides. A stub's `position` is the number of real slides
// that come before it, so position = 0 means "before slide 1" and
// position = N (slide count) means "after the last slide". Real slides are
// never renumbered — stubs are purely an overlay, which keeps comment and
// flag slide_index values stable no matter how many stubs get inserted.

export type DisplayItem =
  | { kind: "slide"; slideIndex: number }
  | { kind: "stub"; stub: StubRow };

export function buildDisplayItems(
  slideCount: number,
  stubs: StubRow[],
): DisplayItem[] {
  const sorted = [...stubs].sort(
    (a, b) =>
      a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const items: DisplayItem[] = [];
  let cursor = 0; // index into `sorted`
  for (let i = 0; i <= slideCount; i++) {
    while (cursor < sorted.length && sorted[cursor].position <= i) {
      items.push({ kind: "stub", stub: sorted[cursor] });
      cursor++;
    }
    if (i < slideCount) items.push({ kind: "slide", slideIndex: i });
  }
  // Any stubs with a position beyond slideCount (e.g. left over after slides
  // were removed upstream) land at the very end so they're never dropped.
  while (cursor < sorted.length) {
    items.push({ kind: "stub", stub: sorted[cursor] });
    cursor++;
  }
  return items;
}

// The `position` a new stub should get if inserted into the gap that sits
// just before display item `gapIndex` (gapIndex ranges 0..items.length).
// It's the count of real slides appearing before that gap.
export function positionForGap(
  items: DisplayItem[],
  gapIndex: number,
): number {
  let count = 0;
  for (let i = 0; i < gapIndex && i < items.length; i++) {
    if (items[i].kind === "slide") count++;
  }
  return count;
}
