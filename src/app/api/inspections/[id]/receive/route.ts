import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import { recordInspectionStatusEvent } from "@/lib/inspectionStatusEvent";
import { validateBusinessSlot, validateCustomSlot } from "@/lib/businessTime";
import { suggestNextStartUtc } from "@/lib/suggest";
import { notifyInspectionScheduled } from "@/lib/whatsapp";
import { getWorkSchedule } from "@/lib/workSchedule";

export const runtime = "nodejs";

const BodySchema = z.object({
  scheduled_start: z.string().datetime(),
  duration_minutes: z
    .number()
    .int()
    .min(15, "A duração mínima é 15 minutos.")
    .max(8 * 60, "A duração máxima é 480 minutos."),
  tz_offset_minutes: z.number().int().min(-720).max(840),
});

type ConflictCheckRow = { id: string };
type InspectionRow = {
  id: string;
  status:
    | "new"
    | "received"
    | "in_progress"
    | "completed"
    | "finalized"
    | "canceled";
  assigned_to: string;
  assigned_to_marketing: string | null;
  scheduled_start: string | null;
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
    | "finalized"
    | "canceled";
  scheduled_start: string | null;
  duration_minutes: number | null;
  received_at: string | null;
  completed_at: string | null;
  created_by: string;
  assigned_to: string;
  created_by_person: InspectionPerson | null;
  assigned_to_person: InspectionPerson | null;
};

type PgErrorLike = { code?: string };

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function getPgCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as PgErrorLike;
  return typeof candidate.code === "string" ? candidate.code : null;
}

async function hasConflict(opts: {
  assignedTo: string;
  startUtc: Date;
  endUtc: Date;
  excludeId: string;
}) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("inspections")
    .select("id")
    .eq("assigned_to", opts.assignedTo)
    .neq("status", "canceled")
    .neq("id", opts.excludeId)
    .not("scheduled_start", "is", null)
    .not("scheduled_end", "is", null)
    .lt("scheduled_start", opts.endUtc.toISOString())
    .gt("scheduled_end", opts.startUtc.toISOString())
    .limit(1);

  if (error) return true;

  const rows = (data || []) as ConflictCheckRow[];
  return rows.length > 0;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    if (actor.role !== "inspector" && actor.role !== "marketing") {
      throw new HttpError(403, "Apenas vistoriador ou marketing pode receber/agendar.");
    }

    const { id } = await ctx.params;
    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      const firstIssue = parsedBody.error.issues[0];
      if (firstIssue?.path?.[0] === "duration_minutes") {
        throw new HttpError(400, firstIssue.message);
      }
      throw new HttpError(400, "Dados inválidos no agendamento.", parsedBody.error.flatten());
    }
    const body = parsedBody.data;

    const sb = supabaseAdmin();
    const { data: inspectionData, error: inspectionErr } = await sb
      .from("inspections")
      .select("id,status,assigned_to,assigned_to_marketing,scheduled_start")
      .eq("id", id)
      .maybeSingle();

    if (inspectionErr) {
      throw new HttpError(500, "Falha ao buscar vistoria.", inspectionErr);
    }

    const inspection = inspectionData as InspectionRow | null;
    if (!inspection) throw new HttpError(404, "Vistoria não encontrada.");
    const isAssigned =
      (actor.role === "inspector" && inspection.assigned_to === actor.id) ||
      (actor.role === "marketing" && inspection.assigned_to_marketing === actor.id);
    if (!isAssigned) {
      throw new HttpError(403, "Vistoria não atribuída a você.");
    }
    if (inspection.status !== "new") {
      throw new HttpError(400, "A vistoria não está no status 'Nova'.");
    }

    const startUtc = new Date(body.scheduled_start);
    const endUtc = addMinutes(startUtc, body.duration_minutes);

    // Try custom work schedule first, fall back to global business hours
    const workSchedule = await getWorkSchedule(actor.id);
    const businessError = validateCustomSlot(startUtc, endUtc, body.tz_offset_minutes, {
      workStartH: workSchedule.work_start, workStartM: workSchedule.work_start_min,
      lunchStartH: workSchedule.lunch_start, lunchStartM: workSchedule.lunch_start_min,
      lunchEndH: workSchedule.lunch_end, lunchEndM: workSchedule.lunch_end_min,
      workEndH: workSchedule.work_end, workEndM: workSchedule.work_end_min,
    }) ?? validateBusinessSlot(startUtc, endUtc, body.tz_offset_minutes);
    if (businessError) throw new HttpError(400, businessError);

    const conflict = await hasConflict({
      assignedTo: actor.id,
      startUtc,
      endUtc,
      excludeId: id,
    });

    if (conflict) {
      const suggested = await suggestNextStartUtc({
        assignedTo: actor.id,
        fromUtc: startUtc,
        durationMinutes: body.duration_minutes,
        tzOffsetMinutes: body.tz_offset_minutes,
      });

      return jsonNoStore(
        {
          message: "Conflito de horário na agenda.",
          suggestedStart: suggested ? suggested.toISOString() : null,
        },
        409,
      );
    }

    const { data, error } = await sb
      .from("inspections")
      .update({
        scheduled_start: startUtc.toISOString(),
        duration_minutes: body.duration_minutes,
        scheduled_end: endUtc.toISOString(),
        status: "received",
        received_at: new Date().toISOString(),
      })
      .eq("id", id)
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
          "created_by_person:people!inspections_created_by_fkey(id,name,role)",
          "assigned_to_person:people!inspections_assigned_to_fkey(id,name,role)",
        ].join(","),
      )
      .single();

    if (error) {
      const code = getPgCode(error);
      if (code === "23P01" || code === "23505") {
        const suggested = await suggestNextStartUtc({
          assignedTo: actor.id,
          fromUtc: startUtc,
          durationMinutes: body.duration_minutes,
          tzOffsetMinutes: body.tz_offset_minutes,
        });

        return jsonNoStore(
          {
            message: "Conflito de horário na agenda.",
            suggestedStart: suggested ? suggested.toISOString() : null,
          },
          409,
        );
      }

      throw new HttpError(500, "Falha ao agendar vistoria.", error);
    }

    const inspectionPayload = data as unknown as InspectionPayload;

    await recordInspectionStatusEvent(sb, {
      inspectionId: id,
      fromStatus: inspection.status,
      toStatus: "received",
      changedBy: actor.id,
      changedAt: inspectionPayload.received_at ?? undefined,
    });

    await notifyInspectionScheduled({
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

    return jsonNoStore({ inspection: data });
  } catch (err) {
    return apiError(err);
  }
}
