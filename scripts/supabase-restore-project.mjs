import process from "node:process";

import {
  getManagementAccessToken,
  getSupabaseProjectRef,
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

async function getProjectStatus(token, ref) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao consultar projeto (${response.status}): ${body}`);
  }
  return response.json();
}

async function restoreProject(token, ref) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/restore`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao restaurar projeto (${response.status}): ${body}`);
  }
}

async function main() {
  loadLocalEnvFiles();

  const token = getManagementAccessToken();
  const ref = getSupabaseProjectRef();
  const force = process.argv.includes("--force");

  const project = await getProjectStatus(token, ref);
  const status = typeof project?.status === "string" ? project.status : "UNKNOWN";
  console.log(`[${nowIso()}] Projeto ${ref} status atual: ${status}`);

  if (status !== "INACTIVE" && !force) {
    console.log(`[${nowIso()}] Sem restore: use --force para disparar mesmo assim.`);
    return;
  }

  await restoreProject(token, ref);
  console.log(`[${nowIso()}] Restore disparado para ${ref}.`);
}

main().catch((err) => {
  const message = formatError(err);
  console.error(`[${nowIso()}] ERRO restore: ${message}`);
  process.exitCode = 1;
});
