import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import {
  notifyInspectionAssignedToInspector,
  notifyInspectionAssignedToMarketing,
  notifyInspectionCompleted,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

const BodySchema = z.object({
  event: z.enum(["assigned", "assigned_marketing", "completed"]),
});

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
    | "finalized"
    | "canceled";
  scheduled_start: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  created_by: string;
  assigned_to: string;
  assigned_to_marketing: string | null;
  created_by_person: InspectionPerson | null;
  assigned_to_person: InspectionPerson | null;
  assigned_to_marketing_person: InspectionPerson | null;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    const body = BodySchema.parse(await req.json());
    const { id } = await ctx.params;

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("inspections")
      .select(
        [
          "id",
          "type",
          "status",
          "property_code",
          "property_address",
          "scheduled_start",
          "duration_minutes",
          "completed_at",
          "created_by",
          "assigned_to",
          "assigned_to_marketing",
          "created_by_person:people!inspections_created_by_fkey(id,name,role)",
          "assigned_to_person:people!inspections_assigned_to_fkey(id,name,role)",
          "assigned_to_marketing_person:people!inspections_assigned_to_marketing_fkey(id,name,role)",
        ].join(","),
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw new HttpError(500, "Falha ao buscar vistoria.", error);

    const inspection = data as unknown as InspectionPayload | null;
    if (!inspection) throw new HttpError(404, "Vistoria não encontrada.");

    if (body.event === "assigned") {
      if (actor.role !== "manager" && actor.role !== "attendant") {
        throw new HttpError(403, "Apenas gestora ou atendente pode notificar o vistoriador.");
      }
      if (inspection.created_by !== actor.id) {
        throw new HttpError(403, "Você só pode notificar solicitações criadas por você.");
      }
      if (inspection.status === "canceled") {
        throw new HttpError(400, "Não é possível notificar solicitação cancelada.");
      }

      const result = await notifyInspectionAssignedToInspector({
        id: inspection.id,
        type: inspection.type,
        property_code: inspection.property_code,
        property_address: inspection.property_address,
        scheduled_start: inspection.scheduled_start,
        duration_minutes: inspection.duration_minutes,
        completed_at: inspection.completed_at,
        created_by: inspection.created_by,
        assigned_to: inspection.assigned_to,
        created_by_person_name: inspection.created_by_person?.name ?? null,
        assigned_to_person_name: inspection.assigned_to_person?.name ?? null,
      });

      return jsonNoStore({
        ok: true,
        message: "Notificação enviada ao vistoriador.",
        result,
      });
    }

    if (body.event === "assigned_marketing") {
      if (actor.role !== "manager" && actor.role !== "attendant") {
        throw new HttpError(403, "Apenas gestora ou atendente pode notificar o marketing.");
      }
      if (inspection.created_by !== actor.id) {
        throw new HttpError(403, "Você só pode notificar solicitações criadas por você.");
      }
      if (inspection.status === "canceled") {
        throw new HttpError(400, "Não é possível notificar solicitação cancelada.");
      }
      if (!inspection.assigned_to_marketing) {
        throw new HttpError(400, "Nenhum marketing atribuído a esta vistoria.");
      }

      const result = await notifyInspectionAssignedToMarketing({
        id: inspection.id,
        type: inspection.type,
        property_code: inspection.property_code,
        property_address: inspection.property_address,
        scheduled_start: inspection.scheduled_start,
        duration_minutes: inspection.duration_minutes,
        completed_at: inspection.completed_at,
        created_by: inspection.created_by,
        assigned_to: inspection.assigned_to,
        assigned_to_marketing: inspection.assigned_to_marketing,
        created_by_person_name: inspection.created_by_person?.name ?? null,
        assigned_to_person_name: inspection.assigned_to_person?.name ?? null,
        assigned_to_marketing_person_name: inspection.assigned_to_marketing_person?.name ?? null,
      });

      return jsonNoStore({
        ok: true,
        message: "Notificação enviada ao marketing.",
        result,
      });
    }

    if (actor.role !== "inspector") {
      throw new HttpError(403, "Apenas vistoriador pode notificar conclusão.");
    }
    if (inspection.assigned_to !== actor.id) {
      throw new HttpError(403, "Vistoria não atribuída a você.");
    }
    if (inspection.status !== "completed" && inspection.status !== "finalized") {
      throw new HttpError(
        400,
        "A notificação de conclusão exige vistoria Concluída ou Finalizada.",
      );
    }

    const result = await notifyInspectionCompleted({
      id: inspection.id,
      type: inspection.type,
      property_code: inspection.property_code,
      property_address: inspection.property_address,
      scheduled_start: inspection.scheduled_start,
      duration_minutes: inspection.duration_minutes,
      completed_at: inspection.completed_at,
      created_by: inspection.created_by,
      assigned_to: inspection.assigned_to,
      created_by_person_name: inspection.created_by_person?.name ?? null,
      assigned_to_person_name: inspection.assigned_to_person?.name ?? null,
    });

    return jsonNoStore({
      ok: true,
      message: "Notificação de conclusão enviada.",
      result,
    });
  } catch (err) {
    return apiError(err);
  }
}
