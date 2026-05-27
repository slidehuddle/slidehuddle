import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${request.nextUrl.origin}/login`, {
    // 303 = "see other" → forces the browser to switch from POST to GET
    // when following the redirect. Without this some browsers re-POST.
    status: 303,
  });
}
