"use client";

// The collaborator colour system (design-system §2.5 "Colour discipline").
//
// WHAT: a fixed sequence of person colours, built in OKLCH at matched
// lightness so hues are evenly spread AS PERCEIVED, then converted to sRGB.
// The sequence deliberately EXCLUDES the actor colours — no purple family
// (the owner / actions you take) and no amber/orange family (the AI) — so a
// collaborator can never be mistaken for either.
//
// ASSIGNMENT (founder decision 2026-07-04): PER-HUDDLE, by JOIN ORDER. The
// sequence is pre-computed so that every prefix is maximally spread: person 1
// gets the base hue, person 2 the perceptually furthest hue from it, person 3
// the furthest from both — near-neighbour hues (a second blue-ish, a second
// green-ish) only enter from seat 5. Collaborator N in join order gets
// SEQUENCE[N]. The owner never consumes a seat (the owner is always filled
// purple). Trade-off, decided: a person's colour may differ across decks;
// within one deck's rail the first joiners are always maximally distinct.
// Phase-2 profiles will carry cross-deck identity.
//
// ACCESSIBILITY: every ink is dark enough for BOTH jobs — ≥3:1 against white
// as an outline ring, ≥4.5:1 as initials text (WCAG). The early seats never
// rely on red-vs-green separation alone (blue → crimson → green → magenta),
// and colour is never the only channel anyway (initials carry identity).
//
// PLUMBING: the deck's join-order assignment is computed once per surface
// (FloatingViewer / DeckFeed) from the server's participant list and provided
// via context; Avatar reads it. No provider (or an author outside the
// participant list, e.g. a stub author who never commented) → deterministic
// hash fallback into the SAME sequence, so nothing ever renders colourless.

import { createContext, useContext } from "react";

/** Max-distance person colour sequence (OKLCH-spaced, sRGB values).
 *  Order matters — it IS the join-order assignment. */
export const PERSON_SEQUENCE: string[] = [
  "#2563EB", // 1 blue        oklch(~0.55 0.19 262)
  "#BE123C", // 2 crimson     oklch(~0.51 0.19 17)
  "#15803D", // 3 green       oklch(~0.52 0.14 152)
  "#A21CAF", // 4 magenta     oklch(~0.51 0.20 331)
  "#0369A1", // 5 azure       oklch(~0.50 0.11 237)
  "#4D7C0F", // 6 olive       oklch(~0.53 0.13 130)
  "#9A3412", // 7 rust        oklch(~0.45 0.13 36) — dark enough never to read amber
  "#475569", // 8 slate       near-neutral
];

// FNV-1a string hash → stable fallback when a person isn't in the deck's
// join-order map (no provider, or an author outside the participant list).
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic fallback colour for a person key (userId or email). */
export function fallbackPersonInk(key: string): string {
  return PERSON_SEQUENCE[hashStr(key || "") % PERSON_SEQUENCE.length];
}

/** Build the deck's per-huddle assignment: collaborator N in join order →
 *  SEQUENCE[N mod len]. The owner is excluded (always filled purple, never a
 *  palette seat). Join order = the server-resolved joinedAt (earliest of the
 *  share row / first comment), nulls last, userId as the stable tiebreaker —
 *  the same inputs for every viewer, so every surface agrees. */
export function buildPersonColorAssignment(
  participants: { userId: string; joinedAt: string | null }[],
  ownerId: string | null,
): Map<string, string> {
  const seats = participants
    .filter((p) => p.userId !== ownerId)
    .sort((a, b) => {
      if (a.joinedAt && b.joinedAt && a.joinedAt !== b.joinedAt)
        return a.joinedAt.localeCompare(b.joinedAt);
      if (!!a.joinedAt !== !!b.joinedAt) return a.joinedAt ? -1 : 1;
      return a.userId.localeCompare(b.userId);
    });
  const m = new Map<string, string>();
  seats.forEach((p, i) => {
    m.set(p.userId, PERSON_SEQUENCE[i % PERSON_SEQUENCE.length]);
  });
  return m;
}

const PersonColorContext = createContext<Map<string, string> | null>(null);

/** Wrap a surface (FloatingViewer / DeckFeed) so every Avatar inside shares
 *  the same join-order assignment. */
export const PersonColorProvider = PersonColorContext.Provider;

/** The deck's join-order colour map, or null outside a provider. */
export function usePersonColorMap(): Map<string, string> | null {
  return useContext(PersonColorContext);
}
