// Decide whether to show the "this deck was updated since you last viewed it"
// banner — for SIGNED-IN viewers only. The change SUMMARY itself is built
// separately (deck-diff.ts) by comparing the two version snapshots.
//
// We don't store "which version did this user last see"; instead we compare
// their deck_views.last_viewed_at against each version's created_at. The latest
// version whose snapshot existed at their last view is the version they saw.
// If the deck has advanced past that, it changed since they were here.
//
// Pure + framework-agnostic so it can be unit-tested.

export type VersionStamp = {
  version: number;
  created_at: string; // ISO
};

export type BannerDecision = {
  fromVersion: number;
  toVersion: number;
};

export function computeUpdateBanner(args: {
  versions: VersionStamp[];
  currentVersion: number;
  /** deck_views.last_viewed_at for this user, or null if they've never viewed. */
  lastViewedAt: string | null;
}): BannerDecision | null {
  const { versions, currentVersion, lastViewedAt } = args;

  // Never viewed before → fresh view, not an update. No banner.
  if (!lastViewedAt) return null;
  // Single-version decks can't have been updated.
  if (currentVersion <= 1) return null;

  const seenTs = Date.parse(lastViewedAt);
  if (Number.isNaN(seenTs)) return null;

  // The version they last saw = the highest version that already existed at
  // their last view (created_at <= lastViewedAt).
  let lastSeenVersion: number | null = null;
  for (const v of versions) {
    const ts = Date.parse(v.created_at);
    if (Number.isNaN(ts)) continue;
    if (ts <= seenTs && (lastSeenVersion === null || v.version > lastSeenVersion)) {
      lastSeenVersion = v.version;
    }
  }

  if (lastSeenVersion === null) return null;
  if (lastSeenVersion >= currentVersion) return null;

  return { fromVersion: lastSeenVersion, toVersion: currentVersion };
}
