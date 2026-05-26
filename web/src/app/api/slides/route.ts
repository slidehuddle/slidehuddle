import { NextRequest, NextResponse } from "next/server";
import { storeSlides } from "@/lib/slide-store";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let html: string | undefined;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    html = body?.html;
  } else {
    html = await request.text();
  }

  if (!html || typeof html !== "string" || html.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing slide HTML in request body" },
      { status: 400, headers: CORS_HEADERS }
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
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const origin = request.nextUrl.origin;
  const viewerUrl = `${origin}/viewer?id=${id}`;

  return NextResponse.json(
    { id, url: viewerUrl },
    { status: 201, headers: CORS_HEADERS }
  );
}
