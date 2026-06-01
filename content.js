const PROCESSED_ATTR = "data-slidehuddle-processed";
const BAR_CLASS = "slidehuddle-bar";
const STYLE_ID = "slidehuddle-style";
const FONT_LINK_ID = "slidehuddle-font";
const SCAN_DEBOUNCE_MS = 1500;
const CAPTURE_TIMEOUT_MS = 5000;

// === Endpoint configuration ===
// Flip PRODUCTION to false when developing against the local Next.js dev
// server (needs `npm run dev` from the web/ folder and a populated
// web/.env.local pointing at Supabase). Leave true for the live Vercel
// deployment which is what real users will hit.
const PRODUCTION = true;
const API_ENDPOINT = PRODUCTION
  ? "https://slidehuddleapp.vercel.app/api/slides"
  : "http://localhost:3000/api/slides";

const INLINE_SLIDE_IFRAME_PATTERNS = [
  /\.claudemcpcontent\.com\//i,
  /a\.claude\.ai\/isolated-segment/i,
  /\.claudeusercontent\.com\//i,
];

const isTopFrame = window.top === window;

// chrome.storage key for the conversation→deck map. Deck identity is bound to
// the Claude conversation it was captured from: { [conversationId]: { deckId,
// title, writeToken, updatedAt } }. This is how we decide, at capture time,
// whether the current conversation already has a deck (→ offer Update vs
// Create) and how we authorise an update (the writeToken). Per-browser; it's
// where the write token lives, so only the creating browser can update.
const MAP_KEY = "slidehuddleDeckByConversation";

// A claude.ai conversation lives at https://claude.ai/chat/<uuid> (confirmed
// with a real URL). The id is a standard 36-char UUID. We read it at CLICK
// time because claude.ai is a single-page app — the URL changes without a
// reload, so reading at load time would go stale.
const CONVERSATION_RE = /\/chat\/([0-9a-fA-F-]{36})\b/;
function getConversationId() {
  const m = location.href.match(CONVERSATION_RE);
  return m ? m[1] : null;
}

// ============================================================
// IFRAME MODE — small handler that replies to capture requests
// from the parent claude.ai page. We can't inject UI here
// (different origin), we just provide our HTML on demand.
// ============================================================
function scoreSlideHtml(html) {
  if (!html) return 0;
  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const divSlideCount = (html.match(/<div\s[^>]*class=["'][^"']*\bslide\b/gi) || []).length;
  // Penalise Cloudflare-only / nearly-empty challenge pages so they never win.
  const cloudflarePenalty = /cdn-cgi\/challenge-platform/i.test(html) ? -100 : 0;
  return sectionCount + divSlideCount + cloudflarePenalty;
}

function captureBestHtmlFromHere() {
  // Build a list of candidate HTML sources: our own document plus the srcdoc
  // and contentDocument of every nested iframe. Score each by how many
  // slide-shaped tags it contains, and pick the best. This handles:
  //   - MCP proxy with a single nested iframe holding the real slides
  //   - Artifact preview iframes that render slides directly in their body
  //     (with Cloudflare or tracking iframes as siblings)
  //   - Decks split across multiple nested iframes (pick the one with slides)
  const candidates = [];

  const ownHtml = document.documentElement?.outerHTML || "";
  candidates.push({ source: "own document", html: ownHtml });

  document.querySelectorAll("iframe").forEach((nested, i) => {
    const srcdoc = nested.srcdoc || "";
    if (srcdoc) {
      candidates.push({ source: `nested[${i}] srcdoc`, html: srcdoc });
    }
    try {
      const doc = nested.contentDocument;
      const html = doc?.documentElement?.outerHTML || "";
      if (html) {
        candidates.push({ source: `nested[${i}] contentDocument`, html });
      }
    } catch (err) {
      console.warn(
        `[SlideHuddle/iframe] nested[${i}].contentDocument blocked: ` +
        (err && err.message),
      );
    }
  });

  let best = candidates[0];
  let bestScore = scoreSlideHtml(best.html);
  for (let i = 1; i < candidates.length; i++) {
    const score = scoreSlideHtml(candidates[i].html);
    if (score > bestScore) {
      best = candidates[i];
      bestScore = score;
    }
  }

  console.log(
    "[SlideHuddle/iframe] capture chose " + best.source +
    ", score=" + bestScore + ", length=" + best.html.length +
    " (considered " + candidates.length + " candidates)",
  );
  return best.html;
}

function installIframeHandler() {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.__slidehuddle !== "capture") return;
    try {
      const html = captureBestHtmlFromHere();
      event.source?.postMessage({
        __slidehuddle: "capture-result",
        requestId: data.requestId,
        html,
      }, "*");
      console.log(
        "[SlideHuddle/iframe] sent capture-result, length=" + html.length,
      );
    } catch (err) {
      console.error("[SlideHuddle/iframe] capture failed:", err);
      event.source?.postMessage({
        __slidehuddle: "capture-result",
        requestId: data.requestId,
        html: "",
        error: String(err && err.message || err),
      }, "*");
    }
  });
  console.log("[SlideHuddle/iframe] handler installed in", location.href);
}

// ============================================================
// TOP-FRAME MODE — everything below runs only on claude.ai
// ============================================================
function injectAssets() {
  if (!document.getElementById(FONT_LINK_ID)) {
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600&display=swap";
    document.head?.appendChild(link);
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${BAR_CLASS} {
        display: flex;
        justify-content: flex-start;
        padding: 8px 0 4px;
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont,
          "Segoe UI", Roboto, sans-serif;
      }
      .${BAR_CLASS} button {
        all: unset;
        cursor: pointer;
        background: #4A3FB5;
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        padding: 8px 14px;
        border-radius: 8px;
        transition: background 120ms ease, transform 80ms ease;
      }
      .${BAR_CLASS} button:hover {
        background: #3D339A;
      }
      .${BAR_CLASS} button:active {
        transform: translateY(1px);
      }
      .${BAR_CLASS} button:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      .${BAR_CLASS} button.slidehuddle-error {
        background: #b54a4a;
      }
      .slidehuddle-choice {
        position: relative;
        margin: 2px 0 8px;
        max-width: 420px;
        background: #ffffff;
        border: 1px solid #e4e2f3;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(74, 63, 181, 0.16);
        padding: 12px 14px 13px;
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont,
          "Segoe UI", Roboto, sans-serif;
      }
      .slidehuddle-choice-msg {
        margin: 0 0 10px;
        font-size: 13px;
        line-height: 1.45;
        color: #2a2a33;
        padding-right: 18px;
      }
      .slidehuddle-choice-msg strong { color: #4A3FB5; font-weight: 600; }
      .slidehuddle-choice-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .slidehuddle-choice button {
        all: unset;
        cursor: pointer;
        font-size: 12.5px;
        font-weight: 600;
        line-height: 1;
        padding: 8px 12px;
        border-radius: 8px;
        transition: background 120ms ease, border-color 120ms ease;
      }
      /* Variant selectors are compound (button + class) so they out-specify
         the base 'all: unset' reset above — otherwise that reset wipes their
         background/colour and the buttons only appear on hover. */
      .slidehuddle-choice button.slidehuddle-choice-primary {
        background: #4A3FB5;
        color: #ffffff;
      }
      .slidehuddle-choice button.slidehuddle-choice-primary:hover {
        background: #3D339A;
      }
      .slidehuddle-choice button.slidehuddle-choice-secondary {
        background: #ffffff;
        color: #4A3FB5;
        box-shadow: inset 0 0 0 1px #cfcbe9;
      }
      .slidehuddle-choice button.slidehuddle-choice-secondary:hover {
        background: #f4f3fc;
      }
      .slidehuddle-choice button.slidehuddle-choice-cancel {
        position: absolute;
        top: 8px;
        right: 9px;
        background: transparent;
        color: #9b99ad;
        font-size: 13px;
        padding: 2px 5px;
      }
      .slidehuddle-choice button.slidehuddle-choice-cancel:hover {
        color: #4a4a55;
      }
    `;
    document.head?.appendChild(style);
  }
}

async function sendSlides(html, opts) {
  // Two modes:
  //   opts.update (deck id) + opts.token → save a new version of that deck.
  //   opts.conversation (id, optional)   → create a new deck, bound to the
  //                                         Claude conversation it came from.
  opts = opts || {};
  let endpoint = API_ENDPOINT;
  if (opts.update) {
    endpoint = API_ENDPOINT + "?update=" + encodeURIComponent(opts.update);
  } else if (opts.conversation) {
    endpoint = API_ENDPOINT + "?conversation=" + encodeURIComponent(opts.conversation);
  }
  const headers = { "Content-Type": "text/html" };
  if (opts.token) {
    headers["X-SlideHuddle-Update-Token"] = opts.token;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: html,
  });
  if (!response.ok) {
    // Try to surface the server's friendly error/detail. The API returns
    // a JSON body like { error: "Short label", detail: "Long sentence" }
    // for known rejections; we use `error` as a button-fitting label and
    // log `detail` for diagnostic context.
    let label = "API returned " + response.status;
    try {
      const data = await response.json();
      if (data && typeof data.error === "string" && data.error.length > 0) {
        label = data.error;
        if (typeof data.detail === "string" && data.detail.length > 0) {
          console.warn("[SlideHuddle] server rejected capture:", data.detail);
        }
      }
    } catch (_) {
      // Body wasn't JSON — keep the default "API returned N" label.
    }
    throw new Error(label);
  }
  const data = await response.json();
  if (!data || typeof data.url !== "string") {
    throw new Error("Unexpected response shape");
  }
  // Return the whole payload: callers need url + (for create) writeToken/title
  // so they can remember the deck against its conversation.
  return data;
}

// ---- Cross-frame capture ---------------------------------------------------

const pendingCaptureRequests = new Map();

function installCaptureReplyListener() {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.__slidehuddle !== "capture-result") return;
    const cb = pendingCaptureRequests.get(data.requestId);
    if (!cb) return;
    pendingCaptureRequests.delete(data.requestId);
    if (data.error) {
      cb.reject(new Error("Iframe error: " + data.error));
    } else {
      cb.resolve(data.html || "");
    }
  });
}

function captureFromIframe(iframe) {
  return new Promise((resolve, reject) => {
    if (!iframe.contentWindow) {
      reject(new Error("Iframe has no contentWindow"));
      return;
    }
    const requestId =
      "shc_" + Math.random().toString(36).slice(2) + "_" + Date.now();
    pendingCaptureRequests.set(requestId, { resolve, reject });
    setTimeout(() => {
      if (pendingCaptureRequests.delete(requestId)) {
        reject(new Error("Iframe capture timed out"));
      }
    }, CAPTURE_TIMEOUT_MS);
    iframe.contentWindow.postMessage(
      { __slidehuddle: "capture", requestId },
      "*",
    );
  });
}

// ---- Conversation → deck binding -------------------------------------------
//
// We remember which SlideHuddle deck each Claude conversation produced, keyed
// by conversation id, in chrome.storage.local. The stored writeToken is what
// authorises updating that deck (the extension presents it on ?update=).

function storageGet(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (res) => resolve(res ? res[key] : undefined));
    } catch (err) {
      console.warn("[SlideHuddle] storage.get failed:", err);
      resolve(undefined);
    }
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(obj, () => resolve());
    } catch (err) {
      console.warn("[SlideHuddle] storage.set failed:", err);
      resolve();
    }
  });
}

async function getDeckForConversation(conversationId) {
  if (!conversationId) return null;
  const map = (await storageGet(MAP_KEY)) || {};
  const entry = map[conversationId];
  if (entry && typeof entry.deckId === "string" && typeof entry.writeToken === "string") {
    return entry;
  }
  return null;
}

async function setDeckForConversation(conversationId, entry) {
  if (!conversationId) return;
  const map = (await storageGet(MAP_KEY)) || {};
  map[conversationId] = { ...entry, updatedAt: Date.now() };
  await storageSet({ [MAP_KEY]: map });
}

// ---- Capture-time choice prompt --------------------------------------------
//
// Shown only when the current conversation already has a deck. Lets the user
// decide, with the slides in front of them, whether to update that deck or
// branch off a separate one. Resolves to "update", "create", or "cancel".
function showConversationChoice(bar, deckTitle) {
  return new Promise((resolve) => {
    // Don't stack prompts.
    bar.parentElement
      ?.querySelectorAll(".slidehuddle-choice")
      .forEach((n) => n.remove());

    const card = document.createElement("div");
    card.className = "slidehuddle-choice";

    const name = (deckTitle || "Untitled deck").trim();
    const msg = document.createElement("p");
    msg.className = "slidehuddle-choice-msg";
    msg.append("This conversation already has a deck: ");
    const strong = document.createElement("strong");
    strong.textContent = "“" + name + "”";
    msg.append(strong);

    const row = document.createElement("div");
    row.className = "slidehuddle-choice-row";

    const updateBtn = document.createElement("button");
    updateBtn.type = "button";
    updateBtn.className = "slidehuddle-choice-primary";
    updateBtn.textContent = "Update to new version";

    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "slidehuddle-choice-secondary";
    createBtn.textContent = "Create separate deck";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "slidehuddle-choice-cancel";
    cancel.setAttribute("aria-label", "Cancel");
    cancel.textContent = "✕";

    function finish(choice) {
      card.remove();
      resolve(choice);
    }
    updateBtn.addEventListener("click", () => finish("update"));
    createBtn.addEventListener("click", () => finish("create"));
    cancel.addEventListener("click", () => finish("cancel"));

    row.append(updateBtn, createBtn);
    card.append(cancel, msg, row);
    bar.insertAdjacentElement("afterend", card);
  });
}

// ---- Button bar ------------------------------------------------------------

function createBar(slideType, getHtml) {
  const bar = document.createElement("div");
  bar.className = BAR_CLASS;
  bar.setAttribute("data-slide-type", slideType);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open in SlideHuddle";

  button.addEventListener("click", async () => {
    if (button.disabled) return;

    if (typeof getHtml !== "function") {
      console.warn(
        "[SlideHuddle] No HTML extractor for this slide type yet:",
        slideType,
      );
      flashError(button, "Not supported yet");
      return;
    }

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Capturing…";

    let html = "";
    try {
      const result = await getHtml();
      html = ((result || "") + "").trim();
    } catch (err) {
      console.error("[SlideHuddle] capture failed:", err);
      // Surface the thrown message if it looks like a user-facing one,
      // otherwise fall back to a generic label.
      const msg = err && err.message ? String(err.message) : "";
      const userMsg = msg && msg.length > 0 && msg.length < 70
        ? msg
        : "Capture failed";
      flashError(button, userMsg);
      button.disabled = false;
      return;
    }

    if (!html) {
      console.warn("[SlideHuddle] Empty HTML — nothing to send");
      flashError(button, "No slides found");
      button.disabled = false;
      return;
    }

    // Decide create-vs-update from the conversation this capture came from.
    // If this conversation already produced a deck, ask the user (in context)
    // whether to update it or branch a separate one. Otherwise just create.
    const conversationId = getConversationId();
    const existing = await getDeckForConversation(conversationId);

    let mode = "create"; // "create" | "update"
    if (existing) {
      button.textContent = "Choose below…";
      const choice = await showConversationChoice(bar, existing.title);
      if (choice === "cancel") {
        button.textContent = "Open in SlideHuddle";
        button.disabled = false;
        return;
      }
      mode = choice; // "update" or "create" (= create separate)
    }

    button.textContent = mode === "update" ? "Updating…" : "Sending…";

    try {
      const data =
        mode === "update"
          ? await sendSlides(html, {
              update: existing.deckId,
              token: existing.writeToken,
            })
          : await sendSlides(html, { conversation: conversationId });

      const url = data.url;
      // New captures carry source=capture so the creator-claim flow runs.
      // Updates land on the SAME deck — no source marker.
      const openUrl =
        mode === "update"
          ? url
          : url + (url.includes("?") ? "&" : "?") + "source=capture";

      // Remember the conversation→deck binding for next time.
      if (mode === "update") {
        await setDeckForConversation(conversationId, {
          deckId: existing.deckId,
          writeToken: existing.writeToken,
          title:
            typeof data.title === "string" && data.title
              ? data.title
              : existing.title,
        });
      } else if (conversationId && typeof data.writeToken === "string") {
        // Create / "create separate" → (re)bind the conversation to the new
        // deck so future captures offer to update the one you're working on.
        await setDeckForConversation(conversationId, {
          deckId: data.id,
          writeToken: data.writeToken,
          title: typeof data.title === "string" ? data.title : null,
        });
      }

      console.log(
        "[SlideHuddle] Slides " + (mode === "update" ? "updated" : "posted") +
        ", opening", openUrl,
      );
      window.open(openUrl, "_blank", "noopener,noreferrer");
      button.textContent = mode === "update" ? "Updated ↗" : "Opened ↗";
      setTimeout(() => {
        button.textContent = "Open in SlideHuddle";
        button.disabled = false;
      }, 2000);
    } catch (err) {
      console.error("[SlideHuddle] Failed to send slides:", err);
      // Surface the server's friendly error label (set by sendSlides()
      // from the response body) if we got one. Pure "API returned N"
      // or generic Error messages indicate a network / unreachable
      // problem — fall back to the original "is SlideHuddle running?"
      // copy in that case.
      const msg = (err && err.message) || "";
      const isNetworkError =
        !msg || /^API returned \d+$/.test(msg) || /^Failed to fetch/i.test(msg);
      const userMessage = isNetworkError
        ? "Failed — is SlideHuddle running?"
        : msg;
      flashError(button, userMessage, originalText);
    }
  });

  bar.appendChild(button);
  return bar;
}

function flashError(button, message, restoreText) {
  const original = restoreText || button.textContent;
  button.textContent = message;
  button.classList.add("slidehuddle-error");
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove("slidehuddle-error");
    button.disabled = false;
  }, 3000);
}

// ---- Detection: PPTX artifact card -----------------------------------------

function logPptxFileInfo() {
  const iframe = document.querySelector('iframe[title$=".pptx"]');
  if (iframe) {
    console.log("[SlideHuddle] PPTX iframe title:", iframe.title);
    console.log("[SlideHuddle] PPTX iframe src:", iframe.src);
  }

  const thumbs = document.querySelectorAll('img[alt*="slide"]');
  if (thumbs.length > 0) {
    console.log(
      "[SlideHuddle] slide thumbnails found:",
      thumbs.length,
    );
    const srcs = Array.from(thumbs)
      .map((img) => img.src)
      .filter((s) => s.includes("/api/"));
    if (srcs.length > 0) {
      console.log("[SlideHuddle] file API paths:", srcs);
    }
  }
}

function findHtmlNearArtifact(block) {
  let container = block;
  for (let i = 0; i < 12 && container.parentElement; i++) {
    container = container.parentElement;
    const pre = container.querySelector("pre");
    if (pre && textHasSlideHTML(pre.textContent || "")) {
      return pre;
    }
  }
  return null;
}

function findArtifactPreviewIframe() {
  // When Claude shows an artifact card but no inline source <pre>, the
  // rendered slide HTML is in the artifact-viewer preview iframe (right
  // pane), typically at www.claudeusercontent.com. Find a visible iframe
  // matching one of our known slide-iframe URL patterns.
  const iframes = document.querySelectorAll("iframe");
  for (const frame of iframes) {
    const src = frame.src || "";
    if (!INLINE_SLIDE_IFRAME_PATTERNS.some((p) => p.test(src))) continue;
    if (isHiddenOrTinyIframe(frame)) continue;
    return frame;
  }
  return null;
}

// Build a lazy HTML getter for an artifact card. We re-check for the source
// AT CLICK TIME instead of at injection time, because Claude often loads the
// artifact preview iframe asynchronously — at injection time it may not exist
// yet, but it usually does by the time the user clicks.
function makeArtifactGetHtml(block) {
  return async () => {
    // First try the inline <pre> code block (when Claude shows the source
    // expanded inline in the conversation).
    const pre = findHtmlNearArtifact(block);
    if (pre) {
      const text = pre.textContent || "";
      if (text.trim()) {
        console.log("[SlideHuddle] artifact capture: using inline <pre>");
        return text;
      }
    }
    // Fall back to the artifact preview iframe (right pane), which usually
    // exists by click time even when it didn't at injection time.
    const previewFrame = findArtifactPreviewIframe();
    if (previewFrame) {
      console.log(
        "[SlideHuddle] artifact capture: using preview iframe, src=" +
        (previewFrame.src || "").slice(0, 100),
      );
      return await captureFromIframe(previewFrame);
    }
    throw new Error(
      "No source found. Open the artifact preview, then try again.",
    );
  };
}

function detectArtifactSlides() {
  const blocks = document.querySelectorAll('[class*="artifact-block"]');
  let found = false;

  blocks.forEach((block) => {
    if (block.closest("[" + PROCESSED_ATTR + "]")) return;

    const text = block.textContent || "";
    let slideType = null;

    if (/\bPPTX\b/i.test(text)) {
      slideType = "pptx";
    } else if (/\bPresentation\b/i.test(text)) {
      slideType = "pptx";
    } else if (/\bHTML\b/i.test(text)) {
      // Any HTML artifact qualifies. We used to require the word "slide"
      // in the card text, but artifact titles are user-chosen — many slide
      // decks have titles like "Claude vs Claude Code" with no slide keyword,
      // so the strict check missed them. False positives (a non-slide HTML
      // artifact getting the button) fail gracefully at click time via the
      // lazy source lookup's "No source found" error.
      slideType = "html";
    }

    if (!slideType) return;

    console.log(
      "[SlideHuddle] artifact detected: type=" + slideType +
      ', label="' + text.trim().substring(0, 80) + '"',
    );

    if (slideType === "pptx") {
      // PPTX capture isn't built yet. We keep the detection (and the file-info
      // logging that will seed that work) but deliberately DON'T inject a
      // button — a button that fails with "Not supported yet" at click time is
      // worse than no button. Re-enable injection here once a PPTX capture
      // path exists (a non-null getHtml for the "pptx" type).
      logPptxFileInfo();
      console.log(
        "[SlideHuddle] PPTX detected — button suppressed (capture not built yet)",
      );
      return;
    }

    const wrapper = block.parentElement;
    if (!wrapper || wrapper.querySelector("." + BAR_CLASS)) return;

    let getHtml = null;
    if (slideType === "html") {
      // Bind a lazy getter — it checks for source (inline <pre> or preview
      // iframe) at CLICK time, not now. Claude loads the preview iframe
      // asynchronously, so it may not be present when the button is injected
      // but will usually be there by the time the user clicks.
      getHtml = makeArtifactGetHtml(block);
      console.log(
        "[SlideHuddle] artifact button bound with lazy source lookup",
      );
    }

    wrapper.setAttribute(PROCESSED_ATTR, "true");
    wrapper.insertAdjacentElement("afterend", createBar(slideType, getHtml));
    found = true;
    console.log("[SlideHuddle] button injected (" + slideType + ")");
  });

  return found;
}

// ---- Detection: code-block with slide-shaped HTML --------------------------

function textHasSlideHTML(text) {
  if ((text.match(/<section[\s>]/gi) || []).length >= 2)
    return "multiple-sections";
  if (/<section[\s>]/i.test(text) && /\bslide\b/i.test(text))
    return "section-with-slide-keyword";
  if ((text.match(/class=["'][^"']*slide/gi) || []).length >= 2)
    return "slide-css-classes";
  if (/\bslide\b/i.test(text) && (text.match(/<div[\s>]/gi) || []).length >= 3)
    return "divs-with-slide-keyword";
  return null;
}

function findResponseContainer(el) {
  let current = el;

  for (
    let i = 0;
    i < 20 && current.parentElement && current.parentElement !== document.body;
    i++
  ) {
    current = current.parentElement;
    if (
      current.hasAttribute("data-is-streaming") ||
      current.hasAttribute("data-test-render-count")
    ) {
      return current;
    }
  }

  current = el;
  for (let i = 0; i < 6 && current.parentElement; i++) {
    current = current.parentElement;
  }
  return current;
}

function detectCodeBlockSlides() {
  const allPres = document.querySelectorAll("pre");
  let found = false;

  allPres.forEach((pre, i) => {
    if (pre.closest("[" + PROCESSED_ATTR + "]")) return;

    const text = pre.textContent || "";
    const reason = textHasSlideHTML(text);
    if (!reason) return;

    console.log(
      "[SlideHuddle] <pre> #" + i + " matched: " + reason +
      " (" + text.length + " chars)",
    );

    const container = findResponseContainer(pre);
    if (container.querySelector("." + BAR_CLASS)) return;

    container.setAttribute(PROCESSED_ATTR, "true");
    container.appendChild(
      createBar("html", () => pre.textContent || ""),
    );
    found = true;
    console.log("[SlideHuddle] button injected (html via code block)");
  });

  return found;
}

// ---- Detection: inline iframe slides (NEW) ---------------------------------

function isHiddenOrTinyIframe(frame) {
  // Claude's pages include hidden 1x1 utility iframes (analytics, session
  // verification, Cloudflare bot challenges) at the same origins as the
  // slide-deck iframes. Filter those out by size and visibility — a real
  // slide deck is always visibly rendered and large.
  if (frame.width === "1" || frame.height === "1") return true;
  if (frame.width === "0" || frame.height === "0") return true;
  const style = window.getComputedStyle(frame);
  if (style.visibility === "hidden" || style.display === "none") return true;
  if (parseFloat(style.opacity) === 0) return true;
  const rect = frame.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return true;
  return false;
}

function detectInlineIframeSlides() {
  const iframes = document.querySelectorAll("iframe");
  let found = false;

  iframes.forEach((frame) => {
    if (frame.closest("[" + PROCESSED_ATTR + "]")) return;
    const src = frame.src || "";
    if (!INLINE_SLIDE_IFRAME_PATTERNS.some((p) => p.test(src))) return;

    if (isHiddenOrTinyIframe(frame)) {
      console.log(
        "[SlideHuddle] skipping hidden/tiny iframe, src=" + src.slice(0, 100),
      );
      return;
    }

    const wrapper = frame.parentElement;
    if (!wrapper || wrapper.querySelector("." + BAR_CLASS)) return;

    console.log(
      "[SlideHuddle] inline iframe detected, title=" +
      JSON.stringify(frame.title) + ", src=" + src.slice(0, 120),
    );

    wrapper.setAttribute(PROCESSED_ATTR, "true");
    wrapper.insertAdjacentElement(
      "afterend",
      createBar("html-iframe", () => captureFromIframe(frame)),
    );
    found = true;
    console.log("[SlideHuddle] button injected (inline iframe)");
  });

  return found;
}

// ---- Scan loop -------------------------------------------------------------

function scan() {
  injectAssets();

  const artifactFound = detectArtifactSlides();
  const codeBlockFound = detectCodeBlockSlides();
  const iframeFound = detectInlineIframeSlides();

  if (!artifactFound && !codeBlockFound && !iframeFound) {
    const artifacts = document.querySelectorAll(
      '[class*="artifact-block"]',
    ).length;
    const pres = document.querySelectorAll("pre").length;
    const frames = document.querySelectorAll("iframe").length;
    console.log(
      "[SlideHuddle] scan — no slides detected (" +
      artifacts + " artifacts, " + pres + " code blocks, " +
      frames + " iframes on page)",
    );
  }
}

let scanTimer = null;
function scheduleScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, SCAN_DEBOUNCE_MS);
}

// ============================================================
// Entry point
// ============================================================
if (isTopFrame) {
  installCaptureReplyListener();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleScan();
  console.log("[SlideHuddle] content script loaded on", window.location.href);
} else {
  installIframeHandler();
}
