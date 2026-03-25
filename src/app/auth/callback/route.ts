import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function sanitizeNext(value: string | null): string {
  if (!value) return "/vistorias";
  if (!value.startsWith("/")) return "/vistorias";
  if (value.startsWith("//")) return "/vistorias";
  return value;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = sanitizeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
