import { z } from "zod";

import { requireActor } from "@/lib/actor";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { HttpError } from "@/lib/errors";
import {
  PROPERTY_CITY_OPTIONS,
  detectPropertyCityFromAddress,
  normalizePropertyCity,
  normalizePropertyCode,
} from "@/lib/property";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const LookupQuerySchema = z.object({
  code: z.string().trim().min(1),
});

type PropertyRow = {
  code: string;
  address: string;
  property_street: string | null;
  property_number: string | null;
  property_complement: string | null;
  property_neighborhood: string | null;
  property_city: (typeof PROPERTY_CITY_OPTIONS)[number] | null;
};

type InspectionDefaultsRow = {
  property_address: string | null;
  property_street: string | null;
  property_number: string | null;
  property_complement: string | null;
  property_neighborhood: string | null;
  property_city: (typeof PROPERTY_CITY_OPTIONS)[number] | null;
  contract_date: string | null;
  notes: string | null;
};

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

function isStructuredPropertiesColumnsMissing(error: unknown): boolean {
  return isSchemaCompatibilityError(error, [
    "properties.property_street",
    "properties.property_number",
    "properties.property_complement",
    "properties.property_neighborhood",
    "properties.property_city",
  ]);
}

function isStructuredInspectionsColumnsMissing(error: unknown): boolean {
  return isSchemaCompatibilityError(error, [
    "inspections.property_street",
    "inspections.property_number",
    "inspections.property_complement",
    "inspections.property_neighborhood",
    "inspections.property_city",
  ]);
}

export async function GET(req: Request) {
  try {
    const actor = await requireActor(req);
    if (actor.role !== "manager" && actor.role !== "attendant") {
      throw new HttpError(403, "Apenas gestora ou atendente pode consultar cadastro de imoveis.");
    }

    const url = new URL(req.url);
    const parsed = LookupQuerySchema.safeParse({
      code: url.searchParams.get("code") ?? "",
    });
    if (!parsed.success) {
      throw new HttpError(400, "Codigo do imovel invalido.");
    }

    const normalizedCode = normalizePropertyCode(parsed.data.code);
    const sb = supabaseAdmin();

    const structuredProperty = await sb
      .from("properties")
      .select(
        [
          "code",
          "address",
          "property_street",
          "property_number",
          "property_complement",
          "property_neighborhood",
          "property_city",
        ].join(","),
      )
      .eq("code_normalized", normalizedCode)
      .maybeSingle();

    let propertyData: PropertyRow | null = null;
    if (structuredProperty.error) {
      if (isStructuredPropertiesColumnsMissing(structuredProperty.error)) {
        const legacyProperty = await sb
          .from("properties")
          .select("code,address")
          .eq("code_normalized", normalizedCode)
          .maybeSingle();

        if (legacyProperty.error) {
          throw new HttpError(500, "Falha ao consultar cadastro de imoveis.", legacyProperty.error);
        }

        const property = legacyProperty.data as { code: string; address: string } | null;
        propertyData = property
          ? {
              code: property.code,
              address: property.address,
              property_street: null,
              property_number: null,
              property_complement: null,
              property_neighborhood: null,
              property_city: null,
            }
          : null;
      } else {
        throw new HttpError(500, "Falha ao consultar cadastro de imoveis.", structuredProperty.error);
      }
    } else {
      propertyData = (structuredProperty.data as PropertyRow | null) ?? null;
    }

    let latestInspection: InspectionDefaultsRow | null = null;

    const structuredDefaults = await sb
      .from("inspections")
      .select(
        [
          "property_address",
          "property_street",
          "property_number",
          "property_complement",
          "property_neighborhood",
          "property_city",
          "contract_date",
          "notes",
        ].join(","),
      )
      .eq("property_code", normalizedCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (structuredDefaults.error) {
      if (isStructuredInspectionsColumnsMissing(structuredDefaults.error)) {
        const legacyDefaults = await sb
          .from("inspections")
          .select("property_address,contract_date,notes")
          .eq("property_code", normalizedCode)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (legacyDefaults.error) {
          throw new HttpError(500, "Falha ao consultar historico de vistoria.", legacyDefaults.error);
        }
        const defaults = legacyDefaults.data as {
          property_address: string | null;
          contract_date: string | null;
          notes: string | null;
        } | null;
        latestInspection = defaults
          ? {
              property_address: defaults.property_address,
              property_street: null,
              property_number: null,
              property_complement: null,
              property_neighborhood: null,
              property_city: null,
              contract_date: defaults.contract_date,
              notes: defaults.notes,
            }
          : null;
      } else {
        throw new HttpError(500, "Falha ao consultar historico de vistoria.", structuredDefaults.error);
      }
    } else {
      latestInspection = (structuredDefaults.data as InspectionDefaultsRow | null) ?? null;
    }

    if (!latestInspection) {
      const structuredFallbackDefaults = await sb
        .from("inspections")
        .select(
          [
            "property_address",
            "property_street",
            "property_number",
            "property_complement",
            "property_neighborhood",
            "property_city",
            "contract_date",
            "notes",
          ].join(","),
        )
        .ilike("property_code", normalizedCode)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (structuredFallbackDefaults.error) {
        if (isStructuredInspectionsColumnsMissing(structuredFallbackDefaults.error)) {
          const legacyFallbackDefaults = await sb
            .from("inspections")
            .select("property_address,contract_date,notes")
            .ilike("property_code", normalizedCode)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (legacyFallbackDefaults.error) {
            throw new HttpError(
              500,
              "Falha ao consultar historico de vistoria.",
              legacyFallbackDefaults.error,
            );
          }

          const defaults = legacyFallbackDefaults.data as {
            property_address: string | null;
            contract_date: string | null;
            notes: string | null;
          } | null;
          latestInspection = defaults
            ? {
                property_address: defaults.property_address,
                property_street: null,
                property_number: null,
                property_complement: null,
                property_neighborhood: null,
                property_city: null,
                contract_date: defaults.contract_date,
                notes: defaults.notes,
              }
            : null;
        } else {
          throw new HttpError(
            500,
            "Falha ao consultar historico de vistoria.",
            structuredFallbackDefaults.error,
          );
        }
      } else {
        latestInspection = (structuredFallbackDefaults.data as InspectionDefaultsRow | null) ?? null;
      }
    }

    const property = propertyData as PropertyRow | null;
    const fallbackAddress = latestInspection?.property_address?.trim() || null;
    const city =
      normalizePropertyCity(property?.property_city ?? latestInspection?.property_city ?? null)
      ?? detectPropertyCityFromAddress(property?.address ?? fallbackAddress ?? "");

    return jsonNoStore({
      property:
        property || fallbackAddress
          ? {
              code: property?.code ?? normalizedCode,
              address: property?.address ?? fallbackAddress ?? "",
              street:
                property?.property_street
                ?? latestInspection?.property_street
                ?? property?.address
                ?? fallbackAddress
                ?? "",
              number:
                property?.property_number
                ?? latestInspection?.property_number
                ?? null,
              complement:
                property?.property_complement
                ?? latestInspection?.property_complement
                ?? null,
              neighborhood:
                property?.property_neighborhood
                ?? latestInspection?.property_neighborhood
                ?? null,
              city,
            }
          : null,
      defaults: {
        contract_date: latestInspection?.contract_date ?? null,
        notes: latestInspection?.notes ?? null,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
