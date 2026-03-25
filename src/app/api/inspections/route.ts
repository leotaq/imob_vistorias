import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { getActor, requireActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import { recordInspectionStatusEvent } from "@/lib/inspectionStatusEvent";
import {
  PROPERTY_CITY_OPTIONS,
  composePropertyAddress,
  detectPropertyCityFromAddress,
  normalizePropertyCity,
  normalizePropertyCode,
} from "@/lib/property";

export const runtime = "nodejs";

const StatusEnum = z.enum([
  "new",
  "received",
  "in_progress",
  "completed",
  "finalized",
  "canceled",
]);

type PgErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function getPgCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const pg = error as PgErrorLike;
  return typeof pg.code === "string" ? pg.code : null;
}

function isSchemaCompatibilityError(error: unknown, markers: string[] = []): boolean {
  const code = getPgCode(error);
  if (code === "42703" || code === "42P01" || code === "PGRST204") return true;

  if (!error || typeof error !== "object") return false;
  const pg = error as PgErrorLike;
  const text = [pg.message, pg.details, pg.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (!text) return false;

  if (markers.length === 0) {
    return text.includes("does not exist") || text.includes("schema cache");
  }

  return markers.some((marker) => text.includes(marker.toLowerCase()));
}

function isStructuredInspectionColumnsMissing(error: unknown): boolean {
  return isSchemaCompatibilityError(error, [
    "property_street",
    "property_number",
    "property_complement",
    "property_neighborhood",
    "property_city",
  ]);
}

function isStructuredPropertiesColumnsMissing(error: unknown): boolean {
  return isSchemaCompatibilityError(error, [
    "properties.property_street",
    "properties.property_number",
    "properties.property_complement",
    "properties.property_neighborhood",
    "properties.property_city",
  ]);
}

function isPeoplePhoneColumnMissing(error: unknown): boolean {
  return isSchemaCompatibilityError(error, ["people.phone"]);
}

async function upsertPropertyCatalog(
  sb: ReturnType<typeof supabaseAdmin>,
  input: {
    code: string;
    address: string;
    street: string;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: (typeof PROPERTY_CITY_OPTIONS)[number] | null;
  },
) {
  const normalizedCode = normalizePropertyCode(input.code);
  const trimmedAddress = input.address.trim();
  if (!normalizedCode || !trimmedAddress) return;

  const structuredUpsert = await sb.from("properties").upsert(
    {
      code: normalizedCode,
      code_normalized: normalizedCode,
      address: trimmedAddress,
      property_street: input.street,
      property_number: input.number,
      property_complement: input.complement,
      property_neighborhood: input.neighborhood,
      property_city: input.city,
    },
    { onConflict: "code_normalized" },
  );

  if (!structuredUpsert.error) return;

  if (isStructuredPropertiesColumnsMissing(structuredUpsert.error)) {
    const legacyUpsert = await sb.from("properties").upsert(
      {
        code: normalizedCode,
        code_normalized: normalizedCode,
        address: trimmedAddress,
      },
      { onConflict: "code_normalized" },
    );
    if (!legacyUpsert.error) return;

    throw new HttpError(500, "Falha ao atualizar cadastro de imoveis.", legacyUpsert.error);
  }

  throw new HttpError(500, "Falha ao atualizar cadastro de imoveis.", structuredUpsert.error);
}

export async function GET(req: Request) {
  try {
    const actor = await getActor(req);
    const url = new URL(req.url);
    const assignedToParam = url.searchParams.get("assignedTo");
    const createdByParam = url.searchParams.get("createdBy");
    const statusParam = url.searchParams.get("status"); // comma-separated
    const monthParam = url.searchParams.get("month");
    const yearParam = url.searchParams.get("year");

    const sb = supabaseAdmin();
    const selectStructuredFields = [
      "id",
      "created_at",
      "type",
      "status",
      "property_code",
      "property_address",
      "property_street",
      "property_number",
      "property_complement",
      "property_neighborhood",
      "property_city",
      "contract_date",
      "notes",
      "scheduled_start",
      "duration_minutes",
      "scheduled_end",
      "received_at",
      "completed_at",
      "created_by",
      "assigned_to",
      "assigned_to_marketing",
    ].join(",");

    const selectLegacyFields = [
      "id",
      "created_at",
      "type",
      "status",
      "property_code",
      "property_address",
      "contract_date",
      "notes",
      "scheduled_start",
      "duration_minutes",
      "scheduled_end",
      "received_at",
      "completed_at",
      "created_by",
      "assigned_to",
      "assigned_to_marketing",
    ].join(",");

    const peopleWithPhone = [
      "created_by_person:people!inspections_created_by_fkey(id,name,role,phone)",
      "assigned_to_person:people!inspections_assigned_to_fkey(id,name,role,phone)",
      "assigned_to_marketing_person:people!inspections_assigned_to_marketing_fkey(id,name,role,phone)",
    ].join(",");

    const peopleWithoutPhone = [
      "created_by_person:people!inspections_created_by_fkey(id,name,role)",
      "assigned_to_person:people!inspections_assigned_to_fkey(id,name,role)",
      "assigned_to_marketing_person:people!inspections_assigned_to_marketing_fkey(id,name,role)",
    ].join(",");

    const buildQuery = (selectClause: string) => {
      let query = sb.from("inspections").select(selectClause);

      if (actor?.role === "inspector") {
        query = query.eq("assigned_to", actor.id);
      } else if (actor?.role === "marketing") {
        query = query.eq("assigned_to_marketing", actor.id);
      } else if (assignedToParam) {
        query = query.eq("assigned_to", assignedToParam);
      }

      if (createdByParam) {
        const parsedCreatedBy = z.string().uuid().safeParse(createdByParam);
        if (parsedCreatedBy.success) {
          query = query.eq("created_by", parsedCreatedBy.data);
        }
      }

      if (statusParam) {
        const statuses = statusParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const parsed = z.array(StatusEnum).safeParse(statuses);
        if (parsed.success && parsed.data.length > 0) {
          query = query.in("status", parsed.data);
        }
      }

      if (monthParam && yearParam) {
        const m = parseInt(monthParam, 10);
        const y = parseInt(yearParam, 10);
        if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
          const startStr = `${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`;
          // Create the first day of next month
          const nextMonthDate = new Date(y, m, 1);
          const nextM = nextMonthDate.getMonth() + 1; // 1-12
          const nextY = nextMonthDate.getFullYear();
          const endStr = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00.000Z`;

          // OR conditions:
          // 1. Has scheduled_start in the selected month
          // 2. Has no schedule but was created in the selected month
          // 3. Is still open (not completed/finalized/canceled) from any previous month (rollover)
          // 4. Is completed — always shown so inspector can see and revert them
          // 5. Is finalized — always shown so inspector can see their history
          query = query.or(
            `and(scheduled_start.gte.${startStr},scheduled_start.lt.${endStr}),` +
            `and(scheduled_start.is.null,created_at.gte.${startStr},created_at.lt.${endStr}),` +
            `and(status.neq.completed,status.neq.finalized,status.neq.canceled),` +
            `status.eq.completed,` +
            `status.eq.finalized`
          );
        }
      }

      return query
        .order("scheduled_start", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: false });
    };

    const normalizeInspectionRows = (rows: unknown[]) =>
      rows.map((row) => {
        const record = row as Record<string, unknown>;
        return {
          ...record,
          property_street:
            (record.property_street as string | null | undefined)
            ?? (record.property_address as string | null | undefined)
            ?? null,
          property_number: (record.property_number as string | null | undefined) ?? null,
          property_complement:
            (record.property_complement as string | null | undefined) ?? null,
          property_neighborhood:
            (record.property_neighborhood as string | null | undefined) ?? null,
          property_city: (record.property_city as string | null | undefined) ?? null,
        };
      });

    let rows: unknown[] = [];
    let queryError: unknown = null;

    const structuredWithPhone = await buildQuery(
      `${selectStructuredFields},${peopleWithPhone}`,
    );
    if (!structuredWithPhone.error) {
      rows = structuredWithPhone.data ?? [];
    } else if (isStructuredInspectionColumnsMissing(structuredWithPhone.error)) {
      const legacyWithPhone = await buildQuery(`${selectLegacyFields},${peopleWithPhone}`);
      if (!legacyWithPhone.error) {
        rows = legacyWithPhone.data ?? [];
      } else if (isPeoplePhoneColumnMissing(legacyWithPhone.error)) {
        const legacyWithoutPhone = await buildQuery(`${selectLegacyFields},${peopleWithoutPhone}`);
        if (legacyWithoutPhone.error) {
          queryError = legacyWithoutPhone.error;
        } else {
          rows = legacyWithoutPhone.data ?? [];
        }
      } else {
        queryError = legacyWithPhone.error;
      }
    } else if (isPeoplePhoneColumnMissing(structuredWithPhone.error)) {
      const structuredWithoutPhone = await buildQuery(
        `${selectStructuredFields},${peopleWithoutPhone}`,
      );
      if (!structuredWithoutPhone.error) {
        rows = structuredWithoutPhone.data ?? [];
      } else if (isStructuredInspectionColumnsMissing(structuredWithoutPhone.error)) {
        const legacyWithoutPhone = await buildQuery(`${selectLegacyFields},${peopleWithoutPhone}`);
        if (legacyWithoutPhone.error) {
          queryError = legacyWithoutPhone.error;
        } else {
          rows = legacyWithoutPhone.data ?? [];
        }
      } else {
        queryError = structuredWithoutPhone.error;
      }
    } else {
      queryError = structuredWithPhone.error;
    }

    if (queryError) {
      throw new HttpError(500, "Falha ao listar vistorias.", queryError);
    }

    return jsonNoStore({ inspections: normalizeInspectionRows(rows) });
  } catch (err) {
    return apiError(err);
  }
}

const InspectionCreateSchema = z
  .object({
    type: z.enum(["ocupacao", "desocupacao", "revistoria", "visita", "placa_fotos", "manutencao"]),
    property_code: z.string().optional(),
    property_address: z.string().trim().min(1),
    property_street: z.string().trim().min(1).optional(),
    property_number: z.string().trim().nullable().optional(),
    property_complement: z.string().trim().nullable().optional(),
    property_neighborhood: z.string().trim().nullable().optional(),
    property_city: z.enum(PROPERTY_CITY_OPTIONS).optional().nullable(),
    contract_date: z.string().nullable().optional(),
    notes: z.string().trim().optional(),
    assigned_to: z.string().uuid(),
    assigned_to_marketing: z.string().uuid().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const normalizedCode = normalizePropertyCode(value.property_code ?? "");
    if (value.type !== "visita" && value.type !== "placa_fotos" && !normalizedCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["property_code"],
        message: "Código do imóvel é obrigatório para este tipo de vistoria.",
      });
    }
    if (value.type === "placa_fotos" && !value.assigned_to_marketing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assigned_to_marketing"],
        message: "Marketing é obrigatório para Placa/Fotos.",
      });
    }
  });

export async function POST(req: Request) {
  try {
    const actor = await requireActor(req);
    if (actor.role !== "manager" && actor.role !== "attendant") {
      throw new HttpError(403, "Apenas gestora ou atendente pode criar vistorias.");
    }

    const body = InspectionCreateSchema.parse(await req.json());
    const normalizedPropertyCode = normalizePropertyCode(body.property_code ?? "");
    const propertyStreet = (body.property_street || body.property_address).trim();
    const propertyNumber = body.property_number?.trim() || null;
    const propertyComplement = body.property_complement?.trim() || null;
    const propertyNeighborhood = body.property_neighborhood?.trim() || null;
    const propertyCity = normalizePropertyCity(
      body.property_city
      ?? detectPropertyCityFromAddress(body.property_address)
      ?? null,
    );
    const propertyAddress = composePropertyAddress({
      street: propertyStreet,
      number: propertyNumber,
      complement: propertyComplement,
      neighborhood: propertyNeighborhood,
      city: propertyCity,
    });

    const sb = supabaseAdmin();

    const insertPayloadBase: Record<string, unknown> = {
      created_by: actor.id,
      assigned_to: body.assigned_to,
      type: body.type,
      status: "new" as const,
      property_code: normalizedPropertyCode,
      property_address: propertyAddress,
      contract_date: body.contract_date ?? null,
      notes: body.notes ?? null,
    };
    if (body.assigned_to_marketing) {
      insertPayloadBase.assigned_to_marketing = body.assigned_to_marketing;
    }

    const insertPayloadStructured: Record<string, unknown> = {
      ...insertPayloadBase,
      property_street: propertyStreet,
      property_number: propertyNumber,
      property_complement: propertyComplement,
      property_neighborhood: propertyNeighborhood,
      property_city: propertyCity,
    };

    const insertStructuredResult = await sb
      .from("inspections")
      .insert(insertPayloadStructured)
      .select("id,created_at")
      .single();

    let createdInspection: { id: string; created_at: string } | null = null;
    if (!insertStructuredResult.error) {
      createdInspection = insertStructuredResult.data as unknown as {
        id: string;
        created_at: string;
      };
    } else if (isStructuredInspectionColumnsMissing(insertStructuredResult.error)) {
      const insertLegacyResult = await sb
        .from("inspections")
        .insert(insertPayloadBase)
        .select("id,created_at")
        .single();
      if (insertLegacyResult.error) {
        throw new HttpError(500, "Falha ao criar vistoria.", insertLegacyResult.error);
      }
      createdInspection = insertLegacyResult.data as unknown as {
        id: string;
        created_at: string;
      };
    } else {
      throw new HttpError(500, "Falha ao criar vistoria.", insertStructuredResult.error);
    }

    if (!createdInspection) {
      throw new HttpError(500, "Falha ao criar vistoria.");
    }

    await upsertPropertyCatalog(sb, {
      code: normalizedPropertyCode,
      address: propertyAddress,
      street: propertyStreet,
      number: propertyNumber,
      complement: propertyComplement,
      neighborhood: propertyNeighborhood,
      city: propertyCity,
    });

    const createdInspectionResult = await sb
      .from("inspections")
      .select(
        [
          "id",
          "created_at",
          "type",
          "status",
          "property_code",
          "property_address",
          "contract_date",
          "notes",
          "scheduled_start",
          "duration_minutes",
          "scheduled_end",
          "received_at",
          "completed_at",
          "created_by",
          "assigned_to",
          "assigned_to_marketing",
          "created_by_person:people!inspections_created_by_fkey(id,name,role)",
          "assigned_to_person:people!inspections_assigned_to_fkey(id,name,role)",
          "assigned_to_marketing_person:people!inspections_assigned_to_marketing_fkey(id,name,role)",
        ].join(","),
      )
      .eq("id", createdInspection.id)
      .single();

    if (createdInspectionResult.error) {
      throw new HttpError(500, "Falha ao carregar vistoria criada.", createdInspectionResult.error);
    }

    const createdInspectionData = createdInspectionResult.data as unknown as Record<string, unknown>;
    const data = {
      ...createdInspectionData,
      property_street: propertyStreet,
      property_number: propertyNumber,
      property_complement: propertyComplement,
      property_neighborhood: propertyNeighborhood,
      property_city: propertyCity,
    };

    await recordInspectionStatusEvent(sb, {
      inspectionId: createdInspection.id,
      fromStatus: null,
      toStatus: "new",
      changedBy: actor.id,
      changedAt: createdInspection.created_at,
    });

    return jsonNoStore({ inspection: data }, 201);
  } catch (err) {
    return apiError(err);
  }
}
