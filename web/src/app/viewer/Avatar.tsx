"use client";

// The ONE avatar component, used everywhere a person (or the AI) appears: the
// feed cards, the version timeline lines, the top-bar "Huddlers" cluster
// (via HuddleAvatars), the spectrum's filter stack, and the comments panel.
// It carries the signals per design-system §2.5 "Colour discipline"
// (RESTYLED 2026-07-04, founder decision — role returns to FILL vs OUTLINE;
// the 2026-07-03 all-pastel + owner-star treatment is retired):
//
//   FILL = OWNER
//     the deck owner alone is a FILLED purple circle (white initials) —
//     purple is the owner's actor colour, and fill alone says "owner"
//     (no star, no ring).
//
//   OUTLINE + COLOUR = COLLABORATOR
//     collaborators are OUTLINE circles: white fill, a ring in their assigned
//     colour, initials in the same colour. Colours come from the per-huddle
//     join-order assignment (person-colors.tsx) — an OKLCH max-distance
//     sequence that excludes the purple family (the owner's) and the
//     amber/orange family (the AI's), so a collaborator can never be mistaken
//     for either. Identity never rides on colour alone: initials + fill/outline
//     survive with colour removed.
//
//   GREEN DOT = ONLINE (the presence exception)
//     the ONE state allowed to wear colour: a tiny green dot on the avatar
//     edge — always on for `self` (your signed-in avatar), and via the
//     `online` prop for teammates who have the deck open right now
//     (useDeckPresence, roster surfaces only). Green appears nowhere else as
//     a state.
//
//   ai → a distinct mark (never a person circle): dark circle + amber sparkle
//     here; the feed/rail use AiMark (model logo / lilac AI square). Amber is
//     the AI's actor colour and is reserved for it.
//
// IMPORTANT — the owner decision lives HERE, in this one component. Callers pass
// the person's `userId` and the deck's `ownerId` (decks.user_id); this component
// alone decides owner = (userId === ownerId) and renders filled vs outline. No
// surface (feed card, Huddlers cluster, etc.) computes "is owner" on its own, so
// they can never disagree about who's filled.
//
// Profiles/display names arrive in Phase 2; until then the email rule does the
// work, but the display-name rule is built so it "just works" when names land.

import {
  fallbackPersonInk,
  usePersonColorMap,
} from "./person-colors";

const OWNER_FILL = "#4A3FB5"; // brand purple — the owner's fill, white initials
const AI_INK = "#28282A"; // dark ink — reserved for the AI
const AI_SPARK = "#EF9F27"; // amber — reserved for the AI
const PRESENCE_GREEN = "#3FA344"; // the ONE state colour (design-system §2.5)

/** The deterministic colour for a person OUTSIDE the join-order map (kept as
 *  a named export for callers that need a colour without an Avatar). */
export function personColor(key: string): { ink: string } {
  return { ink: fallbackPersonInk(key) };
}

/** 1–2 uppercase initials. Display name preferred; otherwise derived from the
 *  email local part. Never blank (returns "" only when there's truly nothing —
 *  the component then shows a person icon). */
export function initialsFor({
  displayName,
  email,
}: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const fromWords = (raw: string): string => {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (displayName && displayName.trim()) {
    const r = fromWords(displayName);
    if (r) return r;
  }
  if (email) {
    // Strip trailing digits ("gregmanzanera2024" → "gregmanzanera"), then split
    // on the common local-part separators.
    const local = (email.split("@")[0] ?? "").replace(/\d+$/, "");
    const parts = local.split(/[._+-]+/).filter(Boolean);
    if (parts.length >= 2)
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const c = (displayName || email || "").trim()[0];
  return c ? c.toUpperCase() : "";
}

function PersonIcon({ color }: { color: string }) {
  return (
    <svg
      width="58%"
      height="58%"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="56%"
      height="56%"
      viewBox="0 0 24 24"
      fill={AI_SPARK}
      aria-hidden="true"
    >
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
    </svg>
  );
}

export default function Avatar({
  userId,
  ownerId,
  email,
  displayName,
  isAI = false,
  self = false,
  online = false,
  size = 32,
  title,
}: {
  userId: string | null;
  /** The deck's owner id (decks.user_id). This component alone decides owner =
   *  (userId === ownerId) → no surface computes it. */
  ownerId: string | null;
  email: string | null;
  displayName?: string | null;
  isAI?: boolean;
  /** This avatar is the SIGNED-IN VIEWER THEMSELVES: renders as the account
   *  identity — person icon + green "signed in" dot, matching the account chip
   *  (G2) — instead of initials, so "you" stand out and read the same in the
   *  stack, the feed cards, and the panel. When you OWN the deck, your account
   *  avatar is the filled-purple owner circle (fill = owner still holds). */
  self?: boolean;
  /** This person has the deck open RIGHT NOW (useDeckPresence) — the green
   *  presence dot, the ONE state allowed to wear colour (§2.5 rule 3). Passed
   *  only by the roster surfaces (rail + Huddlers cluster); historical
   *  surfaces (feed cards, panel) never pass it. `self` avatars carry the dot
   *  regardless (your own signed-in and online are the same fact). */
  online?: boolean;
  size?: number;
  /** Tooltip override; defaults to the display name / email. */
  title?: string;
}) {
  // The deck's per-huddle join-order assignment (null outside a provider →
  // deterministic hash fallback into the same sequence).
  const colorMap = usePersonColorMap();
  const initials = initialsFor({ displayName, email });
  const isOwner = !!ownerId && !!userId && userId === ownerId;
  // Default tooltip names the deck owner explicitly (founder call 2026-07-03 —
  // a visual marker alone wasn't clear). An explicit `title` override wins.
  const baseTip = title ?? displayName ?? email ?? (isAI ? "AI" : "a teammate");
  const ownedTip = !title && isOwner ? `${baseTip} · deck owner` : baseTip;
  const tip = !title && online && !self ? `${ownedTip} · online now` : ownedTip;
  const base =
    "inline-flex items-center justify-center rounded-full select-none shrink-0 font-semibold leading-none";
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
  };
  // The green "online now" dot (the presence exception): identical to the
  // self dot, on the avatar edge.
  const dotSize = Math.max(7, Math.round(size * 0.3));
  const onlineDot = online ? (
    <span
      aria-hidden="true"
      className="absolute right-0 top-0 rounded-full ring-2 ring-white"
      style={{
        width: dotSize,
        height: dotSize,
        backgroundColor: PRESENCE_GREEN,
      }}
    />
  ) : null;

  if (self) {
    // "You" — the account identity: person icon + green signed-in dot (for
    // your own avatar, signed-in and online are the same fact — the presence
    // exception). Owner-you = the filled purple circle (fill = owner);
    // collaborator-you = the light account purple (purple = you, §2.2).
    const dot = Math.max(7, Math.round(size * 0.3));
    return (
      <span
        className={`relative ${base}`}
        style={{
          ...style,
          backgroundColor: isOwner ? OWNER_FILL : "#EEEDFE",
          color: isOwner ? "#ffffff" : "#3C3489",
        }}
        title={tip}
        role="img"
        aria-label={`${tip} (you)`}
      >
        <PersonIcon color={isOwner ? "#ffffff" : "#3C3489"} />
        <span
          aria-hidden="true"
          className="absolute right-0 top-0 rounded-full ring-2 ring-white"
          style={{
            width: dot,
            height: dot,
            backgroundColor: PRESENCE_GREEN,
          }}
        />
      </span>
    );
  }

  if (isAI) {
    return (
      <span
        className={base}
        style={{ ...style, backgroundColor: AI_INK }}
        title={tip}
        aria-label="AI"
      >
        <SparkleIcon />
      </span>
    );
  }

  if (isOwner) {
    // FILL = OWNER: the one filled circle, brand purple, white initials
    // (≥4.5:1 on #4A3FB5).
    return (
      <span
        className={`relative ${base}`}
        style={{ ...style, backgroundColor: OWNER_FILL, color: "#ffffff" }}
        title={tip}
        role="img"
        aria-label={tip}
      >
        {initials || <PersonIcon color="#ffffff" />}
        {onlineDot}
      </span>
    );
  }

  // OUTLINE = COLLABORATOR: white fill, ring + initials in the assigned
  // colour (join-order map first, hash fallback into the same sequence).
  const ink =
    (userId && colorMap?.get(userId)) || fallbackPersonInk(userId || email || "");
  const ringW = Math.max(1.5, Math.round(size * 0.055 * 2) / 2);
  return (
    <span
      className={`relative ${base}`}
      style={{
        ...style,
        backgroundColor: "#ffffff",
        color: ink,
        boxShadow: `inset 0 0 0 ${ringW}px ${ink}`,
      }}
      title={tip}
      role="img"
      aria-label={tip}
    >
      {initials || <PersonIcon color={ink} />}
      {onlineDot}
    </span>
  );
}
