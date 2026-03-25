import { z } from "zod";

import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireAdminPin } from "@/lib/adminPin";
import { HttpError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getWorkSchedule,
  saveWorkSchedule,
  type WorkSchedule,
} from "@/lib/workSchedule";

export const runtime = "nodejs";

const WorkSchedulePatchSchema = z.object({
  work_start: z.number().int().min(0).max(23),
  work_start_min: z.number().int().min(0).max(59),
  lunch_start: z.number().int().min(0).max(23),
  lunch_start_min: z.number().int().min(0).max(59),
  lunch_end: z.number().int().min(0).max(23),
  lunch_end_min: z.number().int().min(0).max(59),
  work_end: z.number().int().min(0).max(23),
  work_end_min: z.number().int().min(0).max(59),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;

    // Validate person exists and is inspector
    const sb = supabaseAdmin();
    const { data: personData } = await sb
      .from("people")
      .select("id,role")
      .eq("id", id)
      .maybeSingle();

    if (!personData) throw new HttpError(404, "Pessoa não encontrada.");

    const schedule = await getWorkSchedule(id);
    return jsonNoStore({ schedule });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    requireAdminPin(req);
    const { id } = await ctx.params;

    // Validate person exists
    const sb = supabaseAdmin();
    const { data: personData } = await sb
      .from("people")
      .select("id,role")
      .eq("id", id)
      .maybeSingle();

    if (!personData) throw new HttpError(404, "Pessoa não encontrada.");
    if (personData.role !== "inspector") {
      throw new HttpError(400, "Horário de trabalho só pode ser definido para vistoriadores.");
    }

    const body = WorkSchedulePatchSchema.parse(await req.json()) as WorkSchedule;

    // Basic sanity checks
    const startMinutes = body.work_start * 60 + body.work_start_min;
    const lunchStartMinutes = body.lunch_start * 60 + body.lunch_start_min;
    const lunchEndMinutes = body.lunch_end * 60 + body.lunch_end_min;
    const endMinutes = body.work_end * 60 + body.work_end_min;

    if (lunchStartMinutes <= startMinutes)
      throw new HttpError(400, "Almoço deve começar após a entrada.");
    if (lunchEndMinutes <= lunchStartMinutes)
      throw new HttpError(400, "Fim do almoço deve ser após o início.");
    if (endMinutes <= lunchEndMinutes)
      throw new HttpError(400, "Saída deve ser após o fim do almoço.");

    await saveWorkSchedule(id, body);
    return jsonNoStore({ schedule: body });
  } catch (err) {
    return apiError(err);
  }
}
