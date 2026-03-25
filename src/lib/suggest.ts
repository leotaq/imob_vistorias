import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isBusinessDay,
  isSaturday,
  roundUpToStepUtc,
  STEP_MINUTES,
  SATURDAY_START_HOUR,
  SATURDAY_END_HOUR,
} from "@/lib/businessTime";
import { getWorkSchedule } from "@/lib/workSchedule";

type TimeRange = { startUtc: Date; endUtc: Date };

function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startUtc < b.endUtc && a.endUtc > b.startUtc;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60_000 * 60_000);
}

/** Build a UTC timestamp from a local date + hour + minute using the tz offset. */
function localHmToUtc(
  baseLocalDate: Date,
  h: number,
  m: number,
  tzOffsetMinutes: number,
): Date {
  const localMs = Date.UTC(
    baseLocalDate.getFullYear(),
    baseLocalDate.getMonth(),
    baseLocalDate.getDate(),
    h,
    m,
    0,
    0,
  );
  return new Date(localMs + tzOffsetMinutes * 60_000);
}

export async function suggestNextStartUtc(opts: {
  assignedTo: string;
  fromUtc: Date;
  durationMinutes: number;
  tzOffsetMinutes: number;
  maxDays?: number;
}): Promise<Date | null> {
  const {
    assignedTo,
    fromUtc,
    durationMinutes,
    tzOffsetMinutes,
    maxDays = 14,
  } = opts;

  const schedule = await getWorkSchedule(assignedTo);
  const searchStartUtc = roundUpToStepUtc(fromUtc, tzOffsetMinutes);

  // Fetch busy slots for the whole search window
  const windowEndUtc = addDays(searchStartUtc, maxDays + 7);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("inspections")
    .select("scheduled_start,scheduled_end,status")
    .eq("assigned_to", assignedTo)
    .neq("status", "canceled")
    .not("scheduled_start", "is", null)
    .not("scheduled_end", "is", null)
    .lt("scheduled_start", windowEndUtc.toISOString())
    .gt("scheduled_end", searchStartUtc.toISOString());

  if (error) return null;

  type Row = { scheduled_start: string | null; scheduled_end: string | null };
  const rows = (data || []) as Row[];
  const busy: TimeRange[] = rows
    .filter(
      (row): row is { scheduled_start: string; scheduled_end: string } =>
        typeof row.scheduled_start === "string" &&
        typeof row.scheduled_end === "string",
    )
    .map((row) => ({
      startUtc: new Date(row.scheduled_start),
      endUtc: new Date(row.scheduled_end),
    }))
    .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());

  // Convert UTC-shifted back to local date fields
  function utcToLocalDate(utc: Date): Date {
    return new Date(utc.getTime() - tzOffsetMinutes * 60_000);
  }

  let dayCursorUtc = searchStartUtc;

  for (let day = 0; day < maxDays; day += 1) {
    if (!isBusinessDay(dayCursorUtc, tzOffsetMinutes)) {
      dayCursorUtc = addDays(dayCursorUtc, 1);
      continue;
    }

    const localDate = utcToLocalDate(dayCursorUtc);
    const sat = isSaturday(dayCursorUtc, tzOffsetMinutes);

    // Sabado: janela unica 09-12, sem almoco
    // Seg-Sex: duas janelas (manha + tarde) com almoco
    const windows = sat
      ? [
          {
            winStart: localHmToUtc(localDate, SATURDAY_START_HOUR, 0, tzOffsetMinutes),
            winEnd: localHmToUtc(localDate, SATURDAY_END_HOUR, 0, tzOffsetMinutes),
          },
        ]
      : [
          {
            winStart: localHmToUtc(localDate, schedule.work_start, schedule.work_start_min, tzOffsetMinutes),
            winEnd: localHmToUtc(localDate, schedule.lunch_start, schedule.lunch_start_min, tzOffsetMinutes),
          },
          {
            winStart: localHmToUtc(localDate, schedule.lunch_end, schedule.lunch_end_min, tzOffsetMinutes),
            winEnd: localHmToUtc(localDate, schedule.work_end, schedule.work_end_min, tzOffsetMinutes),
          },
        ];

    for (const { winStart, winEnd } of windows) {
      let slotStartUtc = dayCursorUtc < winStart ? winStart : dayCursorUtc;
      slotStartUtc = roundUpToStepUtc(slotStartUtc, tzOffsetMinutes);

      while (addMinutes(slotStartUtc, durationMinutes) <= winEnd) {
        const candidate: TimeRange = {
          startUtc: slotStartUtc,
          endUtc: addMinutes(slotStartUtc, durationMinutes),
        };

        const hasConflict = busy.some((b) => rangesOverlap(candidate, b));
        if (!hasConflict) return slotStartUtc;

        slotStartUtc = addMinutes(slotStartUtc, STEP_MINUTES);
      }
    }

    // Advance to next day at work_start
    const morningStart = localHmToUtc(localDate, schedule.work_start, schedule.work_start_min, tzOffsetMinutes);
    dayCursorUtc = addDays(morningStart, 1);
  }

  return null;
}
