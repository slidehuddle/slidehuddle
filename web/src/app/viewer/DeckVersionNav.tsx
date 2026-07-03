"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import PortalPopover from "@/components/PortalPopover";

// Version accent — purple (green is reserved for user feedback).
const PURPLE_BG = "#ECE9F9";
const PURPLE_TEXT = "#3A2E8F";
const WARN_RED = "#B42318";

export type VersionNavItem = {
  version: number;
  createdAt: string; // ISO
};

type Props = {
  deckId: string;
  title: string | null;
  /** Latest version number. */
  currentVersion: number;
  /** Version currently being viewed (== current unless browsing history). */
  viewingVersion: number;
  versions: VersionNavItem[];
  /** The `?view=` value to preserve when switching versions (e.g. "spectrum"),
   *  so selecting a version keeps the current surface instead of dropping back
   *  to the default viewer. Omitted → plain `/viewer?id=…` (classic/floating). */
  viewParam?: string;
  /** The `?mode=` value (deck/split/feed) to preserve alongside the view, so a
   *  version switch keeps the split ratio the user picked. Spectrum only. */
  modeParam?: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DeckVersionNav({
  deckId,
  title,
  currentVersion,
  viewingVersion,
  versions,
  viewParam,
  modeParam,
}: Props) {
  // Preserve the current surface (e.g. ?view=spectrum) AND split mode across a
  // version switch, so selecting a version stays put instead of resetting.
  const viewSuffix =
    (viewParam ? `&view=${viewParam}` : "") +
    (modeParam ? `&mode=${modeParam}` : "");
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);

  // Always include the current version in the list, even for legacy decks with
  // no snapshots, so the chip's dropdown is never empty.
  const rows: VersionNavItem[] = versions.some((v) => v.version === currentVersion)
    ? versions
    : [{ version: currentVersion, createdAt: "" }, ...versions];
  const ordered = [...rows].sort((a, b) => b.version - a.version);

  // There's something to choose from only when more than one version exists.
  const hasChoices = ordered.length > 1;
  // The user is browsing a past version (not the latest).
  const viewingOlder = viewingVersion !== currentVersion;
  const olderWarning = `You're viewing an older version (v${viewingVersion}). The latest is v${currentVersion}.`;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {title && (
        <span className="text-sm font-semibold text-foreground truncate max-w-[40vw]">
          {title}
        </span>
      )}
      <button
        ref={chipRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          viewingOlder
            ? `Version ${viewingVersion} (older than the latest, v${currentVersion}) — view version history`
            : `Version ${viewingVersion} — view version history`
        }
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 transition-opacity hover:opacity-80"
        style={
          viewingOlder
            ? // older version selected → black on white (with a hairline ring)
              {
                backgroundColor: "#ffffff",
                color: "#1D1D1B",
                boxShadow: "inset 0 0 0 1px #d9d9e3",
              }
            : { backgroundColor: PURPLE_BG, color: PURPLE_TEXT }
        }
      >
        {`v${viewingVersion}`}
        {hasChoices && (
          // small down-triangle: more versions are available to choose from
          <svg
            width="8"
            height="8"
            viewBox="0 0 10 10"
            fill="currentColor"
            aria-hidden="true"
            className="opacity-70"
          >
            <path d="M1 3l4 4 4-4z" />
          </svg>
        )}
      </button>

      {/* Red warning triangle (white "!" inside) when viewing an older version. */}
      {viewingOlder && (
        <span
          title={olderWarning}
          aria-label={olderWarning}
          role="img"
          className="inline-flex items-center shrink-0 cursor-help"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              fill={WARN_RED}
            />
            <line
              x1="12"
              y1="9"
              x2="12"
              y2="13.5"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="12"
              y1="17"
              x2="12.01"
              y2="17"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}

      <PortalPopover
        anchorRef={chipRef}
        open={open}
        onClose={() => setOpen(false)}
        width={300}
        placement="bottom-center"
      >
        <div
          className="rounded-xl border border-border bg-white shadow-[0_12px_40px_rgba(0,0,0,0.15)] overflow-hidden"
          role="dialog"
          aria-label="Version history"
        >
          <div className="px-3.5 py-2.5 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Version history
            </h3>
          </div>
          <ul className="max-h-[320px] overflow-y-auto py-1">
            {ordered.map((v) => {
              const isCurrent = v.version === currentVersion;
              const isViewing = v.version === viewingVersion;
              return (
                <li key={v.version}>
                  {/* Whole row is the click target — selecting it brings up that
                      version (not just a small "view" link). Hover previews the
                      row you're about to select; the row you're currently
                      viewing stays highlighted in purple. */}
                  <Link
                    href={
                      isCurrent
                        ? `/viewer?id=${deckId}${viewSuffix}`
                        : `/viewer?id=${deckId}&v=${v.version}${viewSuffix}`
                    }
                    onClick={() => setOpen(false)}
                    aria-current={isViewing ? "true" : undefined}
                    className="flex items-center gap-3 px-3.5 py-2 transition-colors hover:bg-black/[0.04]"
                    style={isViewing ? { backgroundColor: PURPLE_BG } : undefined}
                  >
                    <span
                      className="inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0"
                      style={
                        isViewing
                          ? { backgroundColor: "#ffffff", color: PURPLE_TEXT }
                          : { backgroundColor: "#f0eff7", color: "#4A3FB5" }
                      }
                    >
                      v{v.version}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className="text-xs font-medium truncate"
                        style={{ color: isViewing ? PURPLE_TEXT : "#2a2a33" }}
                      >
                        {isCurrent ? "Current version" : `Version ${v.version}`}
                      </span>
                      <span className="text-[11px] text-muted truncate">
                        {v.createdAt ? formatWhen(v.createdAt) : "—"}
                      </span>
                    </div>
                    {isCurrent ? (
                      <span
                        className="text-[11px] font-semibold shrink-0"
                        style={{ color: isViewing ? PURPLE_TEXT : "#9a9aa5" }}
                      >
                        current
                      </span>
                    ) : isViewing ? (
                      <span
                        className="text-[11px] font-semibold shrink-0"
                        style={{ color: PURPLE_TEXT }}
                      >
                        viewing
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </PortalPopover>
    </div>
  );
}
