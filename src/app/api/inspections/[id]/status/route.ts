import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import { recordInspectionStatusEvent } from "@/lib/inspectionStatusEvent";
import { notifyInspectionCompleted } from "@/lib/whatsapp";

export const runtime = "nodejs";

const BodySchema = z.object({
  status: z.enum(["new", "received", "in_progress", "completed", "awaiting_contract", "finalized", "canceled"]),
});

type InspectionRow = {
  id: string;
  status:
  | "new"
  | "received"
  | "in_progress"
  | "completed"
  | "awaiting_contract"
  | "finalized"
  | "canceled";
  assigned_to: string;
  assigned_to_marketing: string | null;
};

type StatusPatch = {
  status: "new" | "received" | "in_progress" | "completed" | "awaiting_contract" | "finalized" | "canceled";
  received_at?: string | null;
  completed_at?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  duration_minutes?: number | null;
};

type InspectionPerson = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
};

type InspectionPayload = {
  id: string;
  type: "ocupacao" | "desocupacao" | "revistoria" | "visita" | "placa_fotos" | "manutencao";
  property_code: string;
  property_address: string;
  status:
  | "new"
  | "received"
  | "in_progress"
  | "completed"
  | "awaiting_contract"
  | "finalized"
  | "canceled";
  scheduled_start: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  created_by: string;
  assigned_to: string;
  created_by_person: InspectionPerson | null;
  assigned_to_person: InspectionPerson | null;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    const { id } = await ctx.params;
    const body = BodySchema.parse(await req.json());

    const sb = supabaseAdmin();
    const { data: inspectionData, error: inspectionErr } = await sb
      .from("inspections")
      .select("id,status,assigned_to,assigned_to_marketing")
      .eq("id", id)
      .maybeSingle();

    if (inspectionErr) {
      throw new HttpError(500, "Falha ao buscar vistoria.", inspectionErr);
    }

    const inspection = inspectionData as InspectionRow | null;
    if (!inspection) throw new HttpError(404, "Vistoria não encontrada.");

    const isManagerOrAttendant = actor.role === "manager" || actor.role === "attendant";
    const isFieldWorker = actor.role === "inspector" || actor.role === "marketing";
    const isAssignedFieldWorker =
      (actor.role === "inspector" && inspection.assigned_to === actor.id) ||
      (actor.role === "marketing" && inspection.assigned_to_marketing === actor.id);

    if (body.status === "canceled") {
      if (!isManagerOrAttendant) {
        throw new HttpError(403, "Apenas gestora ou atendente pode cancelar.");
      }
      if (
        inspection.status === "completed"
        || inspection.status === "awaiting_contract"
        || inspection.status === "finalized"
      ) {
        throw new HttpError(400, "Não pode cancelar vistoria concluída/finalizada.");
      }
    } else if (body.status === "awaiting_contract") {
      if (isManagerOrAttendant) {
        if (inspection.status !== "in_progress") {
          throw new HttpError(400, "Só pode mover para Sem Contrato a partir de Em andamento.");
        }
      } else if (isFieldWorker) {
        if (!isAssignedFieldWorker) {
          throw new HttpError(403, "Vistoria não atribuída a você.");
        }
        if (inspection.status !== "in_progress") {
          throw new HttpError(400, "Só pode mover para Sem Contrato a partir de Em andamento.");
        }
      } else {
        throw new HttpError(403, "Sem permissão para mover para Sem Contrato.");
      }
    } else if (
      body.status === "completed"
      && inspection.status === "awaiting_contract"
    ) {
      // Contrato Recebido: apenas o inspector/marketing responsável
      if (!isFieldWorker) {
        throw new HttpError(403, "Apenas vistoriador ou marketing pode registrar contrato recebido.");
      }
      if (!isAssignedFieldWorker) {
        throw new HttpError(403, "Vistoria não atribuída a você.");
      }
    } else if (
      body.status === "in_progress"
      && inspection.status === "awaiting_contract"
    ) {
      // Voltar p/ andamento de Sem Contrato: apenas o inspector/marketing responsável
      if (!isFieldWorker) {
        throw new HttpError(403, "Apenas vistoriador ou marketing pode voltar para Em andamento.");
      }
      if (!isAssignedFieldWorker) {
        throw new HttpError(403, "Vistoria não atribuída a você.");
      }
    } else if (body.status === "new") {
      // Devolver para Nova: inspector/marketing atribuído OU gestora/atendente
      if (isFieldWorker) {
        if (!isAssignedFieldWorker) {
          throw new HttpError(403, "Vistoria não atribuída a você.");
        }
      } else if (!isManagerOrAttendant) {
        throw new HttpError(403, "Sem permissão para devolver para Nova.");
      }
      if (inspection.status !== "received" && inspection.status !== "in_progress") {
        throw new HttpError(400, "Só pode devolver para Nova a partir de Recebida ou Em andamento.");
      }
    } else {
      if (!isFieldWorker) {
        throw new HttpError(403, "Apenas vistoriador ou marketing pode alterar este status.");
      }
      if (!isAssignedFieldWorker) {
        throw new HttpError(403, "Vistoria não atribuída a você.");
      }
      if (body.status === "received") {
        if (inspection.status !== "in_progress" && inspection.status !== "completed") {
          throw new HttpError(400, "Só pode voltar para Recebida a partir de Em andamento ou Concluída.");
        }
      }
      if (body.status === "in_progress") {
        if (inspection.status !== "received" && inspection.status !== "completed" && inspection.status !== "awaiting_contract") {
          throw new HttpError(400, "Só pode iniciar/voltar para Em andamento a partir de Recebida, Concluída ou Sem Contrato.");
        }
      }
      if (body.status === "completed" && inspection.status !== "in_progress") {
        throw new HttpError(400, "Só pode concluir uma vistoria Em andamento.");
      }
      if (body.status === "finalized") {
        if (
          inspection.status !== "new"
          && inspection.status !== "received"
          && inspection.status !== "in_progress"
          && inspection.status !== "completed"
        ) {
          throw new HttpError(
            400,
            "Só pode finalizar uma vistoria Nova, Recebida, Em andamento ou Concluída.",
          );
        }
      }
    }

    const patch: StatusPatch = { status: body.status };
    if (body.status === "new") {
      patch.scheduled_start = null;
      patch.scheduled_end = null;
      patch.duration_minutes = null;
      patch.received_at = null;
      patch.completed_at = null;
    }
    if (body.status === "received" || body.status === "in_progress") {
      patch.completed_at = null;
    }
    if (body.status === "completed") {
      patch.completed_at = new Date().toISOString();
    }
    if (body.status === "finalized") {
      const nowIso = new Date().toISOString();
      if (inspection.status === "new") {
        patch.received_at = nowIso;
      }
      if (inspection.status !== "completed" && inspection.status !== "awaiting_contract") {
        patch.completed_at = nowIso;
      }
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
          "scheduled_start",
          "duration_minutes",
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
      .single();

    if (error) throw new HttpError(500, "Falha ao atualizar status.", error);

    await recordInspectionStatusEvent(sb, {
      inspectionId: id,
      fromStatus: inspection.status,
      toStatus: body.status,
      changedBy: actor.id,
    });

    if (body.status === "completed" || body.status === "finalized") {
      const inspectionPayload = data as unknown as InspectionPayload;
      await notifyInspectionCompleted({
        id: inspectionPayload.id,
        type: inspectionPayload.type,
        property_code: inspectionPayload.property_code,
        property_address: inspectionPayload.property_address,
        scheduled_start: inspectionPayload.scheduled_start,
        duration_minutes: inspectionPayload.duration_minutes,
        completed_at: inspectionPayload.completed_at,
        created_by: inspectionPayload.created_by,
        assigned_to: inspectionPayload.assigned_to,
        created_by_person_name: inspectionPayload.created_by_person?.name ?? null,
        assigned_to_person_name:
          inspectionPayload.assigned_to_person?.name ?? null,
      });
    }

    return jsonNoStore({ inspection: data });
  } catch (err) {
    return apiError(err);
  }
}
