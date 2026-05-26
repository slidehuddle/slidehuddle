import { NextRequest, NextResponse } from "next/server";
import { storeSlides } from "@/lib/slide-store";

// Hard cap on captured slide HTML. Claude decks we've seen are well under
// 500KB; 2MB leaves comfortable headroom for image-heavy decks while
// preventing megabyte-scale junk inserts into Supabase.
const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Only the extension (running on claude.ai or one of Claude's user/MCP
// content origins) should be able to POST. Anything else gets no CORS
// headers back, so browsers block the cross-origin request.
const ALLOWED_ORIGINS = new Set([
  "https://claude.ai",
  "https://a.claude.ai",
  "https://www.claude.ai",
]);

// Additionally allow any *.claudeusercontent.com / *.claudemcpcontent.com
// origin (these vary per artifact preview). Match by suffix.
const ALLOWED_ORIGIN_SUFFIXES = [
  ".claudeusercontent.com",
  ".claudemcpcontent.com",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): HeadersInit {
  // Only reflect the origin if it's on our allowlist. Otherwise omit the
  // CORS headers entirely so the browser blocks the response.
  if (!isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!isAllowedOrigin(origin)) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: "Slide HTML exceeds size limit" },
      { status: 413, headers },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let html: string | undefined;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    html = body?.html;
  } else if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    html = await request.text();
  } else {
    return NextResponse.json(
      { error: "Unsupported Content-Type" },
      { status: 415, headers },
    );
  }

  if (!html || typeof html !== "string" || html.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing slide HTML in request body" },
      { status: 400, headers },
    );
  }

  // Belt-and-braces: if the client lied about Content-Length, the body
  // may still be bigger than the cap once buffered. Reject after the fact.
  if (html.length > MAX_HTML_BYTES) {
    return NextResponse.json(
      { error: "Slide HTML exceeds size limit" },
      { status: 413, headers },
    );
  }

  let id: string;
  try {
    id = await storeSlides(html);
  } catch (err) {
    console.error("[/api/slides] store failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to store deck",
      },
      { status: 500, headers },
    );
  }

  const viewerOrigin = request.nextUrl.origin;
  const viewerUrl = `${viewerOrigin}/viewer?id=${id}`;

  return NextResponse.json(
    { id, url: viewerUrl },
    { status: 201, headers }
  );
}
