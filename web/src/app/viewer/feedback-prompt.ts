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
  stubs: (Pick<StubRow, "position" | "title" | "subtitle" | "body"> & {
    /** Owner's edited description; when set, used verbatim instead of the
     *  composed title/subtitle/body line. */
    owner_edited_body?: string | null;
  })[];
};

// Owner curation, applied identically everywhere the team's feedback is turned
// into a prompt. Drop dismissed items; where the owner edited an item, send the
// owner's words instead of the original author's. The original author fields
// (`body`, `reason`) are never mutated — we only choose which text to forward.
//
// This was previously inlined in the viewer (SlideViewer.tsx). It's lifted here
// so the web "Send to Claude" button and the MCP `get_feedback` tool share ONE
// definition of "the curated set" and can never drift apart.
export function selectCuratedFeedback(
  comments: Pick<
    CommentRow,
    "slide_index" | "body" | "dismissed" | "owner_edited_body"
  >[],
  flags: Pick<
    FlagRow,
    "slide_index" | "reason" | "dismissed" | "owner_edited_reason"
  >[],
  stubs: Pick<
    StubRow,
    | "position"
    | "title"
    | "subtitle"
    | "body"
    | "dismissed"
    | "owner_edited_body"
  >[],
): FeedbackInputs {
  return {
    comments: comments
      .filter((c) => !c.dismissed)
      .map((c) => ({
        slide_index: c.slide_index,
        body: c.owner_edited_body ?? c.body,
      })),
    flags: flags
      .filter((f) => !f.dismissed)
      .map((f) => ({
        slide_index: f.slide_index,
        reason: f.owner_edited_reason ?? f.reason,
      })),
    stubs: stubs
      .filter((s) => !s.dismissed)
      .map((s) => ({
        position: s.position,
        title: s.title,
        subtitle: s.subtitle,
        body: s.body,
        owner_edited_body: s.owner_edited_body,
      })),
  };
}

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
    // The owner's edited description, when present, replaces the composed
    // title/subtitle/body line verbatim.
    const edited = (s.owner_edited_body ?? "").trim();
    let description: string;
    if (edited) {
      description = edited;
    } else {
      const parts: string[] = [];
      const title = (s.title ?? "").trim();
      const subtitle = (s.subtitle ?? "").trim();
      const body = (s.body ?? "").trim();
      if (title) parts.push(`Title: ${title}`);
      if (subtitle) parts.push(`Subtitle: ${subtitle}`);
      if (body) parts.push(`Should cover: ${body}`);
      if (parts.length === 0) continue;
      description = parts.join(", ");
    }
    // position = number of real slides before the stub. 0 → before slide 1.
    const where =
      s.position <= 0 ? "before slide 1" : `after slide ${s.position}`;
    lines.push({
      // Place "after slide N" (position N) just after slide N's lines. Slide N
      // has sort index N-1, so use position - 0.5.
      sort: s.position - 0.5,
      sub: 2,
      text: `- New slide requested ${where}: ${description}`,
    });
  }

  if (lines.length === 0) return null;

  lines.sort((a, b) => a.sort - b.sort || a.sub - b.sub);
  return `${HEADER}\n${lines.map((l) => l.text).join("\n")}`;
}
