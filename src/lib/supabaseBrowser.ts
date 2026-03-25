"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAnonKey, getSupabaseAuthUrl } from "@/lib/supabaseAuthShared";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    getSupabaseAuthUrl(),
    getSupabaseAnonKey(),
  );

  return browserClient;
}
