"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import Modal from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import { clearStoredActor, useActor } from "@/hooks/useActor";
import { apiFetch } from "@/lib/clientApi";
import { INSPECTION_TYPE_LABEL } from "@/lib/labels";
import {
  PROPERTY_CITY_OPTIONS,
  buildGoogleMapsSearchUrl,
  composePropertyAddress,
  detectPropertyCityFromAddress,
} from "@/lib/property";

type Person = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
  active: boolean;
};

type InspectionType =
  | "ocupacao"
  | "desocupacao"
  | "revistoria"
  | "visita"
  | "placa_fotos"
  | "manutencao";
type InspectionStatus =
  | "new"
  | "received"
  | "in_progress"
  | "completed"
  | "awaiting_contract"
  | "finalized"
  | "canceled";

type Inspection = {
  id: string;
  created_at: string;
  type: InspectionType;
  status: InspectionStatus;
  property_code: string;
  property_address: string;
  property_street?: string | null;
  property_number?: string | null;
  property_complement?: string | null;
  property_neighborhood?: string | null;
  property_city?: string | null;
  contract_date: string | null;
  notes: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_minutes: number | null;
  received_at?: string | null;
  completed_at?: string | null;
  created_by: string;
  created_by_person?: {
    id: string;
    name: string;
    role: string;
    phone?: string | null;
  } | null;
  assigned_to_person?: {
    id: string;
    name: string;
    role: string;
    phone?: string | null;
  } | null;
  assigned_to: string;
  assigned_to_marketing?: string | null;
  assigned_to_marketing_person?: {
    id: string;
    name: string;
    role: string;
    phone?: string | null;
  } | null;
};

type FreeSlot = { start: Date; end: Date };
type CalendarEvent = { start: string; end: string };

type AppError = Error & { status?: number; details?: unknown };
type LookupStatus = "idle" | "loading" | "loaded" | "not_found" | "error";
type PropertyTouchedState = {
  property_address: boolean;
  property_number: boolean;
  property_complement: boolean;
  property_neighborhood: boolean;
  property_city: boolean;
  contract_date: boolean;
  notes: boolean;
};
type PropertyLookupPayload = {
  property: {
    code: string;
    address: string;
    street: string;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
  } | null;
  defaults: {
    contract_date: string | null;
    notes: string | null;
  };
};

const INITIAL_TOUCHED_STATE: PropertyTouchedState = {
  property_address: false,
  property_number: false,
  property_complement: false,
  property_neighborhood: false,
  property_city: false,
  contract_date: false,
  notes: false,
};

const CITY_OPTIONS = PROPERTY_CITY_OPTIONS;
type CityOption = (typeof CITY_OPTIONS)[number];
const DEFAULT_CITY: CityOption = "Taquara";
const SCHEDULE_DURATION_PRESETS = [15, 30, 45, 60] as const;

function toAppError(err: unknown): AppError {
  if (err instanceof Error) return err as AppError;
  return new Error("Erro inesperado") as AppError;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

function suggestInitialScheduleLocal(): string {
  const now = new Date();
  const day = now.getDay();

  // Domingo: pular para segunda 08:00
  if (day === 0) {
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    next.setHours(8, 0, 0, 0);
    return toDatetimeLocalValue(next);
  }

  // Sabado: horario 09-12
  if (day === 6) {
    const h = now.getHours();
    if (h < 9) {
      now.setHours(9, 0, 0, 0);
      return toDatetimeLocalValue(now);
    }
    if (h >= 12) {
      const next = new Date(now);
      next.setDate(now.getDate() + 2); // pula para segunda
      next.setHours(8, 0, 0, 0);
      return toDatetimeLocalValue(next);
    }
  }

  const h = now.getHours();
  if (h < 8) {
    now.setHours(8, 0, 0, 0);
    return toDatetimeLocalValue(now);
  }

  if (h >= 18) {
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    while (next.getDay() === 0) { // pula domingo
      next.setDate(next.getDate() + 1);
    }
    next.setHours(next.getDay() === 6 ? 9 : 8, 0, 0, 0);
    return toDatetimeLocalValue(next);
  }

  const m = now.getMinutes();
  const rounded = Math.ceil(m / 30) * 30;
  if (rounded === 60) now.setHours(now.getHours() + 1, 0, 0, 0);
  else now.setMinutes(rounded, 0, 0);
  return toDatetimeLocalValue(now);
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseContractDeadline(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsedDateOnly = parseDateOnly(trimmed);
  if (parsedDateOnly) {
    return new Date(parsedDateOnly.year, parsedDateOnly.month - 1, parsedDateOnly.day);
  }

  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatDateOnly(value: string) {
  const parsed = parseContractDeadline(value);
  if (!parsed) return value;

  const base = `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  const hasTime = /T\d{2}:\d{2}/.test(value.trim());
  if (!hasTime) return base;

  return `${base} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

function formatInspectionCode(code: string) {
  const cleaned = code.trim();
  return cleaned || "Sem código";
}

type DeadlineMeta = {
  dateText: string;
  counterText: string;
  toneClass: string;
};

const INSPECTION_STATUS_GROUP_RANK: Record<InspectionStatus, number> = {
  new: 0,
  received: 0,
  in_progress: 0,
  completed: 0,
  awaiting_contract: 0,
  finalized: 1,
  canceled: 2,
};

function toTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
}

function compareInspectionDisplayOrder(a: Inspection, b: Inspection): number {
  const rankDiff =
    INSPECTION_STATUS_GROUP_RANK[a.status] - INSPECTION_STATUS_GROUP_RANK[b.status];
  if (rankDiff !== 0) return rankDiff;

  if (a.status === "finalized" && b.status === "finalized") {
    const finalizedDiff = toTimestamp(b.completed_at) - toTimestamp(a.completed_at);
    if (finalizedDiff !== 0) return finalizedDiff;
  }

  const createdDiff = toTimestamp(b.created_at) - toTimestamp(a.created_at);
  if (createdDiff !== 0) return createdDiff;

  return toTimestamp(b.scheduled_start) - toTimestamp(a.scheduled_start);
}

function getDeadlineMeta(
  type: InspectionType,
  contractDate: string,
  status: InspectionStatus,
  receivedAt: string | null,
): DeadlineMeta | null {
  const parsed = parseContractDeadline(contractDate);
  if (!parsed) return null;

  const dateText = formatDateOnly(contractDate);

  if (type !== "ocupacao" && !receivedAt && status === "new") {
    return {
      dateText,
      counterText: "⏳ Aguardando recebimento",
      toneClass: "border-amber-300 bg-amber-100 text-amber-800",
    };
  }

  if (status === "finalized" || status === "canceled") {
    return {
      dateText,
      counterText: "Encerrada",
      toneClass: "border-slate-200 bg-slate-100 text-slate-700",
    };
  }

  if (status === "completed") {
    return {
      dateText,
      counterText: "Concluída (pendente de finalização)",
      toneClass: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  const today = new Date();
  const todaySerial = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000,
  );
  const deadlineSerial = Math.floor(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86_400_000,
  );
  const diffDays = deadlineSerial - todaySerial;

  if (diffDays > 0) {
    return {
      dateText,
      counterText: `Faltam ${diffDays} dia(s)`,
      toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  if (diffDays === 0) {
    return {
      dateText,
      counterText: "Vence hoje",
      toneClass: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  return {
    dateText,
    counterText: `Atrasada ${Math.abs(diffDays)} dia(s)`,
    toneClass: "border-rose-200 bg-rose-50 text-rose-800",
  };
}

function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + 1);

  let addedDays = 0;
  while (addedDays < days) {
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0) { // pula apenas domingo, sabado conta
      addedDays++;
    }
    if (addedDays < days) {
      result.setDate(result.getDate() + 1);
    }
  }
  return result;
}

function getDesocupacaoDeadlineMeta(
  inspection: Inspection,
): DeadlineMeta | null {
  if (inspection.status === "finalized" || inspection.status === "canceled") {
    return {
      dateText: "Regra: 72h úteis",
      counterText: "Encerrada",
      toneClass: "border-slate-200 bg-slate-100 text-slate-700",
    };
  }

  if (inspection.status === "completed") {
    return {
      dateText: "Regra: 72h úteis",
      counterText: "Concluída (pendente de finalização)",
      toneClass: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  if (!inspection.received_at) {
    return {
      dateText: "Regra: 72h úteis",
      counterText: "⏳ Aguardando recebimento",
      toneClass: "border-amber-300 bg-amber-100 text-amber-800",
    };
  }

  const receivedDate = new Date(inspection.received_at);
  const deadlineDate = addBusinessDays(receivedDate, 3);

  const formatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
  const diaSemana = formatter.format(deadlineDate);
  const diaSemanaCapitalized = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);

  const dateText = `Prazo legal: 72h úteis`;

  const today = new Date();
  const todaySerial = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000,
  );
  const deadlineSerial = Math.floor(
    Date.UTC(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate()) / 86_400_000,
  );
  const diffDays = deadlineSerial - todaySerial;

  if (diffDays > 1) {
    return {
      dateText,
      counterText: `Prazo ${diaSemanaCapitalized}`,
      toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  if (diffDays === 1) {
    return {
      dateText,
      counterText: "Prazo Amanhã",
      toneClass: "border-orange-200 bg-orange-100 text-orange-800",
    };
  }

  if (diffDays === 0) {
    return {
      dateText,
      counterText: "Prazo Hoje",
      toneClass: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  return {
    dateText,
    counterText: `Atrasada ${Math.abs(diffDays)} dia(s)`,
    toneClass: "border-rose-200 bg-rose-50 text-rose-800",
  };
}

function computeFreeSlots(opts: {
  dayStart: Date;
  dayEnd: Date;
  events: CalendarEvent[];
  minMinutes: number;
}): FreeSlot[] {
  const minMs = opts.minMinutes * 60_000;
  const events = opts.events
    .map((e) => ({ start: new Date(e.start), end: new Date(e.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: FreeSlot[] = [];
  let cursor = new Date(opts.dayStart);

  for (const ev of events) {
    if (ev.end <= cursor) continue;

    if (ev.start > cursor) {
      const gapMs = ev.start.getTime() - cursor.getTime();
      if (gapMs >= minMs) slots.push({ start: new Date(cursor), end: ev.start });
    }

    if (ev.end > cursor) cursor = new Date(ev.end);
  }

  if (cursor < opts.dayEnd) {
    const gapMs = opts.dayEnd.getTime() - cursor.getTime();
    if (gapMs >= minMs) slots.push({ start: new Date(cursor), end: opts.dayEnd });
  }

  return slots;
}

function buildFreeStartOptions(slots: FreeSlot[], durationMinutes: number): Date[] {
  const durationMs = durationMinutes * 60_000;
  const stepMs = 15 * 60_000;
  const options: Date[] = [];

  for (const slot of slots) {
    let cursor = new Date(slot.start);
    while (cursor.getTime() + durationMs <= slot.end.getTime()) {
      options.push(new Date(cursor));
      cursor = new Date(cursor.getTime() + stepMs);
    }
  }

  return options;
}

function normalizeScheduleDuration(value: number): number {
  if (!Number.isFinite(value)) return 60;
  const rounded = Math.round(value / 15) * 15;
  return Math.min(480, Math.max(15, rounded));
}

function parseCalendarEvents(payload: unknown): CalendarEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as { events?: unknown };
  if (!Array.isArray(obj.events)) return [];

  return obj.events
    .map((event) => {
      if (!event || typeof event !== "object") return null;
      const record = event as { start?: unknown; end?: unknown };
      if (typeof record.start !== "string" || typeof record.end !== "string") {
        return null;
      }
      return { start: record.start, end: record.end };
    })
    .filter((event): event is CalendarEvent => event !== null);
}

function extractSuggestedStart(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const record = details as { suggestedStart?: unknown };
  return typeof record.suggestedStart === "string" ? record.suggestedStart : null;
}

const currentDateForMonthPicker = new Date();

function normalizeWhatsappTarget(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits;
}

function detectCityFromAddress(address: string): CityOption {
  return detectPropertyCityFromAddress(address) ?? DEFAULT_CITY;
}

function resolveCityOption(raw: string | null | undefined, fallbackAddress: string): CityOption {
  if (raw && CITY_OPTIONS.includes(raw as CityOption)) return raw as CityOption;
  return detectCityFromAddress(fallbackAddress);
}

export default function VistoriasPage() {
  const router = useRouter();
  const { ready, actor, authStatus } = useActor();

  // Month Filtering State
  const [selectedMonth, setSelectedMonth] = useState(currentDateForMonthPicker.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(currentDateForMonthPicker.getFullYear());

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [managerOwnInspections, setManagerOwnInspections] = useState<Inspection[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionInvalid, setSessionInvalid] = useState(false);

  const [peopleInspectors, setPeopleInspectors] = useState<Person[]>([]);
  const [peopleManagers, setPeopleManagers] = useState<Person[]>([]);
  const [peopleMarketing, setPeopleMarketing] = useState<Person[]>([]);
  const [selectedInspectorId, setSelectedInspectorId] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");

  // Kanban Drag-to-Scroll State
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  const [isKanbanDragging, setIsKanbanDragging] = useState(false);
  const [kanbanStartX, setKanbanStartX] = useState(0);
  const [kanbanScrollLeft, setKanbanScrollLeft] = useState(0);

  const handleKanbanMouseDown = (e: React.MouseEvent) => {
    if (!kanbanScrollRef.current) return;
    setIsKanbanDragging(true);
    setKanbanStartX(e.pageX - kanbanScrollRef.current.offsetLeft);
    setKanbanScrollLeft(kanbanScrollRef.current.scrollLeft);
  };

  const handleKanbanMouseLeaveOrUp = () => {
    setIsKanbanDragging(false);
  };

  const handleKanbanMouseMove = (e: React.MouseEvent) => {
    if (!isKanbanDragging || !kanbanScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - kanbanScrollRef.current.offsetLeft;
    const walk = (x - kanbanStartX) * 1.5; // scrolling speed multiplier
    kanbanScrollRef.current.scrollLeft = kanbanScrollLeft - walk;
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    type: "ocupacao" as InspectionType,
    property_code: "",
    property_address: "",
    property_number: "",
    property_complement: "",
    property_neighborhood: "",
    property_city: DEFAULT_CITY as CityOption,
    contract_date: "",
    notes: "",
    assigned_to: "",
    assigned_to_marketing: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [createLookupStatus, setCreateLookupStatus] = useState<LookupStatus>("idle");
  const [createLookupMessage, setCreateLookupMessage] = useState<string | null>(null);
  const [createTouched, setCreateTouched] = useState<PropertyTouchedState>(
    INITIAL_TOUCHED_STATE,
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editInspection, setEditInspection] = useState<Inspection | null>(null);
  const [editForm, setEditForm] = useState({
    type: "ocupacao" as InspectionType,
    property_code: "",
    property_address: "",
    property_number: "",
    property_complement: "",
    property_neighborhood: "",
    property_city: DEFAULT_CITY as CityOption,
    contract_date: "",
    notes: "",
    assigned_to: "",
    assigned_to_marketing: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editLookupStatus, setEditLookupStatus] = useState<LookupStatus>("idle");
  const [editLookupMessage, setEditLookupMessage] = useState<string | null>(null);
  const [editTouched, setEditTouched] = useState<PropertyTouchedState>(
    INITIAL_TOUCHED_STATE,
  );

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"new" | "reschedule">("new");
  const [scheduleInspection, setScheduleInspection] = useState<Inspection | null>(
    null,
  );
  const [scheduleStartLocal, setScheduleStartLocal] = useState(
    suggestInitialScheduleLocal(),
  );
  const [scheduleDuration, setScheduleDuration] = useState(60);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleHistoricalHint, setScheduleHistoricalHint] = useState<string | null>(null);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [freeSlotsLoading, setFreeSlotsLoading] = useState(false);
  const [deletingInspectionId, setDeletingInspectionId] = useState<string | null>(null);

  const createTouchedRef = useRef<PropertyTouchedState>(INITIAL_TOUCHED_STATE);
  const editTouchedRef = useRef<PropertyTouchedState>(INITIAL_TOUCHED_STATE);
  const createLookupSeqRef = useRef(0);
  const editLookupSeqRef = useRef(0);

  const canCreate = actor?.role === "manager" || actor?.role === "attendant";
  const canSchedule = actor?.role === "inspector" || actor?.role === "marketing";
  const isManagerActor = actor?.role === "manager" || actor?.role === "attendant";

  const isAssignedToMe = (item: Inspection) =>
    (actor?.role === "inspector" && item.assigned_to === actor?.id) ||
    (actor?.role === "marketing" && item.assigned_to_marketing === actor?.id);

  const pendingCount = useMemo(
    () =>
      inspections.filter(
        (item) => item.status !== "finalized" && item.status !== "canceled",
      ).length,
    [inspections],
  );
  const displayInspections = useMemo(() => {
    let filtered = inspections;
    // For Kanban/List view:
    // We hide finalized by default unless specifically asked for in statusFilter.
    // For field workers (inspector/marketing), we also hide 'completed' from the Kanban, since they will be shown in the bottom list.
    const isFieldWorkerActor = actor?.role === "inspector" || actor?.role === "marketing";
    if (statusFilter !== "completed" && statusFilter !== "finalized") {
      filtered = inspections.filter(
        (i) => i.status !== "finalized" && (!isFieldWorkerActor || i.status !== "completed")
      );
    }
    return [...filtered].sort(compareInspectionDisplayOrder);
  }, [inspections, statusFilter, actor]);

  const inspectorCompletedInspections = useMemo(() => {
    if (actor?.role !== "inspector" && actor?.role !== "marketing") return [];
    return inspections
      .filter(i => i.status === "completed" || i.status === "finalized")
      .sort((a, b) => toTimestamp(b.completed_at) - toTimestamp(a.completed_at)); // newest first
  }, [inspections, actor]);

  const [completedLimit, setCompletedLimit] = useState(10);
  const displayInspectorCompleted = inspectorCompletedInspections.slice(0, completedLimit);

  const [managerListLimit, setManagerListLimit] = useState(8);

  const displayManagerOwnInspections = useMemo(() => {
    return [...managerOwnInspections].sort(compareInspectionDisplayOrder);
  }, [managerOwnInspections]);
  const createMapUrl = useMemo(
    () =>
      buildGoogleMapsSearchUrl(
        composePropertyAddress({
          street: createForm.property_address,
          number: createForm.property_number,
          complement: createForm.property_complement,
          neighborhood: createForm.property_neighborhood,
          city: createForm.property_city,
        }),
      ),
    [
      createForm.property_address,
      createForm.property_number,
      createForm.property_complement,
      createForm.property_neighborhood,
      createForm.property_city,
    ],
  );
  const editMapUrl = useMemo(
    () =>
      buildGoogleMapsSearchUrl(
        composePropertyAddress({
          street: editForm.property_address,
          number: editForm.property_number,
          complement: editForm.property_complement,
          neighborhood: editForm.property_neighborhood,
          city: editForm.property_city,
        }),
      ),
    [
      editForm.property_address,
      editForm.property_number,
      editForm.property_complement,
      editForm.property_neighborhood,
      editForm.property_city,
    ],
  );
  const freeStartOptions = useMemo(
    () => buildFreeStartOptions(freeSlots, scheduleDuration),
    [freeSlots, scheduleDuration],
  );

  useEffect(() => {
    createTouchedRef.current = createTouched;
  }, [createTouched]);

  useEffect(() => {
    editTouchedRef.current = editTouched;
  }, [editTouched]);

  function openAddressInMap(address: string) {
    const mapUrl = buildGoogleMapsSearchUrl(address);
    if (!mapUrl) return;
    window.open(mapUrl, "_blank", "noopener,noreferrer");
  }

  function markCreateFieldTouched(field: keyof PropertyTouchedState) {
    setCreateTouched((prev) => ({ ...prev, [field]: true }));
  }

  function markEditFieldTouched(field: keyof PropertyTouchedState) {
    setEditTouched((prev) => ({ ...prev, [field]: true }));
  }

  function canManageOwnInspection(item: Inspection) {
    return (
      isManagerActor
      && item.created_by === actor?.id
      && item.status !== "finalized"
      && item.status !== "canceled"
    );
  }

  function canDeleteOwnInspection(item: Inspection) {
    if (item.status !== "new" && item.status !== "canceled") return false;

    return (
      (isManagerActor && item.created_by === actor?.id)
      || (actor?.role === "inspector" && item.assigned_to === actor?.id)
    );
  }

  function isSessionError(appError: AppError) {
    const msg = (appError.message || "").toLowerCase();
    return appError.status === 401 || appError.status === 403 || msg.includes("pessoa");
  }

  function goSelectActor() {
    clearStoredActor();
    router.replace(authStatus === "pending" ? "/acesso-pendente" : "/");
  }

  useEffect(() => {
    if (!ready) return;
    if (actor) return;
    router.replace(authStatus === "pending" ? "/acesso-pendente" : "/");
  }, [ready, actor, authStatus, router]);

  async function loadInspectors() {
    try {
      const json = await apiFetch("/api/people?role=inspector");
      setPeopleInspectors(Array.isArray(json.people) ? json.people : []);
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (isSessionError(appError)) {
        setSessionInvalid(true);
        setError("Sua sessão expirou. Selecione sua pessoa novamente.");
      }
      throw appError;
    }
  }

  async function loadManagers() {
    try {
      const json = await apiFetch("/api/people");
      const people = Array.isArray(json.people) ? (json.people as Person[]) : [];
      setPeopleManagers(
        people.filter((person) => person.role === "manager" || person.role === "attendant"),
      );
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (isSessionError(appError)) {
        setSessionInvalid(true);
        setError("Sua sessão expirou. Selecione sua pessoa novamente.");
      }
      throw appError;
    }
  }

  async function loadMarketing() {
    try {
      const json = await apiFetch("/api/people?role=marketing");
      setPeopleMarketing(Array.isArray(json.people) ? json.people : []);
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (isSessionError(appError)) {
        setSessionInvalid(true);
        setError("Sua sessão expirou. Selecione sua pessoa novamente.");
      }
      throw appError;
    }
  }

  async function loadInspections() {
    setLoading(true);
    setError(null);
    setSessionInvalid(false);

    try {
      const qs = new URLSearchParams();
      if (actor?.role !== "inspector" && actor?.role !== "marketing" && selectedInspectorId) {
        qs.set("assignedTo", selectedInspectorId);
      }
      if (actor?.role !== "inspector" && actor?.role !== "marketing" && selectedManagerId) {
        qs.set("createdBy", selectedManagerId);
      }
      if (statusFilter) qs.set("status", statusFilter);
      qs.set("month", selectedMonth.toString());
      qs.set("year", selectedYear.toString());

      const path = qs.toString()
        ? `/api/inspections?${qs.toString()}`
        : "/api/inspections";

      const json = await apiFetch(path);
      setInspections(Array.isArray(json.inspections) ? json.inspections : []);

      if (actor?.role === "manager" || actor?.role === "attendant") {
        try {
          const ownJson = await apiFetch(`/api/inspections?createdBy=${actor.id}`);
          setManagerOwnInspections(
            Array.isArray(ownJson.inspections) ? ownJson.inspections : [],
          );
        } catch {
          setManagerOwnInspections([]);
        }
      } else {
        setManagerOwnInspections([]);
      }
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (isSessionError(appError)) {
        setSessionInvalid(true);
        setError("Sua sessão expirou. Selecione sua pessoa novamente.");
      } else {
        setError(appError.message || "Falha ao carregar vistorias.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !actor) return;
    Promise.all([loadInspectors(), loadManagers(), loadMarketing()]).catch(() => {
      setPeopleInspectors([]);
      setPeopleManagers([]);
      setPeopleMarketing([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, actor]);

  useEffect(() => {
    if (!ready || !actor) return;
    loadInspections().catch((err: unknown) => {
      const appError = toAppError(err);
      if (!isSessionError(appError)) {
        setError("Falha ao carregar vistorias.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, actor, selectedInspectorId, selectedManagerId, statusFilter, selectedMonth, selectedYear]);

  // Handle Month changes
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y: number) => y - 1);
    } else {
      setSelectedMonth((m: number) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y: number) => y + 1);
    } else {
      setSelectedMonth((m: number) => m + 1);
    }
  };

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  useEffect(() => {
    if (!createOpen || !canCreate) return;

    const code = createForm.property_code.trim();
    if (!code) {
      createLookupSeqRef.current += 1;
      setCreateLookupStatus("idle");
      setCreateLookupMessage(null);
      return;
    }

    const seq = createLookupSeqRef.current + 1;
    createLookupSeqRef.current = seq;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setCreateLookupStatus("loading");
        setCreateLookupMessage("Buscando dados do imovel...");

        const payload = (await apiFetch(
          `/api/properties/lookup?code=${encodeURIComponent(code)}`,
          { signal: controller.signal },
        )) as PropertyLookupPayload;

        if (seq !== createLookupSeqRef.current) return;

        const hasDefaults = Boolean(
          payload.property?.address
          || payload.defaults.contract_date
          || payload.defaults.notes,
        );

        setCreateForm((prev) => {
          const touched = createTouchedRef.current;
          const next = { ...prev };

          if (
            payload.property?.address
            && (!touched.property_address || !prev.property_address.trim())
          ) {
            next.property_address = payload.property.street || payload.property.address;
          }

          if (
            payload.property?.number
            && (!touched.property_number || !prev.property_number.trim())
          ) {
            next.property_number = payload.property.number;
          }

          if (
            payload.property?.complement
            && (!touched.property_complement || !prev.property_complement.trim())
          ) {
            next.property_complement = payload.property.complement;
          }

          if (
            payload.property?.neighborhood
            && (!touched.property_neighborhood || !prev.property_neighborhood.trim())
          ) {
            next.property_neighborhood = payload.property.neighborhood;
          }

          if (!touched.property_city || !prev.property_city) {
            next.property_city = resolveCityOption(
              payload.property?.city ?? null,
              payload.property?.address || "",
            );
          }

          if (
            payload.defaults.contract_date
            && (!touched.contract_date || !prev.contract_date.trim())
          ) {
            next.contract_date = payload.defaults.contract_date;
          }

          if (
            payload.defaults.notes
            && (!touched.notes || !prev.notes.trim())
          ) {
            next.notes = payload.defaults.notes;
          }

          return next;
        });

        setCreateLookupStatus(hasDefaults ? "loaded" : "not_found");
        setCreateLookupMessage(
          hasDefaults
            ? "Dados carregados do cadastro."
            : "Codigo novo: preencha os dados do imovel.",
        );
      } catch (err: unknown) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) return;
        if (seq !== createLookupSeqRef.current) return;
        const appError = toAppError(err);
        setCreateLookupStatus("error");
        setCreateLookupMessage(
          appError.message || "Falha ao buscar cadastro do imovel.",
        );
      }
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [createOpen, canCreate, createForm.property_code]);

  useEffect(() => {
    if (!editOpen || !canCreate) return;

    const code = editForm.property_code.trim();
    if (!code) {
      editLookupSeqRef.current += 1;
      setEditLookupStatus("idle");
      setEditLookupMessage(null);
      return;
    }

    const seq = editLookupSeqRef.current + 1;
    editLookupSeqRef.current = seq;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setEditLookupStatus("loading");
        setEditLookupMessage("Buscando dados do imovel...");

        const payload = (await apiFetch(
          `/api/properties/lookup?code=${encodeURIComponent(code)}`,
          { signal: controller.signal },
        )) as PropertyLookupPayload;

        if (seq !== editLookupSeqRef.current) return;

        const hasDefaults = Boolean(
          payload.property?.address
          || payload.defaults.contract_date
          || payload.defaults.notes,
        );

        setEditForm((prev) => {
          const touched = editTouchedRef.current;
          const next = { ...prev };

          if (
            payload.property?.address
            && (!touched.property_address || !prev.property_address.trim())
          ) {
            next.property_address = payload.property.street || payload.property.address;
          }

          if (
            payload.property?.number
            && (!touched.property_number || !prev.property_number.trim())
          ) {
            next.property_number = payload.property.number;
          }

          if (
            payload.property?.complement
            && (!touched.property_complement || !prev.property_complement.trim())
          ) {
            next.property_complement = payload.property.complement;
          }

          if (
            payload.property?.neighborhood
            && (!touched.property_neighborhood || !prev.property_neighborhood.trim())
          ) {
            next.property_neighborhood = payload.property.neighborhood;
          }

          if (!touched.property_city || !prev.property_city) {
            next.property_city = resolveCityOption(
              payload.property?.city ?? null,
              payload.property?.address || "",
            );
          }

          if (
            payload.defaults.contract_date
            && (!touched.contract_date || !prev.contract_date.trim())
          ) {
            next.contract_date = payload.defaults.contract_date;
          }

          if (
            payload.defaults.notes
            && (!touched.notes || !prev.notes.trim())
          ) {
            next.notes = payload.defaults.notes;
          }

          return next;
        });

        setEditLookupStatus(hasDefaults ? "loaded" : "not_found");
        setEditLookupMessage(
          hasDefaults
            ? "Dados carregados do cadastro."
            : "Codigo novo: preencha os dados do imovel.",
        );
      } catch (err: unknown) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) return;
        if (seq !== editLookupSeqRef.current) return;
        const appError = toAppError(err);
        setEditLookupStatus("error");
        setEditLookupMessage(
          appError.message || "Falha ao buscar cadastro do imovel.",
        );
      }
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [editOpen, canCreate, editForm.property_code]);

  function openCreate() {
    setCreateError(null);
    setCreateForm({
      type: "ocupacao",
      property_code: "",
      property_address: "",
      property_number: "",
      property_complement: "",
      property_neighborhood: "",
      property_city: DEFAULT_CITY,
      contract_date: "",
      notes: "",
      assigned_to: peopleInspectors[0]?.id || "",
      assigned_to_marketing: "",
    });
    setCreateTouched(INITIAL_TOUCHED_STATE);
    setCreateLookupStatus("idle");
    setCreateLookupMessage(null);
    createLookupSeqRef.current += 1;
    setCreateOpen(true);
  }

  async function submitCreate() {
    setCreateSaving(true);
    setCreateError(null);

    if (!createForm.assigned_to) {
      setCreateSaving(false);
      setCreateError("Selecione um vistoriador.");
      return;
    }

    if (createForm.type === "placa_fotos" && !createForm.assigned_to_marketing) {
      setCreateSaving(false);
      setCreateError("Selecione um marketing para Placa/Fotos.");
      return;
    }

    const propertyCode = createForm.property_code.trim();
    if (createForm.type !== "visita" && createForm.type !== "placa_fotos" && !propertyCode) {
      setCreateSaving(false);
      setCreateError("Código do imóvel é obrigatório para este tipo de vistoria.");
      return;
    }

    try {
      const fullAddress = composePropertyAddress({
        street: createForm.property_address,
        number: createForm.property_number,
        complement: createForm.property_complement,
        neighborhood: createForm.property_neighborhood,
        city: createForm.property_city,
      });
      const payload: {
        type: InspectionType;
        property_code: string;
        property_address: string;
        property_street: string;
        property_number: string | null;
        property_complement: string | null;
        property_neighborhood: string | null;
        property_city: CityOption;
        notes?: string;
        assigned_to: string;
        assigned_to_marketing?: string;
        contract_date?: string;
      } = {
        type: createForm.type,
        property_code: propertyCode,
        property_address: fullAddress,
        property_street: createForm.property_address.trim(),
        property_number: createForm.property_number.trim() || null,
        property_complement: createForm.property_complement.trim() || null,
        property_neighborhood: createForm.property_neighborhood.trim() || null,
        property_city: createForm.property_city,
        assigned_to: createForm.assigned_to,
      };

      if (createForm.assigned_to_marketing) {
        payload.assigned_to_marketing = createForm.assigned_to_marketing;
      }
      if (createForm.notes.trim()) payload.notes = createForm.notes.trim();
      if (createForm.contract_date) payload.contract_date = createForm.contract_date;

      await apiFetch("/api/inspections", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setCreateOpen(false);
      await loadInspections();
    } catch (err: unknown) {
      const appError = toAppError(err);
      setCreateError(appError.message || "Falha ao criar vistoria.");
    } finally {
      setCreateSaving(false);
    }
  }

  function openEdit(item: Inspection) {
    setEditInspection(item);
    setEditError(null);
    setEditForm({
      type: item.type,
      property_code: item.property_code,
      property_address: item.property_street || item.property_address,
      property_number: item.property_number || "",
      property_complement: item.property_complement || "",
      property_neighborhood: item.property_neighborhood || "",
      property_city: resolveCityOption(item.property_city, item.property_address),
      contract_date: item.contract_date || "",
      notes: item.notes || "",
      assigned_to: item.assigned_to,
      assigned_to_marketing: item.assigned_to_marketing || "",
    });
    setEditTouched(INITIAL_TOUCHED_STATE);
    setEditLookupStatus("idle");
    setEditLookupMessage(null);
    editLookupSeqRef.current += 1;
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!editInspection) return;

    setEditSaving(true);
    setEditError(null);

    const propertyCode = editForm.property_code.trim();
    if (editForm.type !== "visita" && editForm.type !== "placa_fotos" && !propertyCode) {
      setEditSaving(false);
      setEditError("Código do imóvel é obrigatório para este tipo de vistoria.");
      return;
    }

    try {
      const fullAddress = composePropertyAddress({
        street: editForm.property_address,
        number: editForm.property_number,
        complement: editForm.property_complement,
        neighborhood: editForm.property_neighborhood,
        city: editForm.property_city,
      });
      const payload = {
        type: editForm.type,
        property_code: propertyCode,
        property_address: fullAddress,
        property_street: editForm.property_address.trim(),
        property_number: editForm.property_number.trim() || null,
        property_complement: editForm.property_complement.trim() || null,
        property_neighborhood: editForm.property_neighborhood.trim() || null,
        property_city: editForm.property_city,
        contract_date: editForm.contract_date || null,
        notes: editForm.notes || null,
        assigned_to: editForm.assigned_to,
        assigned_to_marketing: editForm.assigned_to_marketing || null,
      };

      await apiFetch(`/api/inspections/${editInspection.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setEditOpen(false);
      setEditInspection(null);
      await loadInspections();
    } catch (err: unknown) {
      const appError = toAppError(err);
      setEditError(appError.message || "Falha ao editar solicitação.");
    } finally {
      setEditSaving(false);
    }
  }

  function sendNotification(item: Inspection, event: "assigned" | "completed" | "finalized") {
    const isAssigned = event === "assigned";
    const isFinalized = event === "finalized";

    // "finalized" and "completed" both notify the requester/manager
    const targetPhone = isAssigned
      ? item.assigned_to_person?.phone
      : item.created_by_person?.phone;
    const targetName = isAssigned
      ? item.assigned_to_person?.name || "vistoriador"
      : item.created_by_person?.name || "solicitante";
    const phoneDigits = normalizeWhatsappTarget(targetPhone);

    if (!phoneDigits) {
      alert(`WhatsApp n\u00E3o cadastrado para ${targetName}.`);
      return;
    }

    let lines: string[];

    if (isAssigned) {
      lines = [
        "\u{1F514} *Nova solicita\u00E7\u00E3o de vistoria*",
        "",
        `*\u{1F3F7}\uFE0F C\u00F3digo:* ${formatInspectionCode(item.property_code)}`,
        `*\u{1F4CC} Tipo:* ${INSPECTION_TYPE_LABEL[item.type]}`,
        `*\u{1F4CD} Endere\u00E7o:* ${item.property_address}`,
        "",
        `*\u{1F469}\u200D\u{1F4BC} Solicitante:* ${item.created_by_person?.name || "N\u00E3o informado"}`,
        `*\u{1F9F0} Vistoriador:* ${item.assigned_to_person?.name || "N\u00E3o informado"}`,
        item.contract_date
          ? `*\u23F0 Prazo:* ${formatDateOnly(item.contract_date)}`
          : null,
        item.scheduled_start
          ? `*\u{1F5D3}\uFE0F Agenda:* ${formatDateTime(item.scheduled_start)}`
          : null,
        "",
        item.notes ? `*\u{1F4DD} Obs:* ${item.notes}` : null,
      ].filter((line): line is string => Boolean(line));
    } else if (isFinalized) {
      lines = [
        "\u{1F3C1} *Vistoria finalizada!*",
        "",
        `*\u{1F3F7}\uFE0F C\u00F3digo:* ${formatInspectionCode(item.property_code)}`,
        `*\u{1F4CC} Tipo:* ${INSPECTION_TYPE_LABEL[item.type]}`,
        `*\u{1F4CD} Endere\u00E7o:* ${item.property_address}`,
        "",
        `*\u{1F9F0} Vistoriador:* ${item.assigned_to_person?.name || "N\u00E3o informado"}`,
        `*\u{1F469}\u200D\u{1F4BC} Solicitante:* ${item.created_by_person?.name || "N\u00E3o informado"}`,
        item.scheduled_start
          ? `*\u{1F5D3}\uFE0F Realizada em:* ${formatDateTime(item.scheduled_start)}`
          : null,
        item.completed_at
          ? `*\u2705 Finalizada em:* ${formatDateTime(item.completed_at)}`
          : null,
        "",
        item.notes ? `*\u{1F4DD} Observa\u00E7\u00F5es:* ${item.notes}` : null,
      ].filter((line): line is string => Boolean(line));
    } else {
      lines = [
        "\u2705 *Vistoria conclu\u00EDda*",
        "",
        "A vistoria abaixo foi realizada:",
        "",
        `*\u{1F3F7}\uFE0F C\u00F3digo:* ${formatInspectionCode(item.property_code)}`,
        `*\u{1F4CC} Tipo:* ${INSPECTION_TYPE_LABEL[item.type]}`,
        `*\u{1F4CD} Endere\u00E7o:* ${item.property_address}`,
        "",
        `*\u{1F469}\u200D\u{1F4BC} Solicitante:* ${item.created_by_person?.name || "N\u00E3o informado"}`,
        `*\u{1F9F0} Vistoriador:* ${item.assigned_to_person?.name || "N\u00E3o informado"}`,
        item.completed_at
          ? `*\u2705 Conclu\u00EDda em:* ${formatDateTime(item.completed_at)}`
          : null,
        "",
        item.notes ? `*\u{1F4DD} Observa\u00E7\u00F5es finais:* ${item.notes}` : null,
      ].filter((line): line is string => Boolean(line));
    }

    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      lines.join("\n"),
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function sendNotificationMarketing(item: Inspection) {
    const targetPhone = item.assigned_to_marketing_person?.phone;
    const targetName = item.assigned_to_marketing_person?.name || "marketing";
    const phoneDigits = normalizeWhatsappTarget(targetPhone);

    if (!phoneDigits) {
      alert(`WhatsApp n\u00E3o cadastrado para ${targetName}.`);
      return;
    }

    const lines = [
      "\u{1F4F8} *Nova solicita\u00E7\u00E3o de fotos/placas*",
      "",
      `*\u{1F3F7}\uFE0F C\u00F3digo:* ${formatInspectionCode(item.property_code)}`,
      `*\u{1F4CC} Tipo:* ${INSPECTION_TYPE_LABEL[item.type]}`,
      `*\u{1F4CD} Endere\u00E7o:* ${item.property_address}`,
      "",
      `*\u{1F469}\u200D\u{1F4BC} Solicitante:* ${item.created_by_person?.name || "N\u00E3o informado"}`,
      `*\u{1F4F8} Marketing:* ${item.assigned_to_marketing_person?.name || "N\u00E3o informado"}`,
      `*\u{1F9F0} Vistoriador:* ${item.assigned_to_person?.name || "N\u00E3o informado"}`,
      item.contract_date
        ? `*\u23F0 Prazo:* ${formatDateOnly(item.contract_date)}`
        : null,
      item.scheduled_start
        ? `*\u{1F5D3}\uFE0F Agenda:* ${formatDateTime(item.scheduled_start)}`
        : null,
      "",
      item.notes ? `*\u{1F4DD} Obs:* ${item.notes}` : null,
    ].filter((line): line is string => Boolean(line));

    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
      lines.join("\n"),
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openSchedule(item: Inspection) {
    setScheduleInspection(item);
    setScheduleMode("new");
    setScheduleError(null);
    setFreeSlots([]);
    setFreeSlotsLoading(false);

    // Look up historical duration for same property + type
    const historical = inspections
      .filter(
        (ins) =>
          ins.id !== item.id &&
          ins.property_code === item.property_code &&
          ins.type === item.type &&
          (ins.status === "completed" || ins.status === "finalized") &&
          typeof ins.duration_minutes === "number" &&
          ins.duration_minutes > 0,
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];

    if (historical?.duration_minutes) {
      setScheduleDuration(historical.duration_minutes);
      setScheduleHistoricalHint(
        `⏱ Duração anterior: ${historical.duration_minutes} min (${INSPECTION_TYPE_LABEL[historical.type]})`,
      );
    } else {
      setScheduleDuration(60);
      setScheduleHistoricalHint(null);
    }

    setScheduleStartLocal(suggestInitialScheduleLocal());
    setScheduleOpen(true);
  }

  function openReschedule(item: Inspection) {
    setScheduleInspection(item);
    setScheduleMode("reschedule");
    setScheduleError(null);
    setFreeSlots([]);
    setFreeSlotsLoading(false);
    // Pre-fill with current scheduled values if available
    const duration = item.duration_minutes ?? 60;
    setScheduleDuration(duration);
    if (item.scheduled_start) {
      setScheduleStartLocal(toDatetimeLocalValue(new Date(item.scheduled_start)));
    } else {
      setScheduleStartLocal(suggestInitialScheduleLocal());
    }
    setScheduleOpen(true);
  }

  async function refreshFreeSlots() {
    if (!scheduleStartLocal) return;

    setFreeSlotsLoading(true);
    setScheduleError(null);

    try {
      const base = new Date(scheduleStartLocal);
      const now = new Date();
      const isToday =
        base.getFullYear() === now.getFullYear() &&
        base.getMonth() === now.getMonth() &&
        base.getDate() === now.getDate();

      // Fetch inspector work schedule (if inspector is assigned)
      const inspectorId = scheduleInspection?.assigned_to ?? actor?.id;
      let workSch = {
        work_start: 8, work_start_min: 0,
        lunch_start: 12, lunch_start_min: 0,
        lunch_end: 13, lunch_end_min: 0,
        work_end: 18, work_end_min: 0,
      };
      if (inspectorId) {
        try {
          const schPayload = await apiFetch(`/api/people/${inspectorId}/schedule`);
          if (schPayload.schedule) workSch = schPayload.schedule;
        } catch {
          // Use defaults
        }
      }

      const y = base.getFullYear();
      const m = base.getMonth();
      const d = base.getDate();

      const rawMorningStart = new Date(y, m, d, workSch.work_start, workSch.work_start_min, 0, 0);
      const morningEnd     = new Date(y, m, d, workSch.lunch_start, workSch.lunch_start_min, 0, 0);
      const afternoonStart = new Date(y, m, d, workSch.lunch_end, workSch.lunch_end_min, 0, 0);
      const dayEnd         = new Date(y, m, d, workSch.work_end, workSch.work_end_min, 0, 0);

      // When today: skip past times
      const morningStart = isToday && now > rawMorningStart
        ? new Date(now.getTime() + 60_000)
        : rawMorningStart;

      // Fetch calendar events for the whole day
      const qs = new URLSearchParams({
        from: morningStart.toISOString(),
        to: dayEnd.toISOString(),
      });
      const payload = await apiFetch(`/api/calendar?${qs.toString()}`);
      const events = parseCalendarEvents(payload);

      // Compute slots for morning and afternoon separately (lunch excluded)
      const morningSlots = morningStart < morningEnd
        ? computeFreeSlots({ dayStart: morningStart, dayEnd: morningEnd, events, minMinutes: scheduleDuration })
        : [];
      const afternoonSlots = computeFreeSlots({ dayStart: afternoonStart, dayEnd: dayEnd, events, minMinutes: scheduleDuration });

      setFreeSlots([...morningSlots, ...afternoonSlots]);
    } catch (err: unknown) {
      const appError = toAppError(err);
      setScheduleError(appError.message || "Erro ao calcular horários livres");
    } finally {
      setFreeSlotsLoading(false);
    }
  }

  useEffect(() => {
    if (!scheduleOpen) return;
    refreshFreeSlots().catch(() => {
      setScheduleError("Erro ao calcular horários livres");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleOpen, scheduleStartLocal, scheduleDuration]);

  async function submitSchedule() {
    if (!scheduleInspection) return;

    setScheduleError(null);

    try {
      const start = new Date(scheduleStartLocal);
      if (Number.isNaN(start.getTime())) {
        setScheduleError("Informe uma data/hora válida para o início.");
        return;
      }
      if (!Number.isInteger(scheduleDuration) || scheduleDuration < 15 || scheduleDuration > 480) {
        setScheduleError("A duração deve ser entre 15 e 480 minutos.");
        return;
      }
      const tzOffset = start.getTimezoneOffset();

      const endpoint =
        scheduleMode === "reschedule"
          ? `/api/inspections/${scheduleInspection.id}/reschedule`
          : `/api/inspections/${scheduleInspection.id}/receive`;

      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          scheduled_start: start.toISOString(),
          duration_minutes: scheduleDuration,
          tz_offset_minutes: tzOffset,
        }),
      });

      setScheduleOpen(false);
      setScheduleInspection(null);
      await loadInspections();
    } catch (err: unknown) {
      const appError = toAppError(err);
      const suggestedStart = extractSuggestedStart(appError.details);

      if (appError.status === 409 && suggestedStart) {
        const suggested = new Date(suggestedStart);
        setScheduleError(`${appError.message} Sugestao aplicada no campo.`);
        setScheduleStartLocal(toDatetimeLocalValue(suggested));
        return;
      }

      setScheduleError(
        appError.message ||
          (scheduleMode === "reschedule"
            ? "Falha ao reagendar vistoria."
            : "Falha ao agendar vistoria."),
      );
    }
  }

  async function updateStatus(
    item: Inspection,
    status: "new" | "received" | "in_progress" | "completed" | "awaiting_contract" | "finalized" | "canceled",
  ) {
    try {
      await apiFetch(`/api/inspections/${item.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await loadInspections();
    } catch (err: unknown) {
      const appError = toAppError(err);
      alert(appError.message || "Falha ao atualizar status.");
    }
  }

  async function finalizeDirect(item: Inspection) {
    const confirmed = window.confirm(
      "Finalizar direto sem agendamento? Use esta opção para vistoria antiga já realizada.",
    );
    if (!confirmed) return;
    await updateStatus(item, "finalized");
  }

  async function deleteInspection(item: Inspection) {
    if (!canDeleteOwnInspection(item)) return;

    const confirmed = window.confirm(
      "Deseja excluir esta solicitacao? Esta acao nao pode ser desfeita.",
    );
    if (!confirmed) return;

    setDeletingInspectionId(item.id);
    setError(null);

    try {
      await apiFetch(`/api/inspections/${item.id}`, {
        method: "DELETE",
      });
      await loadInspections();
    } catch (err: unknown) {
      const appError = toAppError(err);
      alert(appError.message || "Falha ao excluir solicitacao.");
    } finally {
      setDeletingInspectionId((current) => (current === item.id ? null : current));
    }
  }

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[var(--card)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(680px_circle_at_100%_0%,rgba(0,103,252,0.1),transparent_56%),radial-gradient(520px_circle_at_0%_100%,rgba(0,37,206,0.06),transparent_62%)]" />

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Painel Operacional
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Vistorias
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-blue-700">
                {pendingCount} pendente(s)
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                {inspections.length} no filtro atual
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {canCreate && (
              <Button variant="primary" onClick={openCreate} className="w-full">
                + Nova vistoria
              </Button>
            )}

            {actor?.role !== "inspector" && actor?.role !== "marketing" && (
              <>
                <select
                  value={selectedInspectorId}
                  onChange={(event) => setSelectedInspectorId(event.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm"
                >
                  <option value="">Todos vistoriadores</option>
                  {peopleInspectors.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedManagerId}
                  onChange={(event) => setSelectedManagerId(event.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm"
                >
                  <option value="">Todos solicitantes</option>
                  {peopleManagers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm"
            >
              <option value="">Todos status</option>
              <option value="new">Nova</option>
              <option value="received">Recebida</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluída</option>
              <option value="awaiting_contract">Sem Contrato</option>
              <option value="finalized">Finalizada</option>
              <option value="canceled">Cancelada</option>
            </select>

            <Button variant="secondary" onClick={() => loadInspections()} className="w-full">
              Atualizar
            </Button>
          </div>
        </div>
      </div>


      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(139,92,246,0.18)", color: "#c4b5fd", boxShadow: "0 0 0 1px rgba(139,92,246,0.4)" }}>Nova</span>
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(59,130,246,0.18)", color: "#93c5fd", boxShadow: "0 0 0 1px rgba(59,130,246,0.4)" }}>Recebida</span>
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(245,158,11,0.18)", color: "#fcd34d", boxShadow: "0 0 0 1px rgba(245,158,11,0.4)" }}>Em andamento</span>
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(249,115,22,0.18)", color: "#fdba74", boxShadow: "0 0 0 1px rgba(249,115,22,0.4)" }}>Sem Contrato</span>
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(16,185,129,0.18)", color: "#6ee7b7", boxShadow: "0 0 0 1px rgba(16,185,129,0.4)" }}>Concluída</span>
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "#065f46", color: "#a7f3d0", boxShadow: "0 0 0 1px #047857" }}>Finalizada</span>
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(100,116,139,0.18)", color: "#94a3b8", boxShadow: "0 0 0 1px rgba(100,116,139,0.35)" }}>Cancelada</span>
          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(251,191,36,0.22)", color: "#fbbf24", boxShadow: "0 0 0 1px rgba(251,191,36,0.5)" }}>⏳ Aguardando recebimento</span>

          {/* Seletor de Mês */}
          <div className="ml-auto flex items-center bg-white rounded-lg border border-slate-200 shadow-sm p-1 gap-1">
            <button onClick={handlePrevMonth} className="px-2 py-1 hover:bg-slate-100 rounded text-slate-600 font-bold">&lsaquo;</button>
            <span className="text-sm font-semibold text-slate-700 min-w-[100px] text-center">
              {monthNames[selectedMonth - 1]} {selectedYear}
            </span>
            <button onClick={handleNextMonth} className="px-2 py-1 hover:bg-slate-100 rounded text-slate-600 font-bold">&rsaquo;</button>
          </div>

          <div className="ml-4 flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === "list"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === "kanban"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                Kanban
              </button>
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">Carregando...</p>}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">{error}</p>
            {sessionInvalid && (
              <div className="mt-3">
                <Button size="sm" onClick={goSelectActor}>
                  Selecionar pessoa novamente
                </Button>
              </div>
            )}
          </div>
        )}

        {!actor && !loading && !error && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              Modo consulta: selecione um usuário para criar, receber ou atualizar vistorias.
            </p>
            <div className="mt-3">
              <Button size="sm" onClick={() => router.push("/")}>
                Selecionar usuário
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && displayInspections.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="mx-auto mb-3 h-11 w-11 rounded-xl bg-blue-100 text-xl leading-[44px] text-blue-700">
              i
            </div>
            <p className="text-base font-semibold text-slate-800">
              Nenhuma vistoria encontrada
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Ajuste os filtros ou registre uma nova vistoria para iniciar o fluxo.
            </p>
            {canCreate && (
              <div className="mt-4">
                <Button variant="primary" onClick={openCreate}>
                  + Criar primeira vistoria
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4">
          {viewMode === "list" && displayInspections.map((item) => {
            let deadlineMeta: DeadlineMeta | null = null;
            if (item.type === "desocupacao") {
              deadlineMeta = getDesocupacaoDeadlineMeta(item);
            } else if (item.contract_date) {
              deadlineMeta = getDeadlineMeta(item.type, item.contract_date, item.status, item.received_at ?? null);
            } else if (item.type !== "ocupacao" && !item.received_at && item.status === "new") {
              deadlineMeta = { dateText: "", counterText: "⏳ Aguardando recebimento", toneClass: "border-amber-300 bg-amber-100 text-amber-800" };
            }

            const mapUrl = buildGoogleMapsSearchUrl(item.property_address);

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-[var(--card-soft)] p-4 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">
                        {formatInspectionCode(item.property_code)} - {INSPECTION_TYPE_LABEL[item.type]}
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-600">
                      {item.property_address}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-relaxed text-slate-500">
                      <span>Registro: {formatDateTime(item.created_at)}</span>
                      {item.created_by_person?.name && (
                        <span>Solicitante: {item.created_by_person.name}</span>
                      )}
                      {deadlineMeta && <span>Prazo: {deadlineMeta.dateText}</span>}
                      {item.scheduled_start && item.scheduled_end && item.duration_minutes ? (
                        <span>
                          Agenda: {formatDateTime(item.scheduled_start)} (
                          {item.duration_minutes} min)
                        </span>
                      ) : null}
                      {canCreate && item.assigned_to_person?.name && (
                        <span>Vistoriador: {item.assigned_to_person.name}</span>
                      )}
                      {canCreate && item.assigned_to_marketing_person?.name && (
                        <span>Marketing: {item.assigned_to_marketing_person.name}</span>
                      )}
                    </div>
                    {deadlineMeta && (
                      <div
                        className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${deadlineMeta.toneClass}`}
                      >
                        {deadlineMeta.counterText}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canSchedule &&
                      item.status === "new" &&
                      isAssignedToMe(item) && (
                        <>
                          <Button size="sm" onClick={() => openSchedule(item)}>
                            Receber / Agendar
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => finalizeDirect(item)}
                          >
                            Finalizar direto
                          </Button>
                        </>
                      )}

                    {canSchedule && item.status === "received" && (
                      <>
                        <Button size="sm" onClick={() => updateStatus(item, "in_progress")}>
                          Iniciar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (window.confirm("Devolver para Nova? O agendamento será removido.")) {
                              updateStatus(item, "new");
                            }
                          }}
                        >
                          Devolver p/ nova
                        </Button>
                      </>
                    )}

                    {canSchedule && item.status === "in_progress" && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => updateStatus(item, "received")}>
                          Voltar p/ recebida
                        </Button>
                        <Button size="sm" onClick={() => updateStatus(item, "completed")}>
                          Concluída
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateStatus(item, "finalized")}
                        >
                          Finalizada
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (window.confirm("Devolver para Nova? O agendamento será removido.")) {
                              updateStatus(item, "new");
                            }
                          }}
                        >
                          Devolver p/ nova
                        </Button>
                      </>
                    )}

                    {canSchedule &&
                      item.status === "completed" &&
                      isAssignedToMe(item) && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              if (window.confirm("Voltar para Recebida? A data de conclusão será removida.")) {
                                updateStatus(item, "received");
                              }
                            }}
                          >
                            Voltar p/ recebida
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              if (window.confirm("Voltar para Em andamento? A data de conclusão será removida.")) {
                                updateStatus(item, "in_progress");
                              }
                            }}
                          >
                            Voltar p/ andamento
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => updateStatus(item, "finalized")}
                          >
                            Finalizar agora
                          </Button>
                        </>
                      )}

                    {canSchedule &&
                      (item.status === "completed" || item.status === "finalized") &&
                      isAssignedToMe(item) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => sendNotification(item, "completed")}
                        >
                          Notificar solicitante
                        </Button>
                      )}

                    {canManageOwnInspection(item) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(item)}
                      >
                        Editar
                      </Button>
                    )}

                    {canDeleteOwnInspection(item) && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteInspection(item)}
                        disabled={deletingInspectionId === item.id}
                      >
                        {deletingInspectionId === item.id ? "Excluindo..." : "Excluir"}
                      </Button>
                    )}

                    {mapUrl && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openAddressInMap(item.property_address)}
                      >
                        Mapa
                      </Button>
                    )}

                    {canCreate &&
                      (item.status === "received" || item.status === "in_progress") && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (window.confirm("Devolver para Nova? O agendamento será removido.")) {
                              updateStatus(item, "new");
                            }
                          }}
                        >
                          Devolver p/ nova
                        </Button>
                      )}

                    {canCreate &&
                      item.status !== "canceled" &&
                      item.status !== "completed" &&
                      item.status !== "finalized" && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => updateStatus(item, "canceled")}
                        >
                          Cancelar
                        </Button>
                      )}
                  </div>
                </div>

                {item.notes && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Observações
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{item.notes}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {viewMode === "kanban" && (
          <div
            ref={kanbanScrollRef}
            onMouseDown={handleKanbanMouseDown}
            onMouseLeave={handleKanbanMouseLeaveOrUp}
            onMouseUp={handleKanbanMouseLeaveOrUp}
            onMouseMove={handleKanbanMouseMove}
            className={`mt-6 flex gap-4 overflow-x-auto pb-4 custom-scrollbar select-none ${isKanbanDragging ? "cursor-grabbing" : "cursor-grab"}`}
          >
            {[
              { id: "new", label: "Novas" },
              { id: "received", label: "Recebidas" },
              { id: "in_progress", label: "Em andamento" },
              { id: "awaiting_contract", label: "Sem Contrato" },
              { id: "completed", label: "Concluídas" },
              { id: "finalized", label: "Finalizadas" },
              { id: "canceled", label: "Canceladas" }
            ]
              .filter(col => {
                if (col.id === "finalized" && statusFilter !== "finalized") return false;
                // For field workers (inspector/marketing): hide completed AND finalized from kanban — they appear in the bottom list
                const isFieldWorker = actor?.role === "inspector" || actor?.role === "marketing";
                if (isFieldWorker && (col.id === "completed" || col.id === "finalized")) return false;
                if (col.id === "completed" && statusFilter !== "completed" && !isFieldWorker) return false;
                return true;
              })
              .map(column => {
                const colItems = displayInspections.filter(i => i.status === column.id);
                return (
                  <div key={column.id} className="flex-shrink-0 w-[340px] min-w-[340px] bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="font-semibold text-slate-700 text-sm">{column.label}</h3>
                      <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">
                        {colItems.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 overflow-y-auto max-h-[70vh] px-1 custom-scrollbar">
                      {colItems.map(item => {
                        let deadlineMeta: DeadlineMeta | null = null;
                        if (item.type === "desocupacao") {
                          deadlineMeta = getDesocupacaoDeadlineMeta(item);
                        } else if (item.contract_date) {
                          deadlineMeta = getDeadlineMeta(item.type, item.contract_date, item.status, item.received_at ?? null);
                        } else if (item.type !== "ocupacao" && !item.received_at && item.status === "new") {
                          deadlineMeta = { dateText: "", counterText: "⏳ Aguardando recebimento", toneClass: "border-amber-300 bg-amber-100 text-amber-800" };
                        }
                        const mapUrl = buildGoogleMapsSearchUrl(item.property_address);

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-slate-200 bg-[var(--card-soft)] p-4 shadow-sm transition hover:border-slate-300"
                          >
                            <div className="flex flex-col gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">
                                    {formatInspectionCode(item.property_code)} - {INSPECTION_TYPE_LABEL[item.type]}
                                  </div>
                                  <StatusBadge status={item.status} />
                                </div>
                                <div className="mt-1 truncate text-sm text-slate-600">
                                  {item.property_address}
                                </div>
                                <div className="mt-2 flex flex-col gap-y-1 text-[12px] leading-relaxed text-slate-500">
                                  <span>Registro: {formatDateTime(item.created_at)}</span>
                                  {item.created_by_person?.name && (
                                    <span>Solicitante: {item.created_by_person.name}</span>
                                  )}
                                  {deadlineMeta && <span>Prazo: {deadlineMeta.dateText}</span>}
                                  {item.scheduled_start && item.scheduled_end && item.duration_minutes ? (
                                    <span>
                                      Agenda: {formatDateTime(item.scheduled_start)} ({item.duration_minutes} min)
                                    </span>
                                  ) : null}
                                  {canCreate && item.assigned_to_person?.name && (
                                    <span>Vistoriador: {item.assigned_to_person.name}</span>
                                  )}
                                </div>
                                {deadlineMeta && (
                                  <div
                                    className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${deadlineMeta.toneClass}`}
                                  >
                                    {deadlineMeta.counterText}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                {canSchedule &&
                                  item.status === "new" &&
                                  isAssignedToMe(item) && (
                                    <>
                                      <Button size="sm" onClick={() => openSchedule(item)}>
                                        Agendar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => finalizeDirect(item)}
                                      >
                                        Finalizar
                                      </Button>
                                    </>
                                  )}

                                {canSchedule &&
                                  (item.status === "received" || item.status === "in_progress") &&
                                  isAssignedToMe(item) && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => openReschedule(item)}
                                    >
                                      Reagendar
                                    </Button>
                                  )}

                                {canSchedule && item.status === "received" && (
                                  <>
                                    <Button size="sm" onClick={() => updateStatus(item, "in_progress")}>
                                      Iniciar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => {
                                        if (window.confirm("Devolver para Nova? O agendamento será removido.")) {
                                          updateStatus(item, "new");
                                        }
                                      }}
                                    >
                                      Devolver p/ nova
                                    </Button>
                                  </>
                                )}

                                {canSchedule && item.status === "in_progress" && (
                                  <>
                                    <Button size="sm" variant="secondary" onClick={() => updateStatus(item, "received")}>
                                      Voltar p/ recebida
                                    </Button>
                                    {item.type === "ocupacao" && (
                                      <Button size="sm" variant="secondary" onClick={() => updateStatus(item, "awaiting_contract")}>
                                        Sem Contrato
                                      </Button>
                                    )}
                                    <Button size="sm" onClick={() => updateStatus(item, "completed")}>
                                      Concluída
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => updateStatus(item, "finalized")}
                                    >
                                      Finalizada
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => {
                                        if (window.confirm("Devolver para Nova? O agendamento será removido.")) {
                                          updateStatus(item, "new");
                                        }
                                      }}
                                    >
                                      Devolver p/ nova
                                    </Button>
                                  </>
                                )}

                                {canSchedule &&
                                  item.status === "awaiting_contract" &&
                                  isAssignedToMe(item) && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => updateStatus(item, "in_progress")}
                                    >
                                      Voltar p/ andamento
                                    </Button>
                                  )}

                                {canSchedule &&
                                  item.status === "completed" &&
                                  isAssignedToMe(item) && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                          if (window.confirm("Voltar para Recebida? A data de conclusão será removida.")) {
                                            updateStatus(item, "received");
                                          }
                                        }}
                                      >
                                        Voltar p/ recebida
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                          if (window.confirm("Voltar para Em andamento? A data de conclusão será removida.")) {
                                            updateStatus(item, "in_progress");
                                          }
                                        }}
                                      >
                                        Voltar p/ andamento
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateStatus(item, "finalized")}
                                      >
                                        Finalizar agora
                                      </Button>
                                    </>
                                  )}

                                {canSchedule &&
                                  (item.status === "completed" || item.status === "finalized") &&
                                  isAssignedToMe(item) && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() =>
                                        sendNotification(
                                          item,
                                          item.status === "finalized" ? "finalized" : "completed",
                                        )
                                      }
                                    >
                                      {item.status === "finalized" ? "📱 Avisar gestora" : "📱 Notificar req"}
                                    </Button>
                                  )}

                                {canSchedule &&
                                  item.status === "awaiting_contract" &&
                                  isAssignedToMe(item) && (
                                    <Button
                                      size="sm"
                                      onClick={() => updateStatus(item, "completed")}
                                    >
                                      Contrato Recebido
                                    </Button>
                                  )}

                                {canManageOwnInspection(item) && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => openEdit(item)}
                                  >
                                    Editar
                                  </Button>
                                )}

                                {canDeleteOwnInspection(item) && (
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => deleteInspection(item)}
                                    disabled={deletingInspectionId === item.id}
                                  >
                                    {deletingInspectionId === item.id ? "Excluindo..." : "Excluir"}
                                  </Button>
                                )}

                                {canCreate && item.status === "new" && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => sendNotification(item, "assigned")}
                                  >
                                    📱 Notificar vistoriador
                                  </Button>
                                )}

                                {canCreate && item.status === "new" && item.assigned_to_marketing_person && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => sendNotificationMarketing(item)}
                                  >
                                    📱 Notificar marketing
                                  </Button>
                                )}

                                {mapUrl && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => openAddressInMap(item.property_address)}
                                  >
                                    Mapa
                                  </Button>
                                )}

                                {canCreate &&
                                  (item.status === "received" || item.status === "in_progress") && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => {
                                        if (window.confirm("Devolver para Nova? O agendamento será removido.")) {
                                          updateStatus(item, "new");
                                        }
                                      }}
                                    >
                                      Devolver p/ nova
                                    </Button>
                                  )}

                                {canCreate &&
                                  item.status !== "canceled" &&
                                  item.status !== "completed" &&
                                  item.status !== "awaiting_contract" &&
                                  item.status !== "finalized" && (
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      onClick={() => updateStatus(item, "canceled")}
                                    >
                                      Cancelar
                                    </Button>
                                  )}
                              </div>
                            </div>

                            {item.notes && (
                              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                                <div className="text-[11px] font-semibold text-slate-500">
                                  Observações
                                </div>
                                <div className="mt-1 whitespace-pre-wrap">{item.notes}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Vistoriador Completed List (BOTTOM OF SCREEN) */}
        {actor?.role === "inspector" && inspectorCompletedInspections.length > 0 && (
          <div className="mt-12 mb-8 bg-slate-50 border-t border-slate-200 pt-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4 px-2">Vistorias Concluídas / Finalizadas ({inspectorCompletedInspections.length})</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayInspectorCompleted.map(item => {
                const isCompleted = item.status === "completed";
                const cardBorder = isCompleted ? "border-emerald-200" : "border-blue-200";
                const cardBg = isCompleted ? "bg-emerald-50" : "bg-blue-50";
                const leftBar = isCompleted ? "bg-emerald-400" : "bg-blue-400";
                const badgeClass = isCompleted
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : "bg-blue-100 text-blue-700 border border-blue-200";
                const badgeLabel = isCompleted ? "Concluída" : "Finalizada";
                return (
                  <div key={item.id} className={`flex rounded-2xl overflow-hidden border shadow-sm transition hover:shadow-md ${cardBorder}`}>
                    {/* Colored left bar */}
                    <div className={`w-1.5 flex-shrink-0 ${leftBar}`} />
                    <div className={`flex-1 p-4 min-w-0 ${cardBg}`}>
                      {/* Title row: badge beside title but title wraps */}
                      <div className="mb-1.5">
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                          <div className="text-[15px] font-semibold text-slate-900 leading-snug">
                            {formatInspectionCode(item.property_code)} — {INSPECTION_TYPE_LABEL[item.type]}
                          </div>
                        </div>
                      </div>
                      {/* Address — allow 2 lines before clipping */}
                      <div className="text-sm text-slate-600 mb-2 line-clamp-2 leading-snug">
                        {item.property_address}
                      </div>
                      {item.completed_at && (
                        <div className="text-xs text-slate-500 mb-3">
                          {isCompleted ? "Concluída" : "Finalizada"} em: {formatDateTime(item.completed_at)}
                        </div>
                      )}
                      {/* Revert buttons — available for both completed and finalized */}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => updateStatus(item, "in_progress")}>
                          Voltar p/ andamento
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => updateStatus(item, "received")}>
                          Voltar p/ recebida
                        </Button>
                        {/* WhatsApp: avisar gestora que a vistoria foi realizada */}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            sendNotification(
                              item,
                              item.status === "finalized" ? "finalized" : "completed",
                            )
                          }
                        >
                          📱 Avisar gestora
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {completedLimit < inspectorCompletedInspections.length && (
              <div className="mt-6 flex justify-center">
                <Button size="sm" variant="secondary" onClick={() => setCompletedLimit(l => l + 10)}>
                  Carregar mais...
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        title="Nova vistoria (solicitante)"
        onClose={() => setCreateOpen(false)}
      >
        <div className="grid gap-4">
          {createError && <p className="text-sm text-red-700">{createError}</p>}

          {peopleInspectors.length === 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Cadastre pelo menos um vistoriador na tela Pessoas.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Tipo</span>
              <select
                value={createForm.type}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    type: event.target.value as InspectionType,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="ocupacao">Ocupação</option>
                <option value="desocupacao">Desocupação</option>
                <option value="revistoria">Revistoria</option>
                <option value="visita">Visita</option>
                <option value="placa_fotos">Placa/Fotos</option>
                <option value="manutencao">Manutenção</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                {createForm.type === "visita" || createForm.type === "placa_fotos"
                  ? "Código do imóvel (opcional para visita/placa-fotos)"
                  : "Código do imóvel"}
              </span>
              <input
                value={createForm.property_code}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    property_code: event.target.value,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder={
                  createForm.type === "visita" || createForm.type === "placa_fotos"
                    ? "Opcional em visitas e placa/fotos"
                    : undefined
                }
              />
              {createLookupMessage && (
                <span
                  className={[
                    "text-xs",
                    createLookupStatus === "error"
                      ? "text-red-700"
                      : createLookupStatus === "loaded"
                        ? "text-emerald-700"
                        : "text-slate-500",
                  ].join(" ")}
                >
                  {createLookupMessage}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">Endereço</span>
            <input
              value={createForm.property_address}
              onChange={(event) =>
                setCreateForm((prev) => {
                  markCreateFieldTouched("property_address");
                  return {
                    ...prev,
                    property_address: event.target.value,
                  };
                })
              }
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Número (opcional)
              </span>
              <input
                value={createForm.property_number}
                onChange={(event) =>
                  setCreateForm((prev) => {
                    markCreateFieldTouched("property_number");
                    return {
                      ...prev,
                      property_number: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Ex.: 123"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Complemento (opcional)
              </span>
              <input
                value={createForm.property_complement}
                onChange={(event) =>
                  setCreateForm((prev) => {
                    markCreateFieldTouched("property_complement");
                    return {
                      ...prev,
                      property_complement: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Ex.: Apto 201"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Bairro (opcional)
              </span>
              <input
                value={createForm.property_neighborhood}
                onChange={(event) =>
                  setCreateForm((prev) => {
                    markCreateFieldTouched("property_neighborhood");
                    return {
                      ...prev,
                      property_neighborhood: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Ex.: Centro"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Cidade</span>
              <select
                value={createForm.property_city}
                onChange={(event) =>
                  setCreateForm((prev) => {
                    markCreateFieldTouched("property_city");
                    return {
                      ...prev,
                      property_city: event.target.value as CityOption,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {CITY_OPTIONS.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                openAddressInMap(
                  composePropertyAddress({
                    street: createForm.property_address,
                    number: createForm.property_number,
                    complement: createForm.property_complement,
                    neighborhood: createForm.property_neighborhood,
                    city: createForm.property_city,
                  }),
                )
              }
              disabled={!createMapUrl}
            >
              Ver no mapa
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Prazo da vistoria (opcional)
              </span>
              <input
                type="datetime-local"
                value={createForm.contract_date}
                onChange={(event) =>
                  setCreateForm((prev) => {
                    markCreateFieldTouched("contract_date");
                    return {
                      ...prev,
                      contract_date: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Vistoriador
              </span>
              <select
                value={createForm.assigned_to}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    assigned_to: event.target.value,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione...</option>
                {peopleInspectors.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
            {createForm.type === "placa_fotos" && (
              <div className="grid gap-1.5">
                <span className="text-[13px] font-semibold text-slate-700">
                  Marketing (Fotos)
                </span>
                <select
                  value={createForm.assigned_to_marketing}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      assigned_to_marketing: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Selecione...</option>
                  {peopleMarketing.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">
              Observações (opcional)
            </span>
            <textarea
              value={createForm.notes}
              onChange={(event) =>
                setCreateForm((prev) => {
                  markCreateFieldTouched("notes");
                  return { ...prev, notes: event.target.value };
                })
              }
              className="min-h-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submitCreate}
              disabled={createSaving || peopleInspectors.length === 0}
            >
              {createSaving ? "Salvando..." : "Criar vistoria"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        title="Editar solicitação"
        onClose={() => setEditOpen(false)}
      >
        <div className="grid gap-4">
          {editError && <p className="text-sm text-red-700">{editError}</p>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Tipo</span>
              <select
                value={editForm.type}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    type: event.target.value as InspectionType,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="ocupacao">Ocupação</option>
                <option value="desocupacao">Desocupação</option>
                <option value="revistoria">Revistoria</option>
                <option value="visita">Visita</option>
                <option value="placa_fotos">Placa/Fotos</option>
                <option value="manutencao">Manutenção</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                {editForm.type === "visita" || editForm.type === "placa_fotos"
                  ? "Código do imóvel (opcional para visita/placa-fotos)"
                  : "Código do imóvel"}
              </span>
              <input
                value={editForm.property_code}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    property_code: event.target.value,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder={
                  editForm.type === "visita" || editForm.type === "placa_fotos"
                    ? "Opcional em visitas e placa/fotos"
                    : undefined
                }
              />
              {editLookupMessage && (
                <span
                  className={[
                    "text-xs",
                    editLookupStatus === "error"
                      ? "text-red-700"
                      : editLookupStatus === "loaded"
                        ? "text-emerald-700"
                        : "text-slate-500",
                  ].join(" ")}
                >
                  {editLookupMessage}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">Endereço</span>
            <input
              value={editForm.property_address}
              onChange={(event) =>
                setEditForm((prev) => {
                  markEditFieldTouched("property_address");
                  return {
                    ...prev,
                    property_address: event.target.value,
                  };
                })
              }
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Número (opcional)
              </span>
              <input
                value={editForm.property_number}
                onChange={(event) =>
                  setEditForm((prev) => {
                    markEditFieldTouched("property_number");
                    return {
                      ...prev,
                      property_number: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Ex.: 123"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Complemento (opcional)
              </span>
              <input
                value={editForm.property_complement}
                onChange={(event) =>
                  setEditForm((prev) => {
                    markEditFieldTouched("property_complement");
                    return {
                      ...prev,
                      property_complement: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Ex.: Apto 201"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Bairro (opcional)
              </span>
              <input
                value={editForm.property_neighborhood}
                onChange={(event) =>
                  setEditForm((prev) => {
                    markEditFieldTouched("property_neighborhood");
                    return {
                      ...prev,
                      property_neighborhood: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Ex.: Centro"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Cidade</span>
              <select
                value={editForm.property_city}
                onChange={(event) =>
                  setEditForm((prev) => {
                    markEditFieldTouched("property_city");
                    return {
                      ...prev,
                      property_city: event.target.value as CityOption,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {CITY_OPTIONS.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                openAddressInMap(
                  composePropertyAddress({
                    street: editForm.property_address,
                    number: editForm.property_number,
                    complement: editForm.property_complement,
                    neighborhood: editForm.property_neighborhood,
                    city: editForm.property_city,
                  }),
                )
              }
              disabled={!editMapUrl}
            >
              Ver no mapa
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Prazo da vistoria (opcional)
              </span>
              <input
                type="datetime-local"
                value={editForm.contract_date}
                onChange={(event) =>
                  setEditForm((prev) => {
                    markEditFieldTouched("contract_date");
                    return {
                      ...prev,
                      contract_date: event.target.value,
                    };
                  })
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Vistoriador
              </span>
              <select
                value={editForm.assigned_to}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    assigned_to: event.target.value,
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione...</option>
                {peopleInspectors.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
            {editForm.type === "placa_fotos" && (
              <div className="grid gap-1.5">
                <span className="text-[13px] font-semibold text-slate-700">
                  Marketing (Fotos)
                </span>
                <select
                  value={editForm.assigned_to_marketing}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      assigned_to_marketing: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Selecione...</option>
                  {peopleMarketing.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">
              Observações (opcional)
            </span>
            <textarea
              value={editForm.notes}
              onChange={(event) =>
                setEditForm((prev) => {
                  markEditFieldTouched("notes");
                  return { ...prev, notes: event.target.value };
                })
              }
              className="min-h-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitEdit} disabled={editSaving}>
              {editSaving ? "Salvando..." : "Salvar edição"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={scheduleOpen}
        title={scheduleMode === "reschedule" ? "Reagendar vistoria" : "Receber / agendar (vistoriador)"}
        onClose={() => { setScheduleOpen(false); setScheduleHistoricalHint(null); }}
      >
        <div className="grid gap-4">
          {scheduleInspection && (
            <div className="rounded-xl bg-black/5 p-3 text-sm">
              <div className="font-semibold">
                {formatInspectionCode(scheduleInspection.property_code)} -
                {` ${INSPECTION_TYPE_LABEL[scheduleInspection.type]}`}
              </div>
              <div className="text-[12px] text-[var(--muted)]">
                {scheduleInspection.property_address}
              </div>
              {scheduleInspection.notes && (
                <div className="mt-2 text-[12px] break-words whitespace-pre-wrap text-slate-700 bg-white/50 p-2 rounded-md border border-black/5">
                  <span className="font-semibold block mb-0.5">Observações:</span>
                  {scheduleInspection.notes}
                </div>
              )}
            </div>
          )}

          {scheduleError && <p className="text-sm text-red-700">{scheduleError}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Início
              </span>
              <input
                type="datetime-local"
                step={60}
                value={scheduleStartLocal}
                onChange={(event) => setScheduleStartLocal(event.target.value)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <span className="text-[11px] text-slate-500">
                Seg-Sex 08:00-18:00
              </span>
            </label>

            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">
                Duração (min)
              </span>
              {scheduleHistoricalHint && (
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                  {scheduleHistoricalHint}
                  <span className="ml-auto text-amber-500 cursor-pointer" onClick={() => setScheduleHistoricalHint(null)}>✕</span>
                </div>
              )}
              <input
                type="number"
                min={15}
                step={15}
                value={scheduleDuration}
                onChange={(event) =>
                  setScheduleDuration(
                    normalizeScheduleDuration(Number(event.target.value || 60)),
                  )
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {SCHEDULE_DURATION_PRESETS.map((minutes) => {
                  const isActive = scheduleDuration === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => setScheduleDuration(minutes)}
                      className={[
                        "h-7 rounded-lg border px-2 text-xs font-semibold transition",
                        isActive
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {minutes}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setScheduleDuration((prev) => normalizeScheduleDuration(prev + 15))
                  }
                  className="h-7 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  +15 min
                </button>
              </div>
            </label>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Horários livres</div>
                <div className="text-[11px] text-[var(--muted)]">
                  Calculado para o dia e duração escolhidos
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => refreshFreeSlots()}
                disabled={freeSlotsLoading}
              >
                {freeSlotsLoading ? "Calculando..." : "Recalcular"}
              </Button>
            </div>

            {freeStartOptions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                Nenhum horário livre encontrado para a duração atual.
              </p>
            ) : (
              <div className="mt-3">
                <div className="mb-2 text-xs text-slate-500">
                  Selecione um horário disponível para iniciar.
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {freeStartOptions.slice(0, 48).map((startAt, idx) => {
                    const optionValue = toDatetimeLocalValue(startAt);
                    const isActive = scheduleStartLocal === optionValue;
                    return (
                      <button
                        key={idx}
                        onClick={() => setScheduleStartLocal(optionValue)}
                        className={[
                          "rounded-xl border px-3 py-2 text-center text-sm transition",
                          isActive
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-black/10 bg-white hover:bg-black/5",
                        ].join(" ")}
                      >
                        {pad2(startAt.getHours())}:{pad2(startAt.getMinutes())}
                      </button>
                    );
                  })}
                </div>
                {freeStartOptions.length > 48 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Mostrando 48 de {freeStartOptions.length} horários livres.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitSchedule}>
              {scheduleMode === "reschedule" ? "Salvar reagendamento" : "Salvar (Recebida)"}
            </Button>
          </div>
        </div>
      </Modal>

      {isManagerActor && (
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
                Minhas solicitações
              </h2>
              <p className="text-sm text-slate-500">
                Lista separada das solicitações criadas por você.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {displayManagerOwnInspections.length} solicitação(ões)
            </span>
          </div>

          {displayManagerOwnInspections.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma solicitação sua no momento.
            </p>
          ) : (
            <div className="grid gap-4">
              {displayManagerOwnInspections.slice(0, managerListLimit).map((item) => {
                let deadlineMeta: DeadlineMeta | null = null;
                if (item.type === "desocupacao") {
                  deadlineMeta = getDesocupacaoDeadlineMeta(item);
                } else if (item.contract_date) {
                  deadlineMeta = getDeadlineMeta(item.type, item.contract_date, item.status, item.received_at ?? null);
                } else if (item.type !== "ocupacao" && !item.received_at && item.status === "new") {
                  deadlineMeta = { dateText: "", counterText: "⏳ Aguardando recebimento", toneClass: "border-amber-300 bg-amber-100 text-amber-800" };
                }
                const ownMapUrl = buildGoogleMapsSearchUrl(item.property_address);

                return (
                  <div
                    key={`mine-${item.id}`}
                    className="rounded-2xl border border-slate-200 bg-[var(--card-soft)] p-4 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">
                            {formatInspectionCode(item.property_code)} - {INSPECTION_TYPE_LABEL[item.type]}
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="mt-1 truncate text-sm text-slate-600">
                          {item.property_address}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-relaxed text-slate-500">
                          <span>Registro: {formatDateTime(item.created_at)}</span>
                          {item.created_by_person?.name && (
                            <span>Solicitante: {item.created_by_person.name}</span>
                          )}
                          {deadlineMeta && <span>Prazo: {deadlineMeta.dateText}</span>}
                          {item.scheduled_start && item.scheduled_end && (
                            <span>
                              Agenda: {formatDateTime(item.scheduled_start)} (
                              {item.duration_minutes} min)
                            </span>
                          )}
                          {canCreate && item.assigned_to_person?.name && (
                            <span>Vistoriador: {item.assigned_to_person.name}</span>
                          )}
                        </div>
                        {deadlineMeta && (
                          <div
                            className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${deadlineMeta.toneClass}`}
                          >
                            {deadlineMeta.counterText}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {canManageOwnInspection(item) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEdit(item)}
                          >
                            Editar solicitação
                          </Button>
                        )}
                        {canDeleteOwnInspection(item) && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteInspection(item)}
                            disabled={deletingInspectionId === item.id}
                          >
                            {deletingInspectionId === item.id ? "Excluindo..." : "Excluir"}
                          </Button>
                        )}
                        {ownMapUrl && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openAddressInMap(item.property_address)}
                          >
                            Mapa
                          </Button>
                        )}
                      </div>
                    </div>
                    {item.notes && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                        <div className="text-[11px] font-semibold text-slate-500">
                          Observações
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">{item.notes}</div>
                      </div>
                    )}
                  </div>
                );
              })}
              {displayManagerOwnInspections.length > managerListLimit && (
                <button
                  onClick={() => setManagerListLimit((prev) => prev + 8)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Carregar mais ({displayManagerOwnInspections.length - managerListLimit} restantes)
                </button>
              )}
              {managerListLimit >= displayManagerOwnInspections.length && displayManagerOwnInspections.length > 8 && (
                <p className="px-2 text-center text-xs text-slate-500">
                  Exibindo todas as {displayManagerOwnInspections.length} solicitações.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
