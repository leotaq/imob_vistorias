import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type WorkSchedule = {
  work_start: number;       // hour, e.g. 8
  work_start_min: number;   // minute, e.g. 0
  lunch_start: number;      // hour, e.g. 12
  lunch_start_min: number;
  lunch_end: number;        // hour, e.g. 13
  lunch_end_min: number;
  work_end: number;         // hour, e.g. 18
  work_end_min: number;
};

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  work_start: 8,
  work_start_min: 0,
  lunch_start: 12,
  lunch_start_min: 0,
  lunch_end: 13,
  lunch_end_min: 0,
  work_end: 18,
  work_end_min: 0,
};

type WorkScheduleRow = WorkSchedule & { person_id: string };

/**
 * Fetches the work schedule for a person. Falls back to defaults if none found.
 */
export async function getWorkSchedule(personId: string): Promise<WorkSchedule> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("work_schedules")
      .select(
        "work_start,work_start_min,lunch_start,lunch_start_min,lunch_end,lunch_end_min,work_end,work_end_min",
      )
      .eq("person_id", personId)
      .maybeSingle();

    if (error || !data) return { ...DEFAULT_WORK_SCHEDULE };
    const row = data as WorkSchedule;
    return {
      work_start: row.work_start ?? DEFAULT_WORK_SCHEDULE.work_start,
      work_start_min: row.work_start_min ?? DEFAULT_WORK_SCHEDULE.work_start_min,
      lunch_start: row.lunch_start ?? DEFAULT_WORK_SCHEDULE.lunch_start,
      lunch_start_min: row.lunch_start_min ?? DEFAULT_WORK_SCHEDULE.lunch_start_min,
      lunch_end: row.lunch_end ?? DEFAULT_WORK_SCHEDULE.lunch_end,
      lunch_end_min: row.lunch_end_min ?? DEFAULT_WORK_SCHEDULE.lunch_end_min,
      work_end: row.work_end ?? DEFAULT_WORK_SCHEDULE.work_end,
      work_end_min: row.work_end_min ?? DEFAULT_WORK_SCHEDULE.work_end_min,
    };
  } catch {
    return { ...DEFAULT_WORK_SCHEDULE };
  }
}

/**
 * Saves (upsert) a work schedule for a person.
 */
export async function saveWorkSchedule(
  personId: string,
  schedule: WorkSchedule,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("work_schedules").upsert(
    {
      person_id: personId,
      ...schedule,
      updated_at: new Date().toISOString(),
    } as WorkScheduleRow,
    { onConflict: "person_id" },
  );
  if (error) throw new Error("Falha ao salvar horário de trabalho.");
}

/**
 * Given a work schedule and a base date, returns the UTC ranges (morning + afternoon)
 * for that day, according to the inspector's custom hours and lunch break.
 *
 * Example for schedule 08:00-12:00 + 13:00-18:00:
 *   → morning:   08:00–12:00
 *   → afternoon: 13:00–18:00
 */
export function getWorkBoundsLocal(
  schedule: WorkSchedule,
  baseDate: Date, // local date (year/month/date only matter)
): { morning: { start: Date; end: Date }; afternoon: { start: Date; end: Date } } {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const d = baseDate.getDate();

  const morningStart = new Date(y, m, d, schedule.work_start, schedule.work_start_min, 0, 0);
  const morningEnd = new Date(y, m, d, schedule.lunch_start, schedule.lunch_start_min, 0, 0);
  const afternoonStart = new Date(y, m, d, schedule.lunch_end, schedule.lunch_end_min, 0, 0);
  const afternoonEnd = new Date(y, m, d, schedule.work_end, schedule.work_end_min, 0, 0);

  return {
    morning: { start: morningStart, end: morningEnd },
    afternoon: { start: afternoonStart, end: afternoonEnd },
  };
}
