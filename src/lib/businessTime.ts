export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;
export const STEP_MINUTES = 30;

const MINUTE_MS = 60_000;

function toLocalShiftedUtcDate(utc: Date, tzOffsetMinutes: number): Date {
  // Representa o "horário local" como se fosse UTC, usando getters UTC.
  return new Date(utc.getTime() - tzOffsetMinutes * MINUTE_MS);
}

function makeUtcFromShiftedLocalParts(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  tzOffsetMinutes: number,
): Date {
  const shiftedLocalMs = Date.UTC(y, m, d, hh, mm, 0, 0);
  return new Date(shiftedLocalMs + tzOffsetMinutes * MINUTE_MS);
}

export function getBusinessBoundsUtc(
  anyUtcInDay: Date,
  tzOffsetMinutes: number,
): { startUtc: Date; endUtc: Date } {
  const localShifted = toLocalShiftedUtcDate(anyUtcInDay, tzOffsetMinutes);
  const y = localShifted.getUTCFullYear();
  const m = localShifted.getUTCMonth();
  const d = localShifted.getUTCDate();

  return {
    startUtc: makeUtcFromShiftedLocalParts(
      y,
      m,
      d,
      BUSINESS_START_HOUR,
      0,
      tzOffsetMinutes,
    ),
    endUtc: makeUtcFromShiftedLocalParts(
      y,
      m,
      d,
      BUSINESS_END_HOUR,
      0,
      tzOffsetMinutes,
    ),
  };
}

export const SATURDAY_START_HOUR = 9;
export const SATURDAY_END_HOUR = 12;

export function getSaturdayBoundsUtc(
  anyUtcInDay: Date,
  tzOffsetMinutes: number,
): { startUtc: Date; endUtc: Date } {
  const localShifted = toLocalShiftedUtcDate(anyUtcInDay, tzOffsetMinutes);
  const y = localShifted.getUTCFullYear();
  const m = localShifted.getUTCMonth();
  const d = localShifted.getUTCDate();

  return {
    startUtc: makeUtcFromShiftedLocalParts(y, m, d, SATURDAY_START_HOUR, 0, tzOffsetMinutes),
    endUtc: makeUtcFromShiftedLocalParts(y, m, d, SATURDAY_END_HOUR, 0, tzOffsetMinutes),
  };
}

export function isBusinessDay(
  anyUtcInDay: Date,
  tzOffsetMinutes: number,
): boolean {
  const localShifted = toLocalShiftedUtcDate(anyUtcInDay, tzOffsetMinutes);
  const dow = localShifted.getUTCDay(); // 0=dom ... 6=sab
  return dow >= 1 && dow <= 6; // seg-sab (dom bloqueado)
}

export function isSaturday(
  anyUtcInDay: Date,
  tzOffsetMinutes: number,
): boolean {
  const localShifted = toLocalShiftedUtcDate(anyUtcInDay, tzOffsetMinutes);
  return localShifted.getUTCDay() === 6;
}

export function validateBusinessSlot(
  startUtc: Date,
  endUtc: Date,
  tzOffsetMinutes: number,
): string | null {
  if (endUtc <= startUtc) return "Horário inválido.";
  if (!isBusinessDay(startUtc, tzOffsetMinutes))
    return "Agendamentos apenas de segunda a sabado.";

  const startLocal = toLocalShiftedUtcDate(startUtc, tzOffsetMinutes);
  const endLocal = toLocalShiftedUtcDate(endUtc, tzOffsetMinutes);

  const sameDay =
    startLocal.getUTCFullYear() === endLocal.getUTCFullYear() &&
    startLocal.getUTCMonth() === endLocal.getUTCMonth() &&
    startLocal.getUTCDate() === endLocal.getUTCDate();
  if (!sameDay) return "A duração não pode ultrapassar para o próximo dia.";

  const sat = isSaturday(startUtc, tzOffsetMinutes);
  const effectiveStart = sat ? SATURDAY_START_HOUR : BUSINESS_START_HOUR;
  const effectiveEnd = sat ? SATURDAY_END_HOUR : BUSINESS_END_HOUR;

  const { startUtc: bStart, endUtc: bEnd } = sat
    ? getSaturdayBoundsUtc(startUtc, tzOffsetMinutes)
    : getBusinessBoundsUtc(startUtc, tzOffsetMinutes);

  if (startUtc < bStart || endUtc > bEnd) {
    return sat
      ? `Horario fora do expediente de sabado (${String(effectiveStart).padStart(2, "0")}:00-${String(effectiveEnd).padStart(2, "0")}:00).`
      : `Horário fora do expediente (Seg-Sex ${String(effectiveStart).padStart(2, "0")}:00-${String(effectiveEnd).padStart(2, "0")}:00).`;
  }

  return null;
}

export function roundUpToStepUtc(
  utc: Date,
  tzOffsetMinutes: number,
  stepMinutes = STEP_MINUTES,
): Date {
  const stepMs = stepMinutes * MINUTE_MS;
  const localShiftedMs = utc.getTime() - tzOffsetMinutes * MINUTE_MS;
  const roundedLocalShiftedMs = Math.ceil(localShiftedMs / stepMs) * stepMs;
  return new Date(roundedLocalShiftedMs + tzOffsetMinutes * MINUTE_MS);
}

/**
 * Validates a slot against custom work bounds that include a lunch break.
 * Returns an error message or null if valid.
 */
export function validateCustomSlot(
  startUtc: Date,
  endUtc: Date,
  tzOffsetMinutes: number,
  opts: {
    workStartH: number; workStartM: number;
    lunchStartH: number; lunchStartM: number;
    lunchEndH: number; lunchEndM: number;
    workEndH: number; workEndM: number;
  },
): string | null {
  if (endUtc <= startUtc) return "Horário inválido.";
  if (!isBusinessDay(startUtc, tzOffsetMinutes))
    return "Agendamentos apenas de segunda a sabado.";

  // Sabado: horario fixo 09-12, sem almoco, ignora schedule customizado
  if (isSaturday(startUtc, tzOffsetMinutes)) {
    const { startUtc: satStart, endUtc: satEnd } = getSaturdayBoundsUtc(startUtc, tzOffsetMinutes);
    if (startUtc < satStart || endUtc > satEnd) {
      return `Horario fora do expediente de sabado (${String(SATURDAY_START_HOUR).padStart(2, "0")}:00-${String(SATURDAY_END_HOUR).padStart(2, "0")}:00).`;
    }
    return null;
  }

  const localShifted = toLocalShiftedUtcDate(startUtc, tzOffsetMinutes);
  const y = localShifted.getUTCFullYear();
  const m = localShifted.getUTCMonth();
  const d = localShifted.getUTCDate();

  function makeUtc(hh: number, mm: number) {
    return makeUtcFromShiftedLocalParts(y, m, d, hh, mm, tzOffsetMinutes);
  }

  const workStart = makeUtc(opts.workStartH, opts.workStartM);
  const lunchStart = makeUtc(opts.lunchStartH, opts.lunchStartM);
  const lunchEnd = makeUtc(opts.lunchEndH, opts.lunchEndM);
  const workEnd = makeUtc(opts.workEndH, opts.workEndM);

  if (startUtc < workStart || endUtc > workEnd) {
    const fmt = (h: number, mi: number) =>
      `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    return `Horário fora do expediente (${fmt(opts.workStartH, opts.workStartM)}–${fmt(opts.workEndH, opts.workEndM)}).`;
  }

  // Cannot overlap the lunch break
  if (startUtc < lunchEnd && endUtc > lunchStart) {
    const fmt = (h: number, mi: number) =>
      `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    return `Horário conflita com o almoço (${fmt(opts.lunchStartH, opts.lunchStartM)}–${fmt(opts.lunchEndH, opts.lunchEndM)}).`;
  }

  return null;
}
