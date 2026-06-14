"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Placement = "bottom-center" | "bottom-end";

type Props<T extends HTMLElement> = {
  /** The trigger element to anchor the popover to. */
  anchorRef: RefObject<T | null>;
  open: boolean;
  onClose: () => void;
  /** Fixed width of the floating panel (px). */
  width: number;
  placement?: Placement;
  children: ReactNode;
};

// Renders floating UI (forms, menus, tooltips) into a portal on document.body
// with `position: fixed` and a high z-index. This is the fix for popovers
// being clipped by the strip's `overflow-x-auto` scroll area or painting
// underneath the slide's sandboxed iframe — a portal escapes both the
// clipping ancestor and the local stacking context.
export default function PortalPopover<T extends HTMLElement>({
  anchorRef,
  open,
  onClose,
  width,
  placement = "bottom-center",
  children,
}: Props<T>) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position from the anchor's viewport rect; keep it in sync on scroll/resize.
  useEffect(() => {
    if (!open) {
      // Reset so the next open starts hidden until re-measured.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos(null);
      return;
    }
    let raf = 0;
    function update() {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const gap = 8;
      let left =
        placement === "bottom-end"
          ? r.right - width
          : r.left + r.width / 2 - width / 2;
      // keep within the viewport horizontally
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      // Default: open below the anchor. Flip ABOVE when the panel wouldn't fit
      // below but does fit above — so a popover near the bottom edge (e.g. the
      // "request a slide" form on a low thumbnail) stays fully on-screen. The
      // panel is in the DOM (visibility:hidden until positioned), so its height
      // is measurable on the first pass — no flicker.
      const h = popRef.current?.offsetHeight ?? 0;
      const belowTop = r.bottom + gap;
      const flipUp =
        h > 0 && belowTop + h > window.innerHeight - 8 && r.top - gap - h >= 8;
      let top = flipUp ? r.top - gap - h : belowTop;
      // Clamp vertically so the WHOLE panel stays on-screen. Without this, a tall
      // panel near the bottom edge (e.g. the "Request a slide" form opened from a
      // low thumbnail) that fits neither below nor above opens downward and spills
      // under the viewport — its submit button unreachable. Shift it up to fit;
      // it may overlap the anchor, which is far better than an off-screen button.
      if (h > 0) top = Math.min(top, window.innerHeight - 8 - h);
      top = Math.max(8, top);
      setPos({ top, left });
    }
    update();
    // Re-measure after mount in case the panel's height settles a frame later.
    raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    // capture phase so we catch scrolls on the strip's inner scroll container
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, width, placement]);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popRef}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width,
        zIndex: 9999,
        // Hidden for the first frame until measured, to avoid a flash at 0,0.
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
