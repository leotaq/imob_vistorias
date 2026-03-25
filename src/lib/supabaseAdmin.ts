import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/errors";

let _client: SupabaseClient | null = null;

function normalizeEnv(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered === "undefined" || lowered === "null" || lowered === "none") {
    return null;
  }

  return trimmed;
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isSupabaseKey(value: string): boolean {
  if (value.startsWith("sb_publishable_") || value.startsWith("sb_secret_")) {
    return true;
  }

  const segments = value.split(".");
  return segments.length === 3 && segments.every((segment) => segment.length > 0);
}

function getSupabaseUrl(): string {
  const url = normalizeEnv(process.env.SUPABASE_URL)
    ?? normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) {
    throw new HttpError(
      500,
      "SUPABASE_URL ausente. Defina SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL).",
    );
  }
  if (!isValidUrl(url)) {
    throw new HttpError(500, "SUPABASE_URL inválido.");
  }
  return url;
}

function getSupabaseKey(): string {
  const serviceRoleKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) {
    throw new HttpError(500, "SUPABASE_SERVICE_ROLE_KEY ausente.");
  }
  if (!isSupabaseKey(serviceRoleKey)) {
    throw new HttpError(500, "SUPABASE_SERVICE_ROLE_KEY inválida.");
  }
  return serviceRoleKey;
}

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}
