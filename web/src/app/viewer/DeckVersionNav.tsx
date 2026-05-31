"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import PortalPopover from "@/components/PortalPopover";

const TEAL_BG = "#E1F5EE";
const TEAL_TEXT = "#085041";

export type VersionNavItem = {
  version: number;
  createdAt: string; // ISO
};

type Props = {
  deckId: string;
  title: string | null;
  /** Latest version number — the chip always shows this. */
  currentVersion: number;
  /** Version currently being viewed (== current unless browsing history). */
  viewingVersion: number;
  versions: VersionNavItem[];
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
}: Props) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);

  // Always include the current version in the list, even for legacy decks with
  // no snapshots, so the chip's dropdown is never empty.
  const rows: VersionNavItem[] = versions.some((v) => v.version === currentVersion)
    ? versions
    : [{ version: currentVersion, createdAt: "" }, ...versions];
  const ordered = [...rows].sort((a, b) => b.version - a.version);

  return (
    <div className="flex items-center gap-2 min-w-0">
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
        aria-label={`Version ${currentVersion} — view version history`}
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 transition-opacity hover:opacity-80"
        style={{ backgroundColor: TEAL_BG, color: TEAL_TEXT }}
      >
        {`v${currentVersion}`}
      </button>

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
                  <div
                    className="flex items-center gap-3 px-3.5 py-2"
                    style={isCurrent ? { backgroundColor: TEAL_BG } : undefined}
                  >
                    <span
                      className="inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0"
                      style={
                        isCurrent
                          ? { backgroundColor: "#ffffff", color: TEAL_TEXT }
                          : { backgroundColor: "#f0eff7", color: "#4A3FB5" }
                      }
                    >
                      v{v.version}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className="text-xs font-medium truncate"
                        style={isCurrent ? { color: TEAL_TEXT } : { color: "#2a2a33" }}
                      >
                        {isCurrent ? "Current version" : `Version ${v.version}`}
                        {isViewing && !isCurrent && (
                          <span className="ml-1.5 font-semibold">· viewing</span>
                        )}
                      </span>
                      <span className="text-[11px] text-muted truncate">
                        {v.createdAt ? formatWhen(v.createdAt) : "—"}
                      </span>
                    </div>
                    {isCurrent ? (
                      viewingVersion === currentVersion ? (
                        <span
                          className="text-[11px] font-semibold shrink-0"
                          style={{ color: TEAL_TEXT }}
                        >
                          current
                        </span>
                      ) : (
                        <Link
                          href={`/viewer?id=${deckId}`}
                          onClick={() => setOpen(false)}
                          className="text-xs font-semibold text-brand hover:text-brand-hover shrink-0"
                        >
                          view
                        </Link>
                      )
                    ) : (
                      <Link
                        href={`/viewer?id=${deckId}&v=${v.version}`}
                        onClick={() => setOpen(false)}
                        className="text-xs font-semibold text-brand hover:text-brand-hover shrink-0"
                      >
                        view
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </PortalPopover>
    </div>
  );
}
