// PDF-export print view — /viewer/print?id=<deck>&v=<version>
//
// A standalone page that renders EVERY slide of one deck version at natural
// size, one per printed page, and opens the browser's print dialog ("Save as
// PDF"). The browser's own engine — the same one that renders the slides on
// screen — produces the PDF, so the export is faithful by construction (no
// re-implementation, no screenshot approximation, no server-side browser).
//
// ACCESS MODEL (security note): this page reads the deck EXACTLY like /viewer
// does — a by-id fetch via the same slide-store functions. Export is a read of
// a deck the visitor can already view (anyone with the link); the ?v= version
// lens works the same as the viewer's. No new auth/RLS/service-role/MCP
// surface, and no new way to read decks.
import { getDeckMeta, getDeckVersionHtml, getStoredSlides } from "@/lib/slide-store";
import PrintView from "./PrintView";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; v?: string }>;
}) {
  const { id, v } = await searchParams;

  if (!id) {
    return <PrintView rawHtml={null} title={null} version={1} deckId={null} error="No deck was specified. Open a deck and use its Export button." />;
  }

  const deck = await getDeckMeta(id);
  if (!deck) {
    return <PrintView rawHtml={null} title={null} version={1} deckId={id} error="This deck couldn't be found. It may have been deleted." />;
  }

  // Version lens — mirrors /viewer: ?v= picks a past snapshot; anything
  // missing/invalid/equal-to-current falls through to the current deck HTML.
  const currentVersion = deck.version ?? 1;
  const requestedV = v ? parseInt(v, 10) : NaN;
  const wantsHistorical =
    Number.isFinite(requestedV) && requestedV >= 1 && requestedV !== currentVersion;

  let rawHtml: string | null = null;
  let version = currentVersion;
  let error: string | null = null;

  if (wantsHistorical) {
    const vHtml = await getDeckVersionHtml(id, requestedV);
    if (vHtml) {
      rawHtml = vHtml;
      version = requestedV;
    } else {
      error = `Version ${requestedV} of this deck couldn't be loaded.`;
    }
  } else {
    const slidesLoad = await getStoredSlides(id);
    if (slidesLoad.failed || !slidesLoad.html) {
      error = "This deck's slides couldn't be loaded. Please try again.";
    } else {
      rawHtml = slidesLoad.html;
    }
  }

  return (
    <PrintView
      rawHtml={rawHtml}
      title={deck.title}
      version={version}
      deckId={id}
      error={error}
    />
  );
}
