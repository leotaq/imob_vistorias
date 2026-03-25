import { z } from "zod";

import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { HttpError } from "@/lib/errors";
import { INSPECTION_STATUS_LABEL, INSPECTION_TYPE_LABEL } from "@/lib/labels";
import {
  PROPERTY_CITY_OPTIONS,
  detectPropertyCityFromAddress,
  normalizePropertyCity,
} from "@/lib/property";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const TYPE_VALUES = [
  "ocupacao",
  "desocupacao",
  "revistoria",
  "visita",
  "placa_fotos",
  "manutencao",
] as const;
const STATUS_VALUES = [
  "new",
  "received",
  "in_progress",
  "completed",
  "awaiting_contract",
  "finalized",
  "canceled",
] as const;
type InspectionType = (typeof TYPE_VALUES)[number];
type InspectionStatus = (typeof STATUS_VALUES)[number];
type DashboardStatus = Exclude<InspectionStatus, "completed">;

const TZ = "America/Sao_Paulo";
const DASHBOARD_CLOSED_STATUSES = new Set<InspectionStatus>(["completed", "finalized"]);
const DASHBOARD_STATUS_VALUES = STATUS_VALUES.filter(
  (status): status is DashboardStatus => status !== "completed",
);

type InspectionRow = {
  id: string;
  created_at: string;
  type: InspectionType;
  status: InspectionStatus;
  property_city: string | null;
  property_address: string;
  contract_date: string | null;
  completed_at: string | null;
  created_by: string;
  assigned_to: string;
};

type StatusEventRow = {
  inspection_id: string;
  to_status: InspectionStatus;
  changed_at: string;
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

function isMissingSchemaError(error: unknown, markers: string[] = []): boolean {
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

const QuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  managerId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  types: z.array(z.enum(TYPE_VALUES)).default([]),
  statuses: z.array(z.enum(STATUS_VALUES)).default([]),
  cities: z.array(z.string().trim()).default([]),
});

function formatSaoPauloDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function utcFromSaoPauloDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
}

function startEndFromQuery(from?: string, to?: string) {
  const nowSp = formatSaoPauloDate(new Date());
  const [yearNow, monthNow] = nowSp.split("-").map(Number);
  const defaultFrom = `${yearNow}-${String(monthNow).padStart(2, "0")}-01`;

  const firstDay = from || defaultFrom;
  const start = utcFromSaoPauloDate(firstDay);

  let end: Date;
  if (to) {
    const endBase = utcFromSaoPauloDate(to);
    end = new Date(endBase.getTime() + 24 * 60 * 60 * 1000);
  } else {
    const endLocal = new Date(Date.UTC(yearNow, monthNow, 1, 3, 0, 0));
    end = endLocal;
  }

  return {
    fromDate: firstDay,
    toDate: to || formatSaoPauloDate(new Date(end.getTime() - 1)),
    startUtc: start,
    endUtc: end,
  };
}

function toNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function inPeriod(iso: string, startUtc: Date, endUtc: Date): boolean {
  const dt = new Date(iso);
  return dt >= startUtc && dt < endUtc;
}

function normalizeCityLabel(rawCity: string | null, address: string): string {
  const normalized = normalizePropertyCity(rawCity);
  if (normalized) return normalized;
  const byAddress = detectPropertyCityFromAddress(address);
  if (byAddress) return byAddress;
  return "Nao informada";
}

function dateOnlyFromIsoInSp(iso: string): string {
  return formatSaoPauloDate(new Date(iso));
}

function dateOnlyFromIsoInSpOrNull(iso: string | null): string | null {
  if (!iso) return null;
  return formatSaoPauloDate(new Date(iso));
}

function groupCount<K extends string>(values: K[]) {
  const map = new Map<string, number>();
  for (const value of values) {
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function isDashboardClosedStatus(status: InspectionStatus): boolean {
  return DASHBOARD_CLOSED_STATUSES.has(status);
}

function isDashboardOpenStatus(status: InspectionStatus): boolean {
  return status !== "canceled" && !isDashboardClosedStatus(status);
}

function toDashboardStatus(status: InspectionStatus): DashboardStatus {
  return status === "completed" ? "finalized" : status;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      managerId: url.searchParams.get("managerId") || undefined,
      inspectorId: url.searchParams.get("inspectorId") || undefined,
      types: [
        ...url.searchParams.getAll("type[]"),
        ...url.searchParams.getAll("type"),
      ],
      statuses: [
        ...url.searchParams.getAll("status[]"),
        ...url.searchParams.getAll("status"),
      ],
      cities: [
        ...url.searchParams.getAll("city[]"),
        ...url.searchParams.getAll("city"),
      ],
    });

    if (!parsed.success) {
      throw new HttpError(400, "Filtro de dashboard invalido.", parsed.error.flatten());
    }

    const { fromDate, toDate, startUtc, endUtc } = startEndFromQuery(
      parsed.data.from,
      parsed.data.to,
    );
    if (startUtc >= endUtc) {
      throw new HttpError(400, "Periodo invalido: data final deve ser posterior a data inicial.");
    }
    const cityFilter = new Set(
      parsed.data.cities
        .map((city) => normalizePropertyCity(city))
        .filter((city): city is (typeof PROPERTY_CITY_OPTIONS)[number] => Boolean(city)),
    );

    const sb = supabaseAdmin();

    const buildInspectionsQuery = (selectClause: string) => {
      let query = sb.from("inspections").select(selectClause);

      if (parsed.data.managerId) {
        query = query.eq("created_by", parsed.data.managerId);
      }
      if (parsed.data.inspectorId) {
        query = query.eq("assigned_to", parsed.data.inspectorId);
      }
      if (parsed.data.types.length > 0) {
        query = query.in("type", parsed.data.types);
      }
      if (parsed.data.statuses.length > 0) {
        query = query.in("status", parsed.data.statuses);
      }

      return query;
    };

    const selectWithCity = [
      "id",
      "created_at",
      "type",
      "status",
      "property_city",
      "property_address",
      "contract_date",
      "completed_at",
      "created_by",
      "assigned_to",
    ].join(",");
    const selectLegacy = [
      "id",
      "created_at",
      "type",
      "status",
      "property_address",
      "contract_date",
      "completed_at",
      "created_by",
      "assigned_to",
    ].join(",");

    const inspectionsWithCity = await buildInspectionsQuery(selectWithCity);

    let inspectionRows: InspectionRow[] = [];
    if (inspectionsWithCity.error) {
      if (isMissingSchemaError(inspectionsWithCity.error, ["property_city"])) {
        const inspectionsLegacy = await buildInspectionsQuery(selectLegacy);
        if (inspectionsLegacy.error) {
          throw new HttpError(
            500,
            "Falha ao consultar vistorias para dashboard.",
            inspectionsLegacy.error,
          );
        }

        inspectionRows = ((inspectionsLegacy.data ?? []) as unknown[]).map((row) => {
          const legacy = row as Omit<InspectionRow, "property_city">;
          return {
            ...legacy,
            property_city: null,
          };
        });
      } else {
        throw new HttpError(
          500,
          "Falha ao consultar vistorias para dashboard.",
          inspectionsWithCity.error,
        );
      }
    } else {
      inspectionRows = (inspectionsWithCity.data ?? []) as unknown as InspectionRow[];
    }

    const inspections = inspectionRows.filter((row) => {
      if (cityFilter.size === 0) return true;
      const city = normalizePropertyCity(row.property_city) ?? detectPropertyCityFromAddress(
        row.property_address,
      );
      return city ? cityFilter.has(city) : false;
    });

    const inspectionIds = inspections.map((item) => item.id);
    const inspectionsById = new Set(inspectionIds);
    const inPeriodCreated = inspections.filter((item) =>
      inPeriod(item.created_at, startUtc, endUtc),
    );

    const { data: peopleData, error: peopleError } = await sb
      .from("people")
      .select("id,name,role");
    if (peopleError) {
      throw new HttpError(500, "Falha ao consultar pessoas para dashboard.", peopleError);
    }

    const peopleRows = (peopleData ?? []) as unknown as Array<{
      id: string;
      name: string;
      role: string;
    }>;
    const peopleById = new Map(peopleRows.map((person) => [person.id, person.name]));

    const eventsResponse = await sb
      .from("inspection_status_events")
      .select("inspection_id,to_status,changed_at")
      .gte("changed_at", startUtc.toISOString())
      .lt("changed_at", endUtc.toISOString());

    let eventRows: StatusEventRow[] = [];
    if (eventsResponse.error) {
      if (!isMissingSchemaError(eventsResponse.error, ["inspection_status_events"])) {
        throw new HttpError(
          500,
          "Falha ao consultar historico de status.",
          eventsResponse.error,
        );
      }
    } else {
      eventRows = (eventsResponse.data ?? []) as unknown as StatusEventRow[];
    }

    const events = eventRows.filter((event) =>
      inspectionsById.has(event.inspection_id),
    );

    const completedInPeriod = inspections.filter((item) => {
      if (!item.completed_at) return false;
      return inPeriod(item.completed_at, startUtc, endUtc);
    });

    const concluidaNoPeriodo = events.filter((event) => event.to_status === "completed").length;
    const finalizadaNoPeriodo = completedInPeriod.length;
    const canceladaNoPeriodo = events.filter((event) => event.to_status === "canceled").length;

    const emAbertoAtual = inspections.filter((item) =>
      isDashboardOpenStatus(item.status),
    ).length;

    const todaySp = formatSaoPauloDate(new Date());
    const atrasadasAtivas = inspections.filter((item) => {
      if (!item.contract_date) return false;
      if (!isDashboardOpenStatus(item.status)) return false;
      return item.contract_date < todaySp;
    }).length;

    const completedWithDeadline = completedInPeriod.filter((item) => item.contract_date);
    const completedOnTime = completedWithDeadline.filter((item) => {
      const completedDay = dateOnlyFromIsoInSpOrNull(item.completed_at);
      if (!completedDay || !item.contract_date) return false;
      return completedDay <= item.contract_date;
    });

    const avgCompletionHours =
      completedInPeriod.length === 0
        ? 0
        : toNumber(
            completedInPeriod.reduce((acc, item) => {
              if (!item.completed_at) return acc;
              const created = new Date(item.created_at).getTime();
              const completed = new Date(item.completed_at).getTime();
              return acc + (completed - created) / (1000 * 60 * 60);
            }, 0) / completedInPeriod.length,
          );

    const typeCounts = groupCount(inPeriodCreated.map((item) => item.type));
    const cityCounts = groupCount(
      inPeriodCreated.map((item) =>
        normalizeCityLabel(item.property_city, item.property_address),
      ),
    );
    const statusCounts = groupCount(
      inPeriodCreated.map((item) => toDashboardStatus(item.status)),
    );

    const dailyMap = new Map<string, number>();
    const dayCursor = new Date(startUtc);
    while (dayCursor < endUtc) {
      dailyMap.set(formatSaoPauloDate(dayCursor), 0);
      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    }
    for (const item of inPeriodCreated) {
      const day = dateOnlyFromIsoInSp(item.created_at);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }

    const managersCount = new Map<string, number>();
    const inspectorsCount = new Map<string, number>();
    const inspectorsCompletedCount = new Map<string, number>();

    for (const item of inPeriodCreated) {
      managersCount.set(item.created_by, (managersCount.get(item.created_by) || 0) + 1);
      inspectorsCount.set(item.assigned_to, (inspectorsCount.get(item.assigned_to) || 0) + 1);
    }
    for (const item of completedInPeriod) {
      inspectorsCompletedCount.set(
        item.assigned_to,
        (inspectorsCompletedCount.get(item.assigned_to) || 0) + 1,
      );
    }

    const rankingGestoras = Array.from(managersCount.entries())
      .map(([personId, total]) => ({
        person_id: personId,
        name: peopleById.get(personId) || "Sem nome",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const rankingVistoriadores = Array.from(inspectorsCount.entries())
      .map(([personId, total]) => ({
        person_id: personId,
        name: peopleById.get(personId) || "Sem nome",
        total,
        concluidas: inspectorsCompletedCount.get(personId) || 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const response = {
      periodo: {
        from: fromDate,
        to: toDate,
        timezone: TZ,
      },
      filtrosAplicados: {
        managerId: parsed.data.managerId || null,
        inspectorId: parsed.data.inspectorId || null,
        types: parsed.data.types,
        statuses: parsed.data.statuses,
        cities: Array.from(cityFilter),
      },
      kpis: {
        criadas_no_periodo: inPeriodCreated.length,
        em_aberto_atual: emAbertoAtual,
        concluidas_no_periodo: concluidaNoPeriodo,
        finalizadas_no_periodo: finalizadaNoPeriodo,
        canceladas_no_periodo: canceladaNoPeriodo,
        atrasadas_ativas: atrasadasAtivas,
        sla_no_prazo_percentual:
          completedWithDeadline.length === 0
            ? 0
            : toNumber((completedOnTime.length / completedWithDeadline.length) * 100),
        tempo_medio_conclusao_horas: avgCompletionHours,
      },
      por_tipo: TYPE_VALUES.map((type) => ({
        key: type,
        label: INSPECTION_TYPE_LABEL[type],
        total: typeCounts.get(type) || 0,
      })),
      por_cidade: Array.from(cityCounts.entries())
        .map(([city, total]) => ({ city, total }))
        .sort((a, b) => b.total - a.total),
      por_status: DASHBOARD_STATUS_VALUES.map((status) => ({
        key: status,
        label: INSPECTION_STATUS_LABEL[status],
        total: statusCounts.get(status) || 0,
      })),
      evolucao_diaria: Array.from(dailyMap.entries()).map(([date, total]) => ({
        date,
        total,
      })),
      ranking_gestoras: rankingGestoras,
      ranking_vistoriadores: rankingVistoriadores,
      options: {
        cities: PROPERTY_CITY_OPTIONS,
        types: TYPE_VALUES.map((value) => ({
          value,
          label: INSPECTION_TYPE_LABEL[value],
        })),
        statuses: STATUS_VALUES.map((value) => ({
          value,
          label: INSPECTION_STATUS_LABEL[value],
        })),
        managers: peopleRows
          .filter((person) => person.role === "manager" || person.role === "attendant")
          .map((person) => ({ id: person.id, name: person.name })),
        inspectors: peopleRows
          .filter((person) => person.role === "inspector")
          .map((person) => ({ id: person.id, name: person.name })),
      },
    };

    return jsonNoStore(response);
  } catch (err) {
    return apiError(err);
  }
}
