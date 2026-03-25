import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function normalizeEnv(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "undefined" || lowered === "null" || lowered === "none") {
    return null;
  }
  return trimmed;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex < 1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1);

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

export function loadLocalEnvFiles(baseDir = process.cwd()) {
  loadEnvFile(path.join(baseDir, ".env"));
  loadEnvFile(path.join(baseDir, ".env.local"));
}

export function getSupabaseUrl() {
  const candidates = [
    normalizeEnv(process.env.SUPABASE_URL),
    normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return candidate;
      }
    } catch {
      // ignore invalid candidate
    }
  }
  throw new Error("SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) invalido/ausente.");
}

export function getSupabaseDataKey() {
  const serviceRoleKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente.");
  }
  return serviceRoleKey;
}

export function getManagementAccessToken() {
  const token = normalizeEnv(process.env.SUPABASE_ACCESS_TOKEN);
  if (!token) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN ausente. Crie em https://supabase.com/dashboard/account/tokens",
    );
  }
  return token;
}

export function getSupabaseProjectRef() {
  const explicit = normalizeEnv(process.env.SUPABASE_PROJECT_REF);
  if (explicit) return explicit;

  const url = getSupabaseUrl();
  const parsed = new URL(url);
  const hostParts = parsed.hostname.split(".");
  if (!hostParts.length || !hostParts[0]) {
    throw new Error(
      "Nao foi possivel inferir o project ref a partir de SUPABASE_URL. Defina SUPABASE_PROJECT_REF.",
    );
  }
  return hostParts[0];
}

export function nowIso() {
  return new Date().toISOString();
}
