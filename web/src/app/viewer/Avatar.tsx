// The ONE avatar component, used everywhere a person (or the AI) appears: the
// feed cards, the version timeline lines, and the top-bar "Huddlers" cluster
// (via HuddleAvatars). It carries TWO signals at a glance:
//
//   SHAPE = ROLE
//     owner        → FILLED with a soft PASTEL of their colour + ink initials
//     collaborator → OUTLINE: WHITE fill + a 2px coloured ring + ink initials
//     ai           → a distinct dark/ink circle with an amber sparkle, so the AI
//                    never reads as a teammate (amber is reserved for it)
//
//   COLOUR = PERSON
//     each person gets a deterministic colour from their user id (hash), so
//     they're ALWAYS the same colour everywhere. The palette deliberately avoids
//     the system colours — no purple (brand/buttons), no teal/green (comments),
//     no amber (the AI) — so an avatar never reads as a button, chip, or the AI.
//
// IMPORTANT — the owner decision lives HERE, in this one component. Callers pass
// the person's `userId` and the deck's `ownerId` (decks.user_id); this component
// alone decides owner = (userId === ownerId) and renders filled vs outline. No
// surface (feed card, Huddlers cluster, etc.) computes "is owner" on its own, so
// they can never disagree about who's filled.
//
// Profiles/display names arrive in Phase 2; until then the email rule does the
// work, but the display-name rule is built so it "just works" when names land.

// Person palette — deliberately steered AWAY from the system colours so an
// avatar never reads as a button, a comment chip, or the AI: NO purple (brand /
// buttons / Share), NO teal or green (comments / team), NO amber (the AI). Each
// person gets a pair: `ink` (the strong colour, used for the collaborator ring +
// initials, and the owner's initials) and `pastel` (a soft tint, the owner's
// fill — calm, not jarring).
const PALETTE: { ink: string; pastel: string }[] = [
  { ink: "#2563EB", pastel: "#DBEAFE" }, // blue
  { ink: "#DB2777", pastel: "#FCE7F3" }, // pink
  { ink: "#EA580C", pastel: "#FFE8D6" }, // coral
  { ink: "#475569", pastel: "#E2E8F0" }, // slate
  { ink: "#BE123C", pastel: "#FFE4E6" }, // rose
  { ink: "#92400E", pastel: "#F2E4D5" }, // brown
];

const AI_INK = "#28282A"; // dark ink — reserved for the AI
const AI_SPARK = "#EF9F27"; // amber — reserved for the AI

// FNV-1a string hash → stable, well-distributed. Same id ⇒ same colour, always.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** The deterministic colour pair for a person, keyed by their stable id. */
export function personColor(key: string): { ink: string; pastel: string } {
  return PALETTE[hashStr(key || "") % PALETTE.length];
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
  size?: number;
  /** Tooltip override; defaults to the display name / email. */
  title?: string;
}) {
  const initials = initialsFor({ displayName, email });
  const isOwner = !!ownerId && !!userId && userId === ownerId;
  const tip = title ?? displayName ?? email ?? (isAI ? "AI" : "a teammate");
  const base =
    "inline-flex items-center justify-center rounded-full select-none shrink-0 font-semibold leading-none";
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
  };

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

  const { ink, pastel } = personColor(userId || email || "");

  if (isOwner) {
    // Owner → FILLED with a soft PASTEL of their colour + ink initials (calm, not
    // jarring). The pastel fill is the role signal; the colour is the person.
    return (
      <span
        className={base}
        style={{ ...style, backgroundColor: pastel, color: ink }}
        title={tip}
        role="img"
        aria-label={tip}
      >
        {initials || <PersonIcon color={ink} />}
      </span>
    );
  }

  // Collaborator → WHITE fill + a 2px ring + initials in their colour (outline).
  return (
    <span
      className={base}
      style={{
        ...style,
        backgroundColor: "#ffffff",
        color: ink,
        border: `2px solid ${ink}`,
      }}
      title={tip}
      role="img"
      aria-label={tip}
    >
      {initials || <PersonIcon color={ink} />}
    </span>
  );
}
