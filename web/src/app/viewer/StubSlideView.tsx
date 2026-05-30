import type { StubRow } from "@/lib/slide-store";

// Display for a requested ("stub") slide — a white card with a dashed border
// and the request details, shown in place of the sandboxed iframe when the
// active item is a stub. Left-justified, vertically centred, capped width.

function displayName(email: string | null): string {
  if (!email) return "a teammate";
  const local = email.split("@")[0];
  return local || email;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

export default function StubSlideView({ stub }: { stub: StubRow }) {
  // Fills the card it's placed in — the parent sizes that card to match the
  // imported slides (and resizes it when the comments panel opens), so a
  // requested slide reads at the same size, position and aspect ratio.
  return (
    <div
      className="w-full h-full bg-white rounded-xl flex items-start overflow-hidden"
      style={{ border: "2px dashed #c9c6e6" }}
    >
      {/* Content is TOP-anchored (not centred) so the "Requested by" pill sits
          at the same height on every requested slide regardless of how much
          follows it; whatever the user adds flows beneath. The pt is a % of
          card width — which tracks card height too since the aspect ratio is
          fixed — so the anchor stays proportional as the card resizes. Uses
          most of the card width and scrolls if a long request overflows. */}
      <div className="w-full max-h-full overflow-auto px-[6%] pt-[8%] pb-8">
        <div className="flex flex-col gap-5 w-full max-w-[920px]">
          <span
            className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: "#E1F5EE", color: "#085041" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Requested by {displayName(stub.requested_by_email)}
          </span>

          <div className="flex flex-col gap-1">
            <FieldLabel>Title</FieldLabel>
            <span className="text-[22px] font-medium text-foreground leading-snug">
              {stub.title || "Untitled slide"}
            </span>
          </div>

          {stub.subtitle && (
            <div className="flex flex-col gap-1">
              <FieldLabel>Subtitle</FieldLabel>
              <span className="text-[16px] text-muted leading-snug">
                {stub.subtitle}
              </span>
            </div>
          )}

          {stub.body && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>What should this slide cover</FieldLabel>
              <p className="w-full text-[14px] text-foreground leading-relaxed rounded-lg bg-black/[0.04] px-4 py-3.5 whitespace-pre-wrap">
                {stub.body}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
