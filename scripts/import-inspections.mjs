import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { getSupabaseDataKey, getSupabaseUrl, loadLocalEnvFiles } from "./_supabaseEnv.mjs";

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------
const TYPE_MAP = {
  "OCUPACAO": "ocupacao",
  "DESOCUPACAO": "desocupacao",
  "REVISTORIA": "revistoria",
  "VISITA": "visita",
  "PLACA/FOTOS": "placa_fotos",
  "PRE VISTORIA": "revistoria",
  "VERIFICAR PAPEL DE PAREDE": "visita",
  "VER. MODIFICACOES": "visita",
  "NEGO DESOCUPACAO": "desocupacao",
  "MANUTENCAO": "manutencao",
  "MANUTENCAO/REPAROS": "manutencao",
};

function normalizeTypeKey(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapType(raw) {
  const key = normalizeTypeKey(raw);
  const mapped = TYPE_MAP[key];
  if (!mapped) {
    console.warn(`[WARN] Tipo desconhecido: "${raw}" (normalizado: "${key}"). Pulando.`);
    return null;
  }
  return mapped;
}

// ---------------------------------------------------------------------------
// Date / time parsing
// ---------------------------------------------------------------------------

/**
 * Parse "29/01/26" → { day: 29, month: 1, year: 2026 }
 * Also accepts "29/01/2026".
 */
function parseDate(raw) {
  const cleaned = String(raw || "").trim().replace(/\s+/g, "");
  // DD/MM/YY or DD/MM/YYYY
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
}

/**
 * Parse various time formats:
 * "10H10" → { h: 10, m: 10 }
 * "8 HS"  → { h: 8, m: 0 }
 * "10:50" → { h: 10, m: 50 }
 * "13H05H" → { h: 13, m: 5 }
 * "16 HS"  → { h: 16, m: 0 }
 * "8HS"   → { h: 8, m: 0 }
 */
function parseTime(raw) {
  const cleaned = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return { h: 8, m: 0 }; // default

  // "10H10", "13H05", "10H05H"
  let match = cleaned.match(/^(\d{1,2})H(\d{1,2})H?$/);
  if (match) return { h: parseInt(match[1], 10), m: parseInt(match[2], 10) };

  // "8HS", "16 HS", "8H"
  match = cleaned.match(/^(\d{1,2})H?S?$/);
  if (match) return { h: parseInt(match[1], 10), m: 0 };

  // "10:50"
  match = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match) return { h: parseInt(match[1], 10), m: parseInt(match[2], 10) };

  // "16H" exactly
  match = cleaned.match(/^(\d{1,2})H$/);
  if (match) return { h: parseInt(match[1], 10), m: 0 };

  console.warn(`[WARN] Horario nao reconhecido: "${raw}". Usando 08:00.`);
  return { h: 8, m: 0 };
}

/**
 * Combine date + time into ISO string (UTC).
 * Input is local time in America/Sao_Paulo (UTC-3).
 */
function toUtcIso(dateParts, timeParts) {
  const { day, month, year } = dateParts;
  const { h, m } = timeParts;
  // Local time is UTC-3, so we add 3 hours to get UTC
  const utcMs = Date.UTC(year, month - 1, day, h + 3, m, 0, 0);
  return new Date(utcMs).toISOString();
}

// ---------------------------------------------------------------------------
// OBS field parsing — extract contract_date and notes
// ---------------------------------------------------------------------------
function parseObs(raw) {
  const text = String(raw || "").trim();
  if (!text) return { contractDate: null, notes: null };

  // Look for date pattern DD/MM/YYYY in the text
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let contractDate = null;

  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const year = parseInt(dateMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Also try to extract time after the date (e.g., "02/02/2026 13H30")
      const afterDate = text.slice(dateMatch.index + dateMatch[0].length).trim();
      const timeMatch = afterDate.match(/^(\d{1,2})H(\d{1,2})/i);
      let h = 8, m = 0;
      if (timeMatch) {
        h = parseInt(timeMatch[1], 10);
        m = parseInt(timeMatch[2], 10);
      }
      const utcMs = Date.UTC(year, month - 1, day, h + 3, m, 0, 0);
      contractDate = new Date(utcMs).toISOString();
    }
  }

  return { contractDate, notes: text || null };
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
function buildHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function fetchPeople(supabaseUrl, key) {
  const url = `${supabaseUrl}/rest/v1/people?select=id,name,role&active=eq.true`;
  const res = await fetch(url, { headers: buildHeaders(key) });
  if (!res.ok) throw new Error(`Falha ao buscar people: ${res.status}`);
  return await res.json();
}

async function insertInspection(supabaseUrl, key, payload) {
  const url = `${supabaseUrl}/rest/v1/inspections`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(key),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao inserir vistoria: ${res.status} — ${body}`);
  }
  const data = await res.json();
  return data[0];
}

async function insertStatusEvent(supabaseUrl, key, payload) {
  const url = `${supabaseUrl}/rest/v1/inspection_status_events`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...buildHeaders(key), Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`[WARN] Falha ao inserir status event: ${res.status} — ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadLocalEnvFiles();

  const inputArg = process.argv[2];
  if (!inputArg) {
    throw new Error("Uso: node scripts/import-inspections.mjs <arquivo.json> [--dry-run]");
  }

  const dryRun = process.argv.includes("--dry-run");
  const inputPath = path.resolve(process.cwd(), inputArg);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Arquivo nao encontrado: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const rows = JSON.parse(raw);

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("O arquivo deve conter um array JSON com ao menos 1 registro.");
  }

  const supabaseUrl = getSupabaseUrl();
  const key = getSupabaseDataKey();

  // Fetch all people to resolve names → UUIDs
  const people = await fetchPeople(supabaseUrl, key);

  // Build name→id maps (case-insensitive, accent-insensitive)
  function normalizeName(name) {
    return String(name || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  const peopleByName = new Map();
  for (const p of people) {
    peopleByName.set(normalizeName(p.name), p);
  }

  // Find Leonardo (inspector)
  const leonardo = people.find(
    (p) => normalizeName(p.name) === "LEONARDO" && p.role === "inspector",
  );
  if (!leonardo) {
    throw new Error("Vistoriador 'Leonardo' nao encontrado no banco. Verifique o cadastro.");
  }

  console.log(`Vistoriador: ${leonardo.name} (${leonardo.id})`);
  console.log(`Total de registros no JSON: ${rows.length}`);
  console.log(`Modo: ${dryRun ? "DRY-RUN (nada sera inserido)" : "INSERÇÃO REAL"}`);
  console.log("---");

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineLabel = `[${i + 1}/${rows.length}]`;

    // Map type
    const type = mapType(row.tipo);
    if (!type) {
      skipped++;
      continue;
    }

    // Resolve gestor → UUID
    const gestorKey = normalizeName(row.gestor);
    const gestor = peopleByName.get(gestorKey);
    if (!gestor) {
      console.warn(`${lineLabel} Gestor "${row.gestor}" nao encontrado. Pulando.`);
      skipped++;
      continue;
    }

    // Parse date + time
    const dateParts = parseDate(row.data);
    if (!dateParts) {
      console.warn(`${lineLabel} Data invalida: "${row.data}". Pulando.`);
      skipped++;
      continue;
    }
    const timeParts = parseTime(row.hora);
    const createdAt = toUtcIso(dateParts, timeParts);

    // Parse OBS
    const { contractDate, notes } = parseObs(row.obs);

    // Property code and address
    const propertyCode = String(row.imovel || "").trim();
    const propertyAddress = String(row.endereco || "").trim();

    if (!propertyCode || !propertyAddress) {
      console.warn(`${lineLabel} Imovel ou endereco vazio. Pulando.`);
      skipped++;
      continue;
    }

    const payload = {
      property_code: propertyCode,
      property_address: propertyAddress,
      type,
      status: "finalized",
      created_by: gestor.id,
      assigned_to: leonardo.id,
      created_at: createdAt,
      updated_at: createdAt,
      contract_date: contractDate,
      notes,
    };

    if (dryRun) {
      console.log(
        `${lineLabel} OK — ${type} | ${propertyCode} | ${gestor.name} | ${createdAt}${contractDate ? ` | contrato: ${contractDate}` : ""}`,
      );
    } else {
      try {
        const result = await insertInspection(supabaseUrl, key, payload);
        // Insert status event
        await insertStatusEvent(supabaseUrl, key, {
          inspection_id: result.id,
          from_status: null,
          to_status: "finalized",
          changed_at: createdAt,
          changed_by: gestor.id,
        });
        console.log(`${lineLabel} Inserida: ${type} | ${propertyCode} | id=${result.id}`);
      } catch (err) {
        console.error(`${lineLabel} ERRO: ${err.message}`);
        skipped++;
        continue;
      }
    }
    inserted++;
  }

  console.log("---");
  console.log(
    `Concluido. ${dryRun ? "[DRY-RUN] " : ""}Inseridas=${inserted} Puladas=${skipped} Total=${rows.length}`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERRO import-inspections: ${message}`);
  process.exitCode = 1;
});
