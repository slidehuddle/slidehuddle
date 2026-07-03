"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/use-hydrated";

// A transient toast pinned just under an anchor element but rendered on the TOP
// layer — portaled to <body> at a very high z-index — so it can NEVER be hidden
// behind a floating panel, pill, or popover. This is the fixed rule: toasts are
// always top-layer (design system §3.2). It escapes any ancestor stacking
// context (e.g. a backdrop-blur pill cluster) that an inline `z-…` toast can't.
//
// Kept mounted and faded via `open` so the existing fade-out is preserved.
// Pointer-events are off (a toast is never interactive). On `open` it measures
// the anchor each frame and tracks scroll/resize; on close it leaves the last
// position so the fade-out happens in place.
export default function AnchoredToast<T extends HTMLElement>({
  anchorRef,
  open,
  maxWidth = 280,
  children,
}: {
  anchorRef: RefObject<T | null>;
  open: boolean;
  maxWidth?: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    function update() {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      // Just below the anchor, right-aligned to it (matches the old inline look),
      // clamped to stay on-screen — on BOTH sides: for an anchor near the LEFT
      // edge (e.g. the huddler stack's invite "+"), right-alignment would push
      // the toast off-screen left, so cap `right` to always leave `maxWidth`
      // of room.
      const top = Math.min(r.bottom + 6, window.innerHeight - 8);
      const right = Math.min(
        Math.max(8, window.innerWidth - r.right),
        Math.max(8, window.innerWidth - maxWidth - 8),
      );
      setPos({ top, right });
    }
    update();
    raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, maxWidth]);

  // Gate the portal on hydration: createPortal renders nothing on the server but
  // mounts immediately on the client, so rendering it on the first client pass
  // would mismatch the server's null and throw a hydration error. Staying null
  // until hydrated keeps the first client render identical to the server, then
  // the portal mounts on the next render.
  if (!hydrated) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        right: pos?.right ?? 8,
        maxWidth,
        zIndex: 10000, // above PortalPopover (9999) and all panels/pills
        pointerEvents: "none",
        opacity: open && pos ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
