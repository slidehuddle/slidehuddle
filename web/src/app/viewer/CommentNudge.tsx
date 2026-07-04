"use client";

// The in-session "you got a comment" nudge — a single transient toast,
// bottom-right, shown when a TEAMMATE's comment lands live while you're in the
// deck (parked 2026-07-02; founder-promoted and built 2026-07-04). Design:
//
//   ONE TOAST, NEVER A STACK — new arrivals COALESCE into the existing toast
//   ("2 new comments from Rita and Jo") and reset the dissolve timer, so
//   notifications can never pile up over the slide.
//
//   TRANSIENT LAYER — floats over the stage (nothing underneath moves),
//   dissolves after ~7s, hover pauses the countdown, ✕ dismisses instantly.
//
//   TEAL = THE TEAM — same accent as the Comments button and comment chips;
//   the avatar is the shared Avatar component, so Rita is her usual colour
//   here too. Bottom-right: the conventional notification corner, clear of
//   the top banners (arrival/revision), the nav arrows, and the settings gear.
//
// The parent (FloatingViewer) owns the item list and the suppression rules
// (feed mode, panel-already-showing-that-slide); this component only presents.

import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { nameFromEmail } from "./FeedItemCard";

export type NudgeComment = {
  id: string;
  userId: string | null;
  email: string | null;
  /** Real slide index (0-based). */
  slideIndex: number;
  body: string;
};

const DISSOLVE_MS = 7000;

export default function CommentNudge({
  items,
  deckOwnerId,
  reducedMotion,
  onView,
  onDismiss,
}: {
  items: NudgeComment[];
  deckOwnerId: string | null;
  reducedMotion: boolean;
  onView: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  // Entrance: fade + rise (skipped under reduced motion). The parent mounts
  // this component only while items exist, so mount = the toast appearing.
  const [entered, setEntered] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  // Dissolve after DISSOLVE_MS — reset whenever a new comment coalesces in
  // (items changes), paused while hovered.
  useEffect(() => {
    if (hovered) return;
    const t = setTimeout(onDismiss, DISSOLVE_MS);
    return () => clearTimeout(t);
  }, [items, hovered, onDismiss]);

  if (items.length === 0) return null;

  const latest = items[items.length - 1];
  const names = [...new Set(items.map((i) => nameFromEmail(i.email)))];
  // Up to two distinct authors' avatars, latest last.
  const avatarItems = items
    .filter(
      (item, idx, arr) =>
        arr.findIndex((o) => (o.userId ?? o.email) === (item.userId ?? item.email)) === idx,
    )
    .slice(-2);
  const fromNames =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]} and ${names.length - 1} others`;
  const snippet =
    latest.body.length > 64 ? `${latest.body.slice(0, 64)}…` : latest.body;

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
          <span key={item.id} className="rounded-full ring-2 ring-white">
            <Avatar
              userId={item.userId}
              ownerId={deckOwnerId}
              email={item.email}
              size={24}
            />
          </span>
        ))}
      </span>
      <span className="min-w-0 max-w-[260px]">
        {items.length === 1 ? (
          <>
            <span className="block truncate text-[13px] leading-tight text-[#1d1d1b]">
              <strong className="font-semibold">{names[0]}</strong> commented on{" "}
              <strong className="font-semibold">slide {latest.slideIndex + 1}</strong>
            </span>
            <span className="block truncate text-xs leading-tight text-[#6b6b75]">
              &ldquo;{snippet}&rdquo;
            </span>
          </>
        ) : (
          <span className="block truncate text-[13px] leading-tight text-[#1d1d1b]">
            <strong className="font-semibold">
              {items.length} new comments
            </strong>{" "}
            from {fromNames}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onView}
        className="shrink-0 rounded-lg bg-[#D3F0E6] px-2.5 py-1.5 text-[13px] font-bold text-[#0F6E56] transition-colors hover:bg-[#bfe8d8]"
      >
        View
      </button>
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
