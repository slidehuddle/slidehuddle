"use client";

// The client half of /viewer/print (see page.tsx for the access model).
//
// Renders every slide, one per printed page, through the SAME
// parseDeck+buildSrcdoc path and the SAME iframe sandbox as the viewer:
// sandbox="allow-scripts", never allow-same-origin — the sandbox invariant
// holds here too.
//
// CLICK-THROUGH, not auto-print (founder fix round 3, 2026-07-03): the first
// two rounds auto-opened the print dialog, which surprised the user before any
// guidance was readable — and Windows' default destination ("Microsoft Print
// to PDF") rotates landscape output sideways, a driver bug no CSS can reach.
// Now a READY CARD carries the one instruction that matters (Destination →
// "Save as PDF") and the dialog opens only on the user's click. The PDF's
// filename comes from document.title: "{deck title} — v{N}".
//
// parseDeck uses DOMParser (browser-only), so parsing is deferred to an
// effect — this component renders an SSR-safe loading shell first.

import { useEffect, useState } from "react";
import { parseDeck, buildSrcdoc, type ParsedDeck } from "../parse-deck";

// Deterministic paper: **A4 LANDSCAPE**, slide scaled to fit and centred
// (thin white letterbox bars — A4 is 1.41:1, slides usually 16:9). The first
// build used slide-sized custom @page boxes, but only the browser's own
// "Save as PDF" destination honours those; printer-driver destinations (e.g.
// Windows' default "Microsoft Print to PDF") force A4/Letter PORTRAIT and
// rotate/crop the output (founder-hit twice, 2026-07-03). A named paper size
// + the `landscape` keyword is understood by every print pipeline.
const MM_TO_PX = 96 / 25.4;
// Sheets sit a hair inside true A4 landscape (297×210mm) so sub-pixel
// rounding can never spill a sheet onto an interleaved blank page.
const SHEET_W_MM = 296;
const SHEET_H_MM = 209;

export default function PrintView({
  rawHtml,
  title,
  version,
  deckId,
  error = null,
}: {
  rawHtml: string | null;
  title: string | null;
  version: number;
  deckId: string | null;
  /** Server-side load failure — renders the error state instead of slides. */
  error?: string | null;
}) {
  const [deck, setDeck] = useState<ParsedDeck | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  // True while the warm-up walk runs / the dialog is open — guards a second
  // window.print() from queuing another dialog behind the first (founder-hit:
  // "the print popup stayed" after saving).
  const [printing, setPrinting] = useState(false);
  // The dialog has been through at least one open→close cycle — flips the
  // ready card to its "PDF saved?" follow-up copy.
  const [printedOnce, setPrintedOnce] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (rawHtml !== null) setDeck(parseDeck(rawHtml));
  }, [rawHtml]);

  // The sideways-PDF trap is WINDOWS-ONLY ("Microsoft Print to PDF" is a
  // Windows driver; it doesn't exist on Mac/Linux), so the destination warning
  // shows only there. Detected client-side after mount (navigator is
  // browser-only; the banner itself only renders client-side anyway).
  // NB: match "windows"/"^win", never bare /win/i — "Darwin" contains "win".
  const [isWindows, setIsWindows] = useState(false);
  useEffect(() => {
    const uaData = (navigator as { userAgentData?: { platform?: string } })
      .userAgentData;
    const detected = uaData?.platform
      ? uaData.platform === "Windows"
      : /^win/i.test(navigator.platform || "") ||
        /windows/i.test(navigator.userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsWindows(detected);
  }, []);

  // afterprint fires when the dialog closes (saved OR cancelled) — either way
  // printing is over and the follow-up copy applies.
  useEffect(() => {
    const done = () => {
      setPrinting(false);
      setPrintedOnce(true);
    };
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);

  // The PDF filename = the document title at print time. Next's metadata
  // system re-applies the layout title after hydration (overwriting anything
  // set on mount), so the title is (re)asserted INSIDE printNow — the moment
  // the browser samples it for the filename.
  //
  // Warm-up walk: Chromium can rasterize offscreen (out-of-process, and our
  // sandboxed frames qualify) iframes lazily, which prints far-down slides as
  // BLANK pages. Walking every sheet through the viewport once forces each
  // slide to paint before the print snapshot is taken.
  const printNow = async () => {
    if (printing) return;
    setPrinting(true);
    const sheetEls = [...document.querySelectorAll(".sh-sheet")];
    for (const el of sheetEls) {
      el.scrollIntoView({ block: "center" });
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    document.title = `${title ?? "SlideHuddle deck"} — v${version}`;
    window.print();
  };

  const total = deck?.slides.length ?? 0;
  const allLoaded = deck !== null && total > 0 && loadedCount >= total;

  const empty = deck !== null && total === 0;
  const showError = error ?? (empty ? "This deck has no slides to export." : null);

  const w = deck?.slideWidth ?? 1280;
  const h = deck?.slideHeight ?? 720;
  // Scale the slide's natural canvas onto the A4-landscape sheet (contain —
  // never crop). 16:9 decks fill the width with bars top/bottom; taller decks
  // (4:3) fill the height with bars at the sides.
  const scale = Math.min(
    (SHEET_W_MM * MM_TO_PX) / w,
    (SHEET_H_MM * MM_TO_PX) / h,
  );

  return (
    <div className="min-h-full bg-[#f4f4f6]">
      {/* Print geometry: each page IS one slide — the page box matches the
          slide canvas exactly, margins zero, backgrounds forced on. The screen
          view doubles as the preview (grey desk, white sheets); all screen-only
          chrome carries .sh-noprint. */}
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        .sh-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
          .sh-noprint { display: none !important; }
          .sh-sheets { padding: 0 !important; }
          .sh-sheet { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Top bar — screen only. Loading → progress; ready → the print action. */}
      <div className="sh-noprint sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/10 bg-white px-4 py-2.5">
        <p className="min-w-0 truncate text-sm text-[#1d1d1b]">
          <span className="font-semibold">
            {title ?? "SlideHuddle deck"} · v{version}
          </span>
          {!showError && (
            <span className="text-[#6b6b75]">
              {" "}
              —{" "}
              {allLoaded
                ? "ready — set Destination to “Save as PDF”."
                : total > 0
                  ? `preparing v${version} for export… ${Math.min(loadedCount, total)} of ${total} slides ready`
                  : `preparing v${version} for export…`}
            </span>
          )}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {!showError && (
            <button
              type="button"
              onClick={printNow}
              disabled={!allLoaded || printing}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                allLoaded && !printing
                  ? "bg-[#4A3FB5] text-white hover:bg-[#3C3489]"
                  : "cursor-default bg-black/[0.06] text-[#9a9aa0]"
              }`}
            >
              {printing ? "Preparing…" : "Print / Save as PDF"}
            </button>
          )}
          {deckId && (
            <a
              href={`/viewer?id=${deckId}`}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[#4A3FB5] hover:bg-[#EEEDFE] transition-colors"
            >
              Back to deck
            </a>
          )}
        </span>
      </div>

      {showError ? (
        <div className="sh-noprint flex flex-col items-center gap-2 px-6 py-24 text-center">
          <p className="text-base font-semibold text-[#1d1d1b]">Couldn&apos;t export</p>
          <p className="max-w-md text-sm text-[#6b6b75]">{showError}</p>
        </div>
      ) : (
        <>
          {/* THE READY CARD — the instruction the user must read BEFORE the
              dialog opens (screen-only). Windows' default destination
              ("Microsoft Print to PDF") rotates landscape output sideways — a
              driver bug outside our reach — so the card names the correct
              destination up front, and the dialog opens only on click. */}
          {allLoaded && (
            <div
              className="sh-noprint mx-auto mt-4 flex items-center justify-between gap-x-6 rounded-xl border border-black/10 bg-white px-5 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
              style={{ width: `${SHEET_W_MM}mm`, maxWidth: "calc(100vw - 32px)" }}
            >
              <p className="min-w-0 text-sm text-[#6b6b75]">
                <strong className="font-semibold text-[#1d1d1b]">
                  {printedOnce
                    ? "PDF saved? If it looks right, you can close this tab."
                    : `Ready — ${total} ${total === 1 ? "slide" : "slides"} · v${version}.`}
                </strong>
                {isWindows && (
                  <>
                    {" "}
                    <svg
                      aria-hidden="true"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#DC2626"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="-mt-0.5 mr-1 inline shrink-0"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Printing from a Windows computer? Please set{" "}
                    <strong className="font-semibold text-[#1d1d1b]">
                      Destination → “Save as PDF”
                    </strong>
                    {" "}— “Microsoft Print to PDF” turns the slides sideways.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={printNow}
                disabled={printing}
                className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                  printing
                    ? "cursor-default bg-black/[0.06] text-[#9a9aa0]"
                    : "bg-[#4A3FB5] text-white hover:bg-[#3C3489]"
                }`}
              >
                {printing ? "Preparing…" : printedOnce ? "Print again" : "Print / Save as PDF"}
              </button>
            </div>
          )}
          <div className="sh-sheets py-6">
          {(deck?.slides ?? []).map((slideHtml, i) => (
            <div
              key={i}
              className="sh-sheet mx-auto mb-6 flex items-center justify-center bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
              style={{
                width: `${SHEET_W_MM}mm`,
                height: `${SHEET_H_MM}mm`,
                overflow: "hidden",
                // One slide per page; no break after the last (avoids a
                // trailing blank page).
                breakAfter: i === total - 1 ? "auto" : "page",
              }}
            >
              {/* The slide at its NATURAL canvas size, scaled (contain) onto
                  the sheet — transform doesn't change layout size, so the flex
                  centring + the sheet's overflow:hidden do the letterboxing. */}
              <div
                className="shrink-0"
                style={{
                  width: w,
                  height: h,
                  transform: `scale(${scale})`,
                  transformOrigin: "center center",
                }}
              >
                {/* Same sandbox as the viewer's display iframe — scripts may run
                    (artifact decks inject content), same-origin NEVER granted. */}
                <iframe
                  title={`Slide ${i + 1}`}
                  sandbox="allow-scripts"
                  srcDoc={buildSrcdoc(slideHtml, deck!.headHtml, deck!.hasAuthoredStyles, {
                    measure: false,
                  })}
                  onLoad={() => setLoadedCount((c) => c + 1)}
                  className="block border-0"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
          ))}
          </div>
        </>
      )}
    </div>
  );
}
