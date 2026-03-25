import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { getSupabaseDataKey, getSupabaseUrl, loadLocalEnvFiles } from "./_supabaseEnv.mjs";

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

function normalizeAddress(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendDefaultCity(address, defaultCity) {
  const cleanedAddress = normalizeAddress(address);
  const cleanedCity = normalizeAddress(defaultCity);
  if (!cleanedAddress || !cleanedCity) return cleanedAddress;

  const normalizedAddress = cleanedAddress
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normalizedCity = cleanedCity
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalizedAddress.includes(normalizedCity)) return cleanedAddress;
  return `${cleanedAddress}, ${cleanedCity}`;
}

function isCodeInformative(code) {
  const normalized = normalizeCode(code)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return false;
  return normalized !== "NAO INFORMADO";
}

function mapRowToEntry(row) {
  if (!row || typeof row !== "object") return null;
  const code = row.IMOVEL ?? row.imovel ?? row.codigo ?? row.code;
  const address =
    row.ENDEREÇO ?? row.ENDERECO ?? row.endereco ?? row.address ?? row.ENDERECO_COMPLETO;
  if (code === undefined || address === undefined) return null;

  const normalizedCode = normalizeCode(code);
  const defaultCity = process.env.IMPORT_DEFAULT_CITY || "Taquara";
  const normalizedStreet = normalizeAddress(address);
  const normalizedAddress = appendDefaultCity(address, defaultCity);
  if (!isCodeInformative(normalizedCode) || !normalizedAddress || !normalizedStreet) return null;

  return {
    code: normalizedCode,
    code_normalized: normalizedCode,
    address: normalizedAddress,
    property_street: normalizedStreet,
    property_number: null,
    property_complement: null,
    property_neighborhood: null,
    property_city: defaultCity,
  };
}

function parseWithRegex(raw) {
  const rows = [];
  const pattern =
    /"IMOVEL"\s*:\s*("[^"]+"|-?\d+)\s*,\s*"ENDERE[ÇC]O"\s*:\s*"([^"]*)"/gim;

  let match;
  while ((match = pattern.exec(raw)) !== null) {
    let code = match[1];
    if (code.startsWith('"') && code.endsWith('"')) {
      code = code.slice(1, -1);
    }
    rows.push({ IMOVEL: code, ENDEREÇO: match[2] });
  }
  return rows;
}

function parseInput(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("JSON não é uma lista.");
  } catch {
    return parseWithRegex(raw);
  }
}

async function upsertProperties(entries) {
  const supabaseUrl = getSupabaseUrl();
  const key = getSupabaseDataKey();

  const endpoint = `${supabaseUrl}/rest/v1/properties?on_conflict=code_normalized`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(entries),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha no upsert (${response.status}): ${body}`);
  }
}

async function main() {
  loadLocalEnvFiles();

  const inputArg = process.argv[2];
  if (!inputArg) {
    throw new Error("Informe o caminho do arquivo: node scripts/import-properties.mjs <arquivo>");
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Arquivo não encontrado: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const parsedRows = parseInput(raw);

  const byCode = new Map();
  let ignored = 0;
  for (const row of parsedRows) {
    const entry = mapRowToEntry(row);
    if (!entry) {
      ignored += 1;
      continue;
    }
    byCode.set(entry.code_normalized, entry);
  }

  const entries = Array.from(byCode.values());
  if (!entries.length) {
    throw new Error("Nenhum imóvel válido encontrado para importar.");
  }

  await upsertProperties(entries);
  console.log(
    `Importação concluída. Lidos=${parsedRows.length} válidos=${entries.length} ignorados=${ignored}`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERRO import-properties: ${message}`);
  process.exitCode = 1;
});
