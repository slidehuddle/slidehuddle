// Name-free "huddle" indicators for ANONYMOUS link viewers, shared by the deck
// viewer (FloatingViewer) and the conversation feed (DeckFeed). Anonymous
// viewers never receive participant identities (privacy rule), but should still
// sense the deck is collaborative — so they get one of these chips: a bare
// "Shared deck" when no count is known, or "N reviewing" (a COUNT ONLY — never
// names or emails). Signed-in viewers get the real <HuddleAvatars> instead. Teal
// = the team (§2.2).

function PeopleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function SharedDeckChip() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: "#E1F5EE", color: "#085041" }}
      title="This deck is shared for collaboration"
    >
      <PeopleIcon />
      Shared deck
    </span>
  );
}

// Guest/recipient "N reviewing" chip (design system §6.5/§10.6: client surfaces
// soften to "3 reviewing", never "Huddlers"). Privacy-safe — the count is the
// people in the huddle (owner + collaborators + commenters), no identities.
export function ReviewingChip({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: "#E1F5EE", color: "#085041" }}
      title={`${count} ${count === 1 ? "person is" : "people are"} reviewing this deck`}
    >
      <PeopleIcon />
      {count} reviewing
    </span>
  );
}
