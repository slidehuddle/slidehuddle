// Lightweight "what's the latest version of this deck?" endpoint, used by the
// viewer to notice when a deck is revised out-of-band (e.g. Claude saving a new
// version via the MCP server) without a manual browser refresh.
//
// Returns only the version number — nothing sensitive, and the deck is already
// public-by-link — so this needs no auth. Never cached.

import { NextRequest, NextResponse } from "next/server";
import { getDeckMeta } from "@/lib/slide-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const meta = await getDeckMeta(id);
  if (!meta) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(
    { version: meta.version },
    { headers: { "cache-control": "no-store" } },
  );
}
