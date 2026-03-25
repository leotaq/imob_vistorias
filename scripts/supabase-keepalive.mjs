import process from "node:process";

import {
  getManagementAccessToken,
  getSupabaseDataKey,
  getSupabaseProjectRef,
  getSupabaseUrl,
  loadLocalEnvFiles,
  nowIso,
} from "./_supabaseEnv.mjs";

function formatError(err) {
  if (err instanceof Error) {
    const cause =
      err.cause && typeof err.cause === "object" && "message" in err.cause
        ? String(err.cause.message)
        : null;
    return cause ? `${err.message} | cause: ${cause}` : err.message;
  }
  return String(err);
}

async function pingDataApi() {
  const supabaseUrl = getSupabaseUrl();
  const key = getSupabaseDataKey();
  const table = process.env.SUPABASE_KEEPALIVE_TABLE?.trim() || "people";
  const pingUrl = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=id&limit=1`;

  const response = await fetch(pingUrl, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ping falhou (${response.status}): ${body}`);
  }

  console.log(`[${nowIso()}] Keepalive OK (${response.status}) tabela=${table}`);
}

async function restoreIfInactive() {
  const shouldRestore = process.env.SUPABASE_AUTO_RESTORE === "1";
  if (!shouldRestore) return;

  const token = getManagementAccessToken();
  const ref = getSupabaseProjectRef();
  const base = "https://api.supabase.com/v1/projects";

  const statusResponse = await fetch(`${base}/${ref}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!statusResponse.ok) {
    const body = await statusResponse.text();
    throw new Error(`Falha ao consultar status (${statusResponse.status}): ${body}`);
  }

  const project = await statusResponse.json();
  const status = typeof project?.status === "string" ? project.status : "UNKNOWN";
  if (status !== "INACTIVE") {
    console.log(`[${nowIso()}] Projeto ${ref} status=${status}. Nada para restaurar.`);
    return;
  }

  const restoreResponse = await fetch(`${base}/${ref}/restore`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!restoreResponse.ok) {
    const body = await restoreResponse.text();
    throw new Error(`Falha ao restaurar (${restoreResponse.status}): ${body}`);
  }

  console.log(`[${nowIso()}] Restore disparado para projeto ${ref}.`);
}

async function main() {
  loadLocalEnvFiles();
  await pingDataApi();
  await restoreIfInactive();
}

main().catch((err) => {
  const message = formatError(err);
  console.error(`[${nowIso()}] ERRO keepalive: ${message}`);
  process.exitCode = 1;
});
