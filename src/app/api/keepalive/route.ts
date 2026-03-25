import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { HttpError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

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

function getProjectRefFromEnv(): string {
  const explicit = normalizeEnv(process.env.SUPABASE_PROJECT_REF);
  if (explicit) return explicit;

  const url = normalizeEnv(process.env.SUPABASE_URL)
    ?? normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) {
    throw new HttpError(
      500,
      "SUPABASE_PROJECT_REF ausente e não foi possível inferir pelo SUPABASE_URL.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(500, "SUPABASE_URL inválido para inferir project ref.");
  }

  const ref = parsed.hostname.split(".")[0];
  if (!ref) {
    throw new HttpError(
      500,
      "Não foi possível inferir project ref pelo host de SUPABASE_URL.",
    );
  }
  return ref;
}

function assertCronAuthorization(req: Request) {
  const secret = normalizeEnv(process.env.CRON_SECRET);
  if (!secret) return;

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new HttpError(401, "Não autorizado.");
  }
}

async function pingDataApi() {
  const table = normalizeEnv(process.env.SUPABASE_KEEPALIVE_TABLE) || "people";
  const sb = supabaseAdmin();
  const { error } = await sb.from(table).select("id").limit(1);
  if (error) {
    throw new HttpError(500, `Falha no keepalive da tabela '${table}'.`, error);
  }
  return { table };
}

async function restoreIfInactive() {
  const autoRestore = process.env.SUPABASE_AUTO_RESTORE === "1";
  if (!autoRestore) {
    return {
      autoRestoreEnabled: false,
      restored: false,
      status: null as string | null,
    };
  }

  const accessToken = normalizeEnv(process.env.SUPABASE_ACCESS_TOKEN);
  if (!accessToken) {
    throw new HttpError(
      500,
      "SUPABASE_AUTO_RESTORE=1 requer SUPABASE_ACCESS_TOKEN.",
    );
  }

  const ref = getProjectRefFromEnv();
  const base = "https://api.supabase.com/v1/projects";

  const statusResponse = await fetch(`${base}/${ref}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!statusResponse.ok) {
    const body = await statusResponse.text();
    throw new HttpError(
      500,
      `Falha ao consultar status do projeto (${statusResponse.status}).`,
      body,
    );
  }

  const project = (await statusResponse.json()) as { status?: unknown };
  const status = typeof project.status === "string" ? project.status : "UNKNOWN";
  if (status !== "INACTIVE") {
    return {
      autoRestoreEnabled: true,
      restored: false,
      status,
      projectRef: ref,
    };
  }

  const restoreResponse = await fetch(`${base}/${ref}/restore`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!restoreResponse.ok) {
    const body = await restoreResponse.text();
    throw new HttpError(
      500,
      `Falha ao restaurar projeto (${restoreResponse.status}).`,
      body,
    );
  }

  return {
    autoRestoreEnabled: true,
    restored: true,
    status,
    projectRef: ref,
  };
}

export async function GET(req: Request) {
  try {
    assertCronAuthorization(req);
    const pingResult = await pingDataApi();
    const restoreResult = await restoreIfInactive();

    return jsonNoStore({
      ok: true,
      at: new Date().toISOString(),
      ping: pingResult,
      restore: restoreResult,
    });
  } catch (err) {
    return apiError(err);
  }
}
