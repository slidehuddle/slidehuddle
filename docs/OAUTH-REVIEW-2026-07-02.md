# SlideHuddle — Dedicated OAuth / MCP Security Review

*Reviewed: 2 July 2026. Scope: the OAuth 2.1 login-with-Claude flow and the MCP tool
surface that lets a connected AI read and write your decks. This is the **focused deep
review** that our own docs (and the July general review,
[docs/REVIEW-2026-07-02.md](REVIEW-2026-07-02.md) §5.2) said the OAuth/MCP surface
needed on its own. Method: full read of every OAuth/MCP file plus the relevant parts of
the `mcp-handler` dependency. **Read-only — no code was changed by this review.***

> **One caveat carried over:** this review reads code. It does **not** audit the
> database's Row-Level-Security policies (covered separately — you re-ran
> `verify-rls.sql` on 2026-07-02 and confirmed them live). Where the MCP tools rely on
> an *app-level* ownership check instead of RLS, that's called out explicitly below (it
> matters — see M/finding on `loadOwnedDeck`).

---

## 1. Headline — are we okay?

**Yes — the OAuth/MCP core is well built.** No critical or high-severity code
vulnerabilities. The cryptography is done right (fixed HMAC-SHA256 with no way to
downgrade it, constant-time comparisons, tokens tagged by type so one kind can't be
reused as another), the login flow enforces the modern protections correctly (PKCE
required and in its strong form, redirect destinations matched exactly and checked
*before* any redirect happens), and every MCP tool call re-derives *who you are* from
the verified token — never from what the caller claims.

**One finding rises above low severity, and it depends on your hosting, not your code:**
the server figures out its own web address from a request header (`x-forwarded-host`)
that can be forged, with no hard-coded fallback. On Vercel this is normally safe because
Vercel's edge sets that header and overwrites any forged value — but the code itself has
no guard, so the safety rests entirely on the proxy. This is worth a one-line
confirmation and a small hardening (pin the address in an env var). Everything else is
a handful of low-severity, mostly-deliberate trade-offs.

---

## 2. The one that needs a decision

### M1 — The server trusts a forgeable header to learn its own address — **Medium (depends on hosting)**

**Plain English:** whenever the OAuth server needs to say "I am `slidehuddleapp.vercel.app`"
— to stamp the token issuer, to build the `/login` redirect during sign-in, or to put a
`share_url` into a result it hands back to the AI — it reads the address from an incoming
request header called `x-forwarded-host`. That header can be set by whoever makes the
request. Nothing in the code pins it to your real domain.

**Why it matters:** if a request carrying a forged `X-Forwarded-Host` can reach the
function, an attacker who lures a signed-in user to a crafted `/oauth/authorize` link
could bounce that user's login flow toward an attacker-controlled address, and could
poison the `share_url`s returned to the AI. Two reassurances bound the blast radius: the
address that actually receives the OAuth *code* comes from the cryptographically-signed
client record, **not** from this header (so login codes can't be stolen this way), and on
Vercel the edge normally overwrites a forged header before your code sees it.

**Uncertain by nature:** whether this is exploitable comes down to your infrastructure,
which isn't visible in the repo. **Recommended fix:** set a canonical origin in an
environment variable (e.g. `MCP_PUBLIC_ORIGIN`) and use it for the issuer, the login
redirect, and `share_url` instead of the header — and/or confirm Vercel strips inbound
`X-Forwarded-Host`. Small change, removes the doubt entirely.

---

## 3. Lower-severity findings (mostly deliberate trade-offs)

### L2 — Check the `/login` page rejects off-site `next` values — **Low**
The authorize route itself passes a safe *relative* path as `next`, but the redirect is
built on the M1 address, and the final hop happens in the `/login` page (outside this
review's files). Confirm `/login` only accepts relative `next` values — rejecting absolute
URLs and `//evil.com` protocol-relative forms — so the sign-in chain can't become an open
redirect. *(The general review already verified `auth/callback` has exactly this guard;
this is the same check one layer over.)*

### L3 — No way to revoke a token; logging out doesn't kill MCP access — **Low**
MCP access tokens are self-contained signed blobs valid for **30 days**, with no
revocation list — so a leaked token works until it expires, and signing out of the web
app does **not** invalidate it (there's no server-side session to clear). The deck
**write tokens** used by the extension are longer still — **180 days**, also unrevocable.
Bounded by the fact that these only grant owner-scoped deck access, and it's a documented
v1 trade-off. **Fix when it matters:** add a per-user "token version" that a
logout / "disconnect apps" action bumps, checked when a token is parsed; and/or shorten
the access-token life and introduce refresh tokens.

### L4 — No refresh tokens — **Low / informational**
The token endpoint only issues a 30-day access token; there's no refresh-token grant.
Defensible as a simplification, but it's *why* the access token has to live so long
(which feeds L3). Short-lived access + rotating refresh would be the stronger design if
revocation ever becomes important.

### L5 — Login codes are one-time only by their 60-second clock — **Low**
An authorization code has a 60-second lifetime and no "already used" list, so in theory it
could be redeemed twice inside that window. PKCE almost entirely neutralises this (the
attacker would also need the one-time secret the real client generated), and the window is
tiny. Genuinely low; a used-code cache would close the theoretical gap.

### L6 — Rate limit is per-server-instance, not global — **Low**
The MCP rate limit (120 requests/minute per user) is counted in memory on each warm
serverless instance, so the real global ceiling is higher and resets on cold starts. Fine
as a speed bump against scraping; not a hard cap. Swapping the counter's storage for
Redis/Supabase is the known upgrade path, already noted in the code.

---

## 4. What was checked and is solid

Stated explicitly so the clean areas are on the record:

- **Token cryptography — solid.** Fixed HMAC-SHA256; the algorithm is never read from the
  token, so the classic "downgrade the signature to none" attack is structurally
  impossible. Signatures verified with constant-time comparison. Tokens are tagged by type
  (`client` / `code` / `access`), so one kind can't be replayed as another. The
  deck-write token uses a different payload shape and a deck-id binding, so even though it
  can share a signing secret, it can't be confused with an MCP token in practice.
- **PKCE — solid.** Required on every authorization, S256 only (the weak `plain` mode is
  never accepted), length-bounded, constant-time compared, and re-verified at token
  exchange against the challenge baked into the signed code.
- **Redirect destinations — solid.** Matched **exactly** against the registered list (no
  prefix/substring tricks), validated **before** any redirect can occur (a bad URI shows an
  error page, never a redirect), and re-checked at token exchange. Custom URL schemes are
  rejected; only `https` and loopback `http://localhost` are allowed.
- **Authorization-code binding — solid.** Each code is bound to the client, the user, the
  redirect URI, and the PKCE challenge; a code issued for one client or destination can't
  be redeemed for another. User identity comes only from the Supabase session, never from
  client input.
- **Dynamic client registration — solid.** Open by design (per the spec), but bounded:
  caps on the number and length of redirect URIs and client-name length, a scheme
  allowlist, and a **stateless signed `client_id`** so there's no unbounded database to
  flood and a client can't forge or tamper its own registration.
- **The MCP tool surface — solid.** Auth is required on every request; all eight tools
  derive the user from the verified token, never from arguments. The two **write** tools
  (`create_deck`, `update_deck`) enforce ownership before writing; reads return an
  identical "not found, or not yours" so deck IDs can't be probed. Every input is
  schema-validated and size-capped (2 MB HTML cap, 50-deck list cap, token-budgeted
  reads).
  - **One thing to write down for the team:** `update_deck` succeeds via the service-role
    database client, which **bypasses RLS** — so the app-level `loadOwnedDeck` check is the
    *only* thing stopping one user from writing another's deck. It's present and correct on
    every owner-scoped tool today. The rule to record: **any future write tool must call
    `loadOwnedDeck` first** — forgetting it would be a cross-user write bug that RLS would
    not catch.
- **Metadata endpoints, token endpoint, consent screen — solid.** The public discovery
  documents advertise only what's actually enforced; the token endpoint accepts only the
  `authorization_code` grant and leaks nothing useful in errors; every value shown on the
  consent screen is HTML-escaped (no injection).
- **Scopes — acceptable (intentional).** There's a single full-access scope, so every
  token can both read and write the owner's decks; there's no read-only tier. No bug here,
  just a note: a `decks:read` / `decks:write` split would be a hardening step if you ever
  hand tokens to partial-trust connectors.

---

## 5. Prioritized recommendations

1. **M1 — pin the public origin** to an env var (or confirm Vercel strips inbound
   `X-Forwarded-Host`). The only above-low item; a small change that settles it.
2. **L2 — confirm `/login` rejects off-site `next` values** (absolute + `//host` forms).
3. **Set a dedicated `MCP_TOKEN_SECRET` in production** so the OAuth signing key is
   independent of the Supabase service-role key (also closes June's L4), and consider an
   explicit type tag on deck-write tokens for belt-and-braces domain separation.
4. **L3 / L4 — add a revocation epoch** (invalidate tokens on logout / "disconnect apps")
   and/or shorten the 30-day access token with refresh tokens; revisit the 180-day
   deck-write token lifetime.
5. **Defense-in-depth — record the `loadOwnedDeck` rule** in the team docs (every future
   MCP write tool must call it, because the service-role client bypasses RLS), and
   consider a read/write scope split for future partial-trust connectors.

None of these are emergencies. M1 is the one worth a same-week confirmation; the rest are
hardening you can schedule.

---

*Confirmation: this review changed no code, config, styling, or behaviour. It produced
only this report file. The one code change made in this working session was the unrelated
extension origin-check fix (NS1) tracked separately.*
