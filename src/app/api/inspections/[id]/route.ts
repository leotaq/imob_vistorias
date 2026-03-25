import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import {
  PROPERTY_CITY_OPTIONS,
  composePropertyAddress,
  detectPropertyCityFromAddress,
  normalizePropertyCity,
  normalizePropertyCode,
} from "@/lib/property";

export const runtime = "nodejs";

const InspectionPatchSchema = z
  .object({
    type: z
      .enum(["ocupacao", "desocupacao", "revistoria", "visita", "placa_fotos", "manutencao"])
      .optional(),
    property_code: z.string().optional(),
    property_address: z.string().trim().min(1).optional(),
    property_street: z.string().trim().min(1).optional(),
    property_number: z.string().trim().nullable().optional(),
    property_complement: z.string().trim().nullable().optional(),
    property_neighborhood: z.string().trim().nullable().optional(),
    property_city: z.enum(PROPERTY_CITY_OPTIONS).nullable().optional(),
    contract_date: z.string().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    assigned_to: z.string().uuid().optional(),
    assigned_to_marketing: z.string().uuid().optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para editar.");

type InspectionState = {
  id: string;
  created_by: string;
  assigned_to: string;
  type: "ocupacao" | "desocupacao" | "revistoria" | "visita" | "placa_fotos" | "manutencao";
  property_code: string;
  property_address: string;
  property_street: string | null;
  property_number: string | null;
  property_complement: string | null;
  property_neighborhood: string | null;
  property_city: (typeof PROPERTY_CITY_OPTIONS)[number] | null;
  status:
    | "new"
    | "received"
    | "in_progress"
    | "completed"
    | "finalized"
    | "canceled";
};

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

  const { error } = await sb.from("properties").upsert(
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

  if (error) {
    throw new HttpError(500, "Falha ao atualizar cadastro de imoveis.", error);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    if (actor.role !== "manager" && actor.role !== "attendant") {
      throw new HttpError(403, "Apenas gestora ou atendente pode editar solicitacoes.");
    }

    const { id } = await ctx.params;
    const body = InspectionPatchSchema.parse(await req.json());

    const sb = supabaseAdmin();
    const { data: inspectionData, error: inspectionError } = await sb
      .from("inspections")
      .select(
        [
          "id",
          "created_by",
          "assigned_to",
          "type",
          "status",
          "property_code",
          "property_address",
          "property_street",
          "property_number",
          "property_complement",
          "property_neighborhood",
          "property_city",
        ].join(","),
      )
      .eq("id", id)
      .maybeSingle();

    if (inspectionError) {
      throw new HttpError(500, "Falha ao buscar vistoria.", inspectionError);
    }

    const current = inspectionData as InspectionState | null;
    if (!current) throw new HttpError(404, "Vistoria nao encontrada.");

    if (current.created_by !== actor.id) {
      throw new HttpError(403, "Voce so pode editar solicitacoes criadas por voce.");
    }

    if (current.status === "finalized" || current.status === "canceled") {
      throw new HttpError(400, "Nao e possivel editar solicitacao encerrada.");
    }

    if (
      body.assigned_to
      && body.assigned_to !== current.assigned_to
      && current.status !== "new"
    ) {
      throw new HttpError(
        400,
        "Troca de vistoriador so e permitida enquanto a solicitacao estiver Nova.",
      );
    }

    if (body.assigned_to && body.assigned_to !== current.assigned_to) {
      const { data: personData, error: personError } = await sb
        .from("people")
        .select("id,role,active")
        .eq("id", body.assigned_to)
        .maybeSingle();

      if (personError) {
        throw new HttpError(500, "Falha ao validar vistoriador.", personError);
      }

      if (!personData || personData.role !== "inspector" || !personData.active) {
        throw new HttpError(400, "Vistoriador invalido ou inativo.");
      }
    }

    const patch: {
      type?: "ocupacao" | "desocupacao" | "revistoria" | "visita" | "placa_fotos" | "manutencao";
      property_code?: string;
      property_address?: string;
      property_street?: string;
      property_number?: string | null;
      property_complement?: string | null;
      property_neighborhood?: string | null;
      property_city?: (typeof PROPERTY_CITY_OPTIONS)[number] | null;
      contract_date?: string | null;
      notes?: string | null;
      assigned_to?: string;
      assigned_to_marketing?: string | null;
    } = {};

    if (body.type !== undefined) patch.type = body.type;
    if (body.property_code !== undefined) {
      patch.property_code = normalizePropertyCode(body.property_code);
    }
    if (body.contract_date !== undefined) patch.contract_date = body.contract_date;
    if (body.notes !== undefined) {
      patch.notes = body.notes && body.notes.length > 0 ? body.notes : null;
    }
    if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to;
    if (body.assigned_to_marketing !== undefined) patch.assigned_to_marketing = body.assigned_to_marketing;

    const finalStreet = (
      body.property_street
      ?? body.property_address
      ?? current.property_street
      ?? current.property_address
    ).trim();
    const finalNumber =
      body.property_number !== undefined
        ? body.property_number?.trim() || null
        : current.property_number;
    const finalComplement =
      body.property_complement !== undefined
        ? body.property_complement?.trim() || null
        : current.property_complement;
    const finalNeighborhood =
      body.property_neighborhood !== undefined
        ? body.property_neighborhood?.trim() || null
        : current.property_neighborhood;
    const finalCity =
      body.property_city !== undefined
        ? normalizePropertyCity(body.property_city)
        : normalizePropertyCity(
            current.property_city
            ?? detectPropertyCityFromAddress(current.property_address)
            ?? null,
          );
    const composedAddress = composePropertyAddress({
      street: finalStreet,
      number: finalNumber,
      complement: finalComplement,
      neighborhood: finalNeighborhood,
      city: finalCity,
    });
    const finalAddress = (body.property_address || "").trim() || composedAddress;

    patch.property_street = finalStreet;
    patch.property_number = finalNumber;
    patch.property_complement = finalComplement;
    patch.property_neighborhood = finalNeighborhood;
    patch.property_city = finalCity;
    patch.property_address = finalAddress;

    const finalType = patch.type ?? current.type;
    const finalPropertyCode = patch.property_code ?? current.property_code;
    if (finalType !== "visita" && finalType !== "placa_fotos" && !finalPropertyCode) {
      throw new HttpError(400, "Codigo do imovel e obrigatorio para este tipo de vistoria.");
    }

    const { data, error } = await sb
      .from("inspections")
      .update(patch)
      .eq("id", id)
      .select(
        [
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
          "created_by_person:people!inspections_created_by_fkey(id,name,role,phone)",
          "assigned_to_person:people!inspections_assigned_to_fkey(id,name,role,phone)",
          "assigned_to_marketing_person:people!inspections_assigned_to_marketing_fkey(id,name,role,phone)",
        ].join(","),
      )
      .single();

    if (error) throw new HttpError(500, "Falha ao editar solicitacao.", error);

    await upsertPropertyCatalog(sb, {
      code: finalPropertyCode,
      address: finalAddress,
      street: finalStreet,
      number: finalNumber,
      complement: finalComplement,
      neighborhood: finalNeighborhood,
      city: finalCity,
    });

    return jsonNoStore({ inspection: data });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    if (
      actor.role !== "manager"
      && actor.role !== "attendant"
      && actor.role !== "inspector"
    ) {
      throw new HttpError(
        403,
        "Apenas gestora, atendente ou vistoriador pode excluir solicitacoes.",
      );
    }

    const { id } = await ctx.params;
    const sb = supabaseAdmin();
    const { data: inspectionData, error: inspectionError } = await sb
      .from("inspections")
      .select("id,created_by,assigned_to,status")
      .eq("id", id)
      .maybeSingle();

    if (inspectionError) {
      throw new HttpError(500, "Falha ao buscar vistoria.", inspectionError);
    }

    const current = inspectionData as
      | {
          id: string;
          created_by: string;
          assigned_to: string;
          status:
            | "new"
            | "received"
            | "in_progress"
            | "completed"
            | "awaiting_contract"
            | "finalized"
            | "canceled";
        }
      | null;

    if (!current) throw new HttpError(404, "Vistoria nao encontrada.");

    const canDeleteAsOwner =
      (actor.role === "manager" || actor.role === "attendant")
      && current.created_by === actor.id;
    const canDeleteAsAssignedInspector =
      actor.role === "inspector" && current.assigned_to === actor.id;

    if (!canDeleteAsOwner && !canDeleteAsAssignedInspector) {
      throw new HttpError(
        403,
        "Voce so pode excluir solicitacoes criadas por voce ou atribuidas a voce.",
      );
    }

    if (current.status !== "new" && current.status !== "canceled") {
      throw new HttpError(
        400,
        "Somente solicitacoes Nova ou Cancelada podem ser excluidas.",
      );
    }

    const { error: deleteError } = await sb.from("inspections").delete().eq("id", id);
    if (deleteError) {
      throw new HttpError(500, "Falha ao excluir solicitacao.", deleteError);
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
