import { HttpError } from "@/lib/errors";

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

export function getSupabaseAuthUrl(): string {
  const url = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    ?? normalizeEnv(process.env.SUPABASE_URL);

  if (!url) {
    throw new HttpError(
      500,
      "NEXT_PUBLIC_SUPABASE_URL ausente. Defina o Supabase da beta antes de usar auth.",
    );
  }
  if (!isValidUrl(url)) {
    throw new HttpError(500, "NEXT_PUBLIC_SUPABASE_URL invalido.");
  }

  return url;
}

export function getSupabaseAnonKey(): string {
  const key = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!key) {
    throw new HttpError(
      500,
      "NEXT_PUBLIC_SUPABASE_ANON_KEY ausente. Configure a chave publica do Supabase beta.",
    );
  }
  if (!isSupabaseKey(key)) {
    throw new HttpError(500, "NEXT_PUBLIC_SUPABASE_ANON_KEY invalida.");
  }
  return key;
}
