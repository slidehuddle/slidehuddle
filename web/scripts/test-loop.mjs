// End-to-end test for the closed-loop build:
//   1. versioning backbone (create → update → version bump, same id)
//   2. feedback prompt builder
//   3. update capability tokens (auth for the update endpoint)
//
// Units run with no server. The live loop hits a running dev server
// (http://localhost:3000) + the live Supabase DB. Run:
//   node scripts/test-loop.mjs
//
// Exit code 0 = all run assertions passed (the version-increment assertions
// are skipped with a clear note if the deck_versions migration isn't applied).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");

// ---- load env from web/.env.local (tolerate BOM + CRLF) ----
const envRaw = readFileSync(join(webRoot, ".env.local"), "utf8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const ORIGIN = "https://claude.ai";

let passed = 0;
let failed = 0;
let skipped = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function bad(name, detail) { failed++; console.log(`  ✗ ${name}\n      ${detail}`); }
function skip(name, why) { skipped++; console.log(`  ⚠ SKIP ${name} — ${why}`); }
function assert(cond, name, detail) { if (cond) { ok(name); } else { bad(name, detail || ""); } }

const DECK_V1 = `<!doctype html><html><head><title>Q3 Plan</title></head><body>
  <section class="slide"><h1>Intro</h1></section>
  <section class="slide"><h1>Roadmap</h1></section>
</body></html>`;
const DECK_V2 = `<!doctype html><html><head><title>Q3 Plan (revised)</title></head><body>
  <section class="slide"><h1>Intro</h1></section>
  <section class="slide"><h1>Roadmap</h1></section>
  <section class="slide"><h1>Pricing</h1></section>
</body></html>`;

async function restGet(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function restPost(path, row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function main() {
  // ============ UNIT: feedback prompt ============
  console.log("\nUnit — buildFeedbackPrompt");
  const { buildFeedbackPrompt } = await import(
    "../src/app/viewer/feedback-prompt.ts"
  );
  {
    const empty = buildFeedbackPrompt({ comments: [], flags: [], stubs: [] });
    assert(empty === null, "returns null when there is no feedback");

    const text = buildFeedbackPrompt({
      comments: [
        { slide_index: 1, body: "Tighten this headline" },
        { slide_index: 0, body: "Great opener" },
      ],
      flags: [{ slide_index: 3, reason: "Numbers are outdated" }],
      stubs: [
        { position: 5, title: "Pricing", subtitle: "2026", body: "Three tiers" },
      ],
    });
    const lines = text.split("\n");
    assert(lines[0] === "Please revise this deck based on the team's feedback:", "has header line", lines[0]);
    assert(text.includes("- Slide 1: Great opener"), "comment uses 1-based slide number", text);
    assert(text.includes("- Slide 2: Tighten this headline"), "second comment numbered", text);
    assert(text.includes("- Slide 4: flagged for removal — Numbers are outdated"), "flag line w/ reason", text);
    assert(text.includes("- New slide requested after slide 5: Title: Pricing, Subtitle: 2026, Should cover: Three tiers"), "stub line formatted", text);
    // ordering: slide 1 comment before slide 2 comment before slide 4 flag
    assert(
      text.indexOf("Great opener") < text.indexOf("Tighten this") &&
        text.indexOf("Tighten this") < text.indexOf("flagged for removal"),
      "lines ordered by slide number",
      text,
    );
  }

  // ============ UNIT: deck write tokens ============
  console.log("\nUnit — deck write tokens");
  const { mintDeckWriteToken, verifyDeckWriteToken } = await import(
    "../src/lib/update-token.ts"
  );
  {
    const tok = mintDeckWriteToken("deckABC");
    assert(verifyDeckWriteToken(tok, "deckABC") === true, "valid token verifies");
    assert(verifyDeckWriteToken(tok, "deckXYZ") === false, "token rejected for a different deck id");
    assert(verifyDeckWriteToken(tok + "x", "deckABC") === false, "tampered signature rejected");
    assert(verifyDeckWriteToken(null, "deckABC") === false, "missing token rejected");
  }

  // ============ UNIT: updated-banner decision ============
  console.log("\nUnit — updated-banner decision");
  const { computeUpdateBanner } = await import(
    "../src/app/viewer/version-banner.ts"
  );
  {
    const versions = [
      { version: 1, created_at: "2026-01-01T00:00:00Z" },
      { version: 2, created_at: "2026-01-02T00:00:00Z" },
    ];
    const sawV1 = computeUpdateBanner({ versions, currentVersion: 2, lastViewedAt: "2026-01-01T12:00:00Z" });
    assert(sawV1 && sawV1.fromVersion === 1 && sawV1.toVersion === 2, "saw v1, now v2 → banner v1→v2", JSON.stringify(sawV1));
    assert(computeUpdateBanner({ versions, currentVersion: 2, lastViewedAt: "2026-01-03T00:00:00Z" }) === null, "saw v2 already → no banner");
    assert(computeUpdateBanner({ versions, currentVersion: 2, lastViewedAt: null }) === null, "never viewed → no banner");
    assert(computeUpdateBanner({ versions: [versions[0]], currentVersion: 1, lastViewedAt: "2026-02-01T00:00:00Z" }) === null, "v1-only deck → no banner");
  }

  // ============ UNIT: deck change summary (richer tracking) ============
  console.log("\nUnit — deck change summary");
  const { summarizeDeckChange, describeChange, splitSlidesForDiff } = await import(
    "../src/app/viewer/deck-diff.ts"
  );
  {
    const oldHtml = "<section>Intro A</section><section>Roadmap B</section>";
    const newHtml = "<section>Intro A</section><section>Roadmap B2</section><section>Pricing C</section>";
    assert(splitSlidesForDiff(oldHtml).length === 2, "splits old deck into 2 slides");
    assert(splitSlidesForDiff(newHtml).length === 3, "splits new deck into 3 slides");

    // old [A,B], new [A,B2,C]: A unchanged, B2 revised, C added.
    const ch = summarizeDeckChange(oldHtml, newHtml);
    assert(ch.oldCount === 2 && ch.newCount === 3 && ch.newOrRevised === 2 && ch.net === 1, "diff: 3 slides, 2 new-or-revised, net +1", JSON.stringify(ch));
    assert(describeChange(1, 2, ch) === "v1 → v2 · 1 slide added, 1 slide revised", "describeChange add+revise", describeChange(1, 2, ch));

    // Pure removal.
    const ch2 = summarizeDeckChange("<section>A</section><section>B</section><section>C</section>", "<section>A</section><section>B</section>");
    assert(ch2.net === -1, "diff: net -1 on removal", JSON.stringify(ch2));
    assert(describeChange(2, 3, ch2) === "v2 → v3 · 1 slide removed", "describeChange removal", describeChange(2, 3, ch2));

    // No old snapshot available → version jump only.
    assert(describeChange(1, 3, null) === "v1 → v3", "describeChange with no snapshot");
  }

  // ============ LIVE: create → update loop ============
  console.log("\nLive — create / update loop  (server: " + BASE + ")");
  let serverUp = false;
  try {
    const ping = await fetch(`${BASE}/api/slides`, { method: "OPTIONS", headers: { origin: ORIGIN } });
    serverUp = ping.status === 204;
  } catch { serverUp = false; }
  if (!serverUp) {
    skip("live loop", `dev server not reachable at ${BASE} (start with: npm run dev)`);
    return summary();
  }

  // CREATE — bound to a Claude conversation (real sample id shape).
  const CID = "93669df2-93a7-4a2e-8bc3-ec3f67a380a1";
  const createRes = await fetch(`${BASE}/api/slides?conversation=${CID}`, {
    method: "POST",
    headers: { "content-type": "text/html", origin: ORIGIN },
    body: DECK_V1,
  });
  const createBody = await createRes.json().catch(() => ({}));
  assert(createRes.status === 201, "create → 201", `${createRes.status} ${JSON.stringify(createBody)}`);
  const deckId = createBody.id;
  assert(typeof deckId === "string" && deckId.length > 0, "create returns a deck id", JSON.stringify(createBody));
  assert(createBody.version === 1, "create reports version 1", JSON.stringify(createBody));
  assert(createBody.title === "Q3 Plan", "create returns the derived title", JSON.stringify(createBody.title));
  assert(typeof createBody.writeToken === "string" && createBody.writeToken.length > 0, "create returns a write token", JSON.stringify(createBody.writeToken));
  const writeToken = createBody.writeToken;
  const shareUrl = createBody.url;

  if (!deckId) return summary();

  // Conversation binding stored on the deck row (needs the conversation column).
  const convRow = await restGet(`decks?id=eq.${deckId}&select=claude_conversation_id`);
  if (convRow.status === 200) {
    assert(convRow.body?.[0]?.claude_conversation_id === CID, "deck row stores the conversation id", JSON.stringify(convRow.body));
  } else {
    skip("conversation binding", "claude_conversation_id column not migrated — run docs/deck-conversation-migration.sql");
  }

  // ---- P0.3: seed feedback so we can prove the update RESOLVES it ----
  // The extension's update path must mark addressed stubs/flags resolved, the
  // same way MCP update_deck does. Seed one of each via a service-role insert
  // (so requested_by/flagged_by may be null; dismissed defaults false,
  // resolved_at defaults null) and assert they're resolved after the update.
  const feedbackReady =
    (await restGet("slide_stubs?select=resolved_at&limit=0")).status === 200 &&
    (await restGet("slide_flags?select=resolved_at&limit=0")).status === 200;
  let seededStubId = null;
  let seededFlagId = null;
  if (feedbackReady) {
    const s = await restPost("slide_stubs", {
      deck_id: deckId, position: 1, title: "Pricing", body: "Three tiers",
    });
    const f = await restPost("slide_flags", {
      deck_id: deckId, slide_index: 0, reason: "Outdated numbers",
    });
    seededStubId = s.body?.[0]?.id ?? null;
    seededFlagId = f.body?.[0]?.id ?? null;
    assert(s.status === 201 && seededStubId, "seed: inserted a requested slide (stub)", `${s.status} ${JSON.stringify(s.body)}`);
    assert(f.status === 201 && seededFlagId, "seed: inserted a removal flag", `${f.status} ${JSON.stringify(f.body)}`);
  } else {
    skip("feedback resolution", "slide_stubs/slide_flags or resolved_at not migrated — run the stubs/flags + feedback-resolution migrations");
  }

  // UPDATE auth gating (no versioning table needed for these).
  const noTok = await fetch(`${BASE}/api/slides?update=${deckId}`, {
    method: "POST", headers: { "content-type": "text/html", origin: ORIGIN }, body: DECK_V2,
  });
  assert(noTok.status === 403, "update without token → 403", String(noTok.status));

  const badTok = await fetch(`${BASE}/api/slides?update=${deckId}`, {
    method: "POST",
    headers: { "content-type": "text/html", origin: ORIGIN, "x-slidehuddle-update-token": "garbage.sig" },
    body: DECK_V2,
  });
  assert(badTok.status === 403, "update with bad token → 403", String(badTok.status));

  // A valid token but minted for a DIFFERENT deck must be rejected (deck-scoped).
  const wrongDeckTok = mintDeckWriteToken("some-other-deck-id");
  const wrongRes = await fetch(`${BASE}/api/slides?update=${deckId}`, {
    method: "POST",
    headers: { "content-type": "text/html", origin: ORIGIN, "x-slidehuddle-update-token": wrongDeckTok },
    body: DECK_V2,
  });
  assert(wrongRes.status === 403, "update with another deck's token → 403", String(wrongRes.status));

  // UPDATE with the real write token the create returned (what the extension does).
  const updRes = await fetch(`${BASE}/api/slides?update=${deckId}`, {
    method: "POST",
    headers: { "content-type": "text/html", origin: ORIGIN, "x-slidehuddle-update-token": writeToken },
    body: DECK_V2,
  });
  const updBody = await updRes.json().catch(() => ({}));

  // Does the versioning table exist?
  const tableProbe = await restGet("deck_versions?select=deck_id&limit=0");
  const tableExists = tableProbe.status === 200;

  if (!tableExists) {
    skip("version increment", "deck_versions table not migrated — run docs/deck-versions-migration.sql");
    assert(
      updRes.status === 500,
      "valid-token update reaches the version write (blocked only by the missing table)",
      `expected 500 due to missing table, got ${updRes.status} ${JSON.stringify(updBody)}`,
    );
    console.log("      (auth passed; the ONLY thing missing is the table.)");
    await deleteDeck(deckId);
    return summary();
  }

  // Table exists → assert the real loop.
  assert(updRes.status === 200, "update → 200", `${updRes.status} ${JSON.stringify(updBody)}`);
  assert(updBody.id === deckId, "update keeps the SAME deck id (share link unchanged)", `${updBody.id} vs ${deckId}`);
  assert(updBody.url === shareUrl, "update returns the same viewer url", `${updBody.url} vs ${shareUrl}`);
  assert(updBody.version === 2, "update reports version 2", JSON.stringify(updBody));

  // Verify the live deck row advanced.
  const deckRow = await restGet(`decks?id=eq.${deckId}&select=version,html_content,title,slide_count`);
  const d = deckRow.body?.[0];
  assert(d?.version === 2, "decks.version is now 2", JSON.stringify(d));
  assert(d?.html_content?.includes("Pricing"), "decks.html_content is the revised deck", "v2 html not stored");
  assert(d?.slide_count === 3, "decks.slide_count recomputed to 3", JSON.stringify(d?.slide_count));

  // Verify history retained both versions.
  const versions = await restGet(`deck_versions?deck_id=eq.${deckId}&select=version,html_content&order=version.asc`);
  const vs = versions.body || [];
  assert(vs.length === 2, "deck_versions has 2 rows (v1 + v2)", JSON.stringify(vs.map((x) => x.version)));
  assert(vs[0]?.version === 1 && vs[0]?.html_content?.includes("Roadmap") && !vs[0]?.html_content?.includes("Pricing"), "v1 snapshot is the ORIGINAL html", "v1 wrong");
  assert(vs[1]?.version === 2 && vs[1]?.html_content?.includes("Pricing"), "v2 snapshot is the REVISED html", "v2 wrong");

  // ---- P0.3: the extension update must RESOLVE addressed feedback ----
  // (parity with MCP update_deck). The seeded stub + flag should now carry a
  // resolved_at timestamp, and the update response should report the count.
  if (feedbackReady && seededStubId && seededFlagId) {
    console.log("\nLive — feedback resolution on extension update (P0.3)");
    const stubAfter = await restGet(`slide_stubs?id=eq.${seededStubId}&select=resolved_at`);
    const flagAfter = await restGet(`slide_flags?id=eq.${seededFlagId}&select=resolved_at`);
    assert(stubAfter.body?.[0]?.resolved_at != null, "extension update resolved the requested slide (resolved_at set)", JSON.stringify(stubAfter.body));
    assert(flagAfter.body?.[0]?.resolved_at != null, "extension update resolved the removal flag (resolved_at set)", JSON.stringify(flagAfter.body));
    assert(updBody.resolvedFeedbackCount === 2, "update response reports resolvedFeedbackCount = 2", JSON.stringify(updBody.resolvedFeedbackCount));
  }

  // ---- Viewer page: version chip + viewing a previous version ----
  console.log("\nLive — viewer page (version UI)");
  // Default view (floating viewer): its chrome (version chip, warnings) is
  // client-rendered, so the SSR HTML can only prove the version DATA path —
  // that the right snapshot was rendered for the requested version.
  const pageCur = await fetch(`${BASE}/viewer?id=${deckId}`);
  const pageCurHtml = await pageCur.text();
  assert(pageCur.status === 200, "GET /viewer?id=… → 200", String(pageCur.status));
  assert(pageCurHtml.includes("Pricing"), "current view renders the latest (v2) slides", "v2 content missing");

  const pageV1 = await fetch(`${BASE}/viewer?id=${deckId}&v=1`);
  const pageV1Html = await pageV1.text();
  assert(pageV1.status === 200, "GET /viewer?id=…&v=1 → 200", String(pageV1.status));
  assert(pageV1Html.includes("Roadmap") && !pageV1Html.includes("Pricing"), "viewing v1 renders the ORIGINAL slides (no v2 content)", "v1 view wrong");

  // Version CHROME is only server-rendered by the classic viewer
  // (?view=classic), so assert it there. Retire these four with classic at the
  // Phase-7 cutover.
  const classicCurHtml = await (await fetch(`${BASE}/viewer?id=${deckId}&view=classic`)).text();
  assert(classicCurHtml.includes("view version history"), "classic: version chip is present", "chip aria-label not found");
  assert(classicCurHtml.includes("Version 2"), "classic: chip shows the current version (v2)", "expected 'Version 2' in chip");

  const classicV1Html = await (await fetch(`${BASE}/viewer?id=${deckId}&v=1&view=classic`)).text();
  assert(classicV1Html.includes("past version of this deck"), "classic: historical view shows the 'past version' bar", "historical bar missing");
  assert(classicV1Html.includes("The latest is v2"), "classic: historical view names the latest version", "latest-version copy missing on historical view");

  // Cleanup the test deck (cascade removes versions).
  await deleteDeck(deckId);
  console.log(`      (cleaned up test deck ${deckId})`);

  return summary();
}

async function deleteDeck(deckId) {
  await fetch(`${SUPA_URL}/rest/v1/decks?id=eq.${deckId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

function summary() {
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
