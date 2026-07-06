"use client";

// The in-session "{Name} is viewing the deck" nudge (founder-requested
// 2026-07-05) — the presence system's proactive half: the rail dot answers
// "who's here?" if you look; this toast tells you the moment company arrives.
// Same design language as the comment nudge (B12):
//
//   ONE TOAST, NEVER A STACK — simultaneous joiners COALESCE ("Rita and Jo
//   are viewing the deck") and reset the dissolve timer.
//
//   TRANSIENT LAYER — floats bottom-right over the stage, dissolves after
//   ~5s (shorter than the comment nudge: there's nothing to act on), hover
//   pauses, ✕ dismisses. No action button — they're just here.
//
// The parent (FloatingViewer) owns join detection and every suppression rule
// (initial-sync settle, 5-min per-person debounce, never yourself, comments
// win the toast slot); this component only presents.

import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { nameFromEmail } from "./FeedItemCard";

export type NudgeViewer = {
  userId: string;
  email: string | null;
};

const DISSOLVE_MS = 5000;

export default function PresenceNudge({
  items,
  deckOwnerId,
  reducedMotion,
  onDismiss,
}: {
  items: NudgeViewer[];
  deckOwnerId: string | null;
  reducedMotion: boolean;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  // Entrance: fade + rise (skipped under reduced motion). Mounted only while
  // items exist, so mount = the toast appearing.
  const [entered, setEntered] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  // Dissolve after DISSOLVE_MS — reset when another joiner coalesces in,
  // paused while hovered.
  useEffect(() => {
    if (hovered) return;
    const t = setTimeout(onDismiss, DISSOLVE_MS);
    return () => clearTimeout(t);
  }, [items, hovered, onDismiss]);

  if (items.length === 0) return null;

  const names = [...new Set(items.map((i) => nameFromEmail(i.email)))];
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]} and ${names.length - 1} others`;
  const avatarItems = items.slice(-2);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed bottom-16 right-4 z-40 flex items-center gap-2.5 rounded-xl border border-[#0F6E56]/25 bg-white py-2 pl-3 pr-2 shadow-[0_4px_16px_rgba(0,0,0,0.12)] ${
        reducedMotion
          ? ""
          : `transition-[opacity,transform] duration-200 ${
              entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`
      }`}
    >
      <span className="flex shrink-0 -space-x-1.5">
        {avatarItems.map((item) => (
          <span key={item.userId} className="rounded-full ring-2 ring-white">
            <Avatar
              userId={item.userId}
              ownerId={deckOwnerId}
              email={item.email}
              size={24}
            />
          </span>
        ))}
      </span>
      <span className="block max-w-[260px] truncate text-[13px] leading-tight text-[#1d1d1b]">
        <strong className="font-semibold">{who}</strong>{" "}
        {names.length === 1 ? "is" : "are"} viewing the deck
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-1.5 py-1 text-sm leading-none text-[#9a9aa0] transition-colors hover:bg-black/[0.05] hover:text-[#6b6b75]"
      >
        ✕
      </button>
    </div>
  );
}
