import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import { validateBusinessSlot, validateCustomSlot } from "@/lib/businessTime";
import { suggestNextStartUtc } from "@/lib/suggest";
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
      throw new HttpError(403, "Apenas vistoriador pode reagendar.");
    }

    const { id } = await ctx.params;
    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      const firstIssue = parsedBody.error.issues[0];
      if (firstIssue?.path?.[0] === "duration_minutes") {
        throw new HttpError(400, firstIssue.message);
      }
      throw new HttpError(400, "Dados inválidos no reagendamento.", parsedBody.error.flatten());
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
    if (inspection.status !== "received" && inspection.status !== "in_progress") {
      throw new HttpError(
        400,
        "Apenas vistorias Recebidas ou Em andamento podem ser reagendadas.",
      );
    }

    const startUtc = new Date(body.scheduled_start);
    const endUtc = addMinutes(startUtc, body.duration_minutes);

    // Use custom work schedule if available
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
        // status is intentionally NOT changed — keeps received or in_progress
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

      throw new HttpError(500, "Falha ao reagendar vistoria.", error);
    }

    return jsonNoStore({ inspection: data });
  } catch (err) {
    return apiError(err);
  }
}
