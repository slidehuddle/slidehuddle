// Turn the team's contributions (comments, requested stub slides, removal
// flags) into a clean, structured prompt the deck owner can paste into Claude
// to revise the deck. Pure + framework-agnostic so it can be unit-tested and
// reused.
//
// Ordering: lines are sorted by the slide they relate to, so Claude reads the
// feedback top-to-bottom through the deck. A requested slide "after slide N"
// sorts just after slide N's own comments/flag. A removal flag sorts after the
// comments on the same slide.

import type { CommentRow, FlagRow, StubRow } from "@/lib/slide-store";

export type FeedbackInputs = {
  comments: Pick<CommentRow, "slide_index" | "body">[];
  flags: Pick<FlagRow, "slide_index" | "reason">[];
  stubs: Pick<StubRow, "position" | "title" | "subtitle" | "body">[];
};

const HEADER = "Please revise this deck based on the team's feedback:";

// Returns the prompt text, or null when there's no feedback at all (so the UI
// can disable the button rather than copy an empty prompt).
export function buildFeedbackPrompt(input: FeedbackInputs): string | null {
  type Line = { sort: number; sub: number; text: string };
  const lines: Line[] = [];

  for (const c of input.comments) {
    const body = (c.body ?? "").trim();
    if (!body) continue;
    lines.push({
      sort: c.slide_index,
      sub: 0,
      text: `- Slide ${c.slide_index + 1}: ${body}`,
    });
  }

  for (const f of input.flags) {
    const reason = (f.reason ?? "").trim();
    lines.push({
      sort: f.slide_index,
      sub: 1,
      text: `- Slide ${f.slide_index + 1}: flagged for removal${
        reason ? ` — ${reason}` : ""
      }`,
    });
  }

  for (const s of input.stubs) {
    const parts: string[] = [];
    const title = (s.title ?? "").trim();
    const subtitle = (s.subtitle ?? "").trim();
    const body = (s.body ?? "").trim();
    if (title) parts.push(`Title: ${title}`);
    if (subtitle) parts.push(`Subtitle: ${subtitle}`);
    if (body) parts.push(`Should cover: ${body}`);
    if (parts.length === 0) continue;
    // position = number of real slides before the stub. 0 → before slide 1.
    const where =
      s.position <= 0 ? "before slide 1" : `after slide ${s.position}`;
    lines.push({
      // Place "after slide N" (position N) just after slide N's lines. Slide N
      // has sort index N-1, so use position - 0.5.
      sort: s.position - 0.5,
      sub: 2,
      text: `- New slide requested ${where}: ${parts.join(", ")}`,
    });
  }

  if (lines.length === 0) return null;

  lines.sort((a, b) => a.sort - b.sort || a.sub - b.sub);
  return `${HEADER}\n${lines.map((l) => l.text).join("\n")}`;
}
