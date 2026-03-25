"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type {
  EventClickArg,
  EventInput,
  EventSourceFunc,
  EventSourceFuncArg,
  EventContentArg,
} from "@fullcalendar/core";

import Modal from "@/components/Modal";
import { useActor } from "@/hooks/useActor";
import { apiFetch } from "@/lib/clientApi";

const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false });

type Person = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
  active: boolean;
};

type AppError = Error & { status?: number; details?: unknown };

type EventDetails = {
  title: string;
  start?: string;
  end?: string;
  statusLabel?: string;
  typeLabel?: string;
  property_address?: string;
  duration_minutes?: number;
};

function toAppError(err: unknown): AppError {
  if (err instanceof Error) return err as AppError;
  return new Error("Erro inesperado") as AppError;
}

function parseEvents(payload: unknown): EventInput[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { events?: unknown };
  if (!Array.isArray(record.events)) return [];

  const parsed: EventInput[] = [];

  for (const event of record.events) {
    if (!event || typeof event !== "object") continue;
    const item = event as {
      id?: unknown;
      title?: unknown;
      start?: unknown;
      end?: unknown;
      backgroundColor?: unknown;
      borderColor?: unknown;
      extendedProps?: unknown;
    };

    if (
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.start !== "string" ||
      typeof item.end !== "string"
    ) {
      continue;
    }

    parsed.push({
      id: item.id,
      title: item.title,
      start: item.start,
      end: item.end,
      backgroundColor:
        typeof item.backgroundColor === "string"
          ? item.backgroundColor
          : undefined,
      borderColor:
        typeof item.borderColor === "string" ? item.borderColor : undefined,
      extendedProps:
        item.extendedProps && typeof item.extendedProps === "object"
          ? item.extendedProps
          : undefined,
    });
  }

  return parsed;
}

function mapEventDetails(arg: EventClickArg): EventDetails {
  const extended =
    arg.event.extendedProps && typeof arg.event.extendedProps === "object"
      ? (arg.event.extendedProps as Record<string, unknown>)
      : {};

  return {
    title: arg.event.title,
    start: arg.event.start?.toISOString(),
    end: arg.event.end?.toISOString(),
    statusLabel:
      typeof extended.statusLabel === "string" ? extended.statusLabel : undefined,
    typeLabel: typeof extended.typeLabel === "string" ? extended.typeLabel : undefined,
    property_address:
      typeof extended.property_address === "string"
        ? extended.property_address
        : undefined,
    duration_minutes:
      typeof extended.duration_minutes === "number"
        ? extended.duration_minutes
        : undefined,
  };
}

function renderEventContent(eventInfo: EventContentArg) {
  return (
    <div
      className="flex h-full w-full flex-col p-1 text-xs shadow-sm cursor-pointer"
      title={eventInfo.event.title}
      style={{
        backgroundColor: eventInfo.backgroundColor || '#0067fc',
        color: '#ffffff',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '5px',
        overflow: 'hidden'
      }}
    >
      <div className="font-bold tracking-tight leading-none mb-0.5">{eventInfo.timeText}</div>
      <div className="font-semibold leading-tight line-clamp-2">
        {eventInfo.event.title}
      </div>
    </div>
  );
}

export default function CalendarioPage() {
  const router = useRouter();
  const { ready, actor, authStatus } = useActor();

  const [inspectors, setInspectors] = useState<Person[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [loadingInspectors, setLoadingInspectors] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [eventOpen, setEventOpen] = useState(false);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!actor) {
      router.replace(authStatus === "pending" ? "/acesso-pendente" : "/");
      return;
    }

    if (actor.role === "inspector" || actor.role === "marketing") {
      setAssignedTo(actor.id);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingInspectors(true);
        setLoadError(null);
        const payload = await apiFetch("/api/people?role=inspector");
        const list = Array.isArray(payload.people) ? payload.people : [];
        if (cancelled) return;
        setInspectors(list);
        setAssignedTo((prev) => prev || list[0]?.id || "");
      } catch (err: unknown) {
        if (cancelled) return;
        const appError = toAppError(err);
        setLoadError(appError.message || "Falha ao carregar vistoriadores.");
      } finally {
        if (!cancelled) setLoadingInspectors(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, actor, authStatus, router]);

  const title = useMemo(() => {
    if (!actor) return "Agenda";
    if (actor.role === "inspector" || actor.role === "marketing") return "Agenda (minha agenda)";
    const person = inspectors.find((item) => item.id === assignedTo);
    return person ? `Agenda (${person.name})` : "Agenda";
  }, [actor, assignedTo, inspectors]);

  const canRender = Boolean(actor && assignedTo);

  const eventSource: EventSourceFunc = async (
    info: EventSourceFuncArg,
    success,
    failure,
  ) => {
    try {
      if (!canRender) {
        success([]);
        return;
      }

      const qs = new URLSearchParams({
        from: info.start.toISOString(),
        to: info.end.toISOString(),
      });
      if (actor?.role !== "inspector" && actor?.role !== "marketing") qs.set("assignedTo", assignedTo);

      const payload = await apiFetch(`/api/calendar?${qs.toString()}`);
      success(parseEvents(payload));
    } catch (err: unknown) {
      failure(toAppError(err));
    }
  };

  function onEventClick(arg: EventClickArg) {
    setEventDetails(mapEventDetails(arg));
    setEventOpen(true);
  }

  if (!ready) return null;
  if (!actor) return null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-cyan-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_100%_0%,rgba(8,145,178,0.14),transparent_58%),radial-gradient(520px_circle_at_0%_100%,rgba(0,103,252,0.1),transparent_62%)]" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Agenda Semanal
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Segunda a sexta, das 08:00 às 18:00
            </p>
          </div>

          {actor.role !== "inspector" && actor.role !== "marketing" && (
            <div className="min-w-64">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-cyan-800/70">
                Vistoriador Selecionado
              </label>
              <div className="relative">
                <select
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-cyan-100 bg-white/80 px-4 pr-10 text-sm font-semibold text-slate-800 shadow-sm outline-none backdrop-blur-md transition hover:border-cyan-300 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 cursor-pointer"
                >
                  <option value="">Selecione o vistoriador...</option>
                  {inspectors.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-cyan-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
        {loadingInspectors && (
          <p className="text-sm text-slate-600">Carregando vistoriadores...</p>
        )}
        {loadError && <p className="text-sm text-red-700">{loadError}</p>}

        {!canRender ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-slate-50 p-4">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Nenhum Vistoriador</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Selecione um vistoriador no controle acima para visualizar e gerenciar sua agenda semanal.</p>
          </div>
        ) : (
          <div className="calendario-fc rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Legenda:</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-100/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-blue-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]" /> Recebida
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" /> Em andamento
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100/50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" /> Concluída
                </span>
              </div>
            </div>
            <FullCalendar
              key={assignedTo}
              plugins={[timeGridPlugin, interactionPlugin]}
              locale={ptBrLocale}
              firstDay={1}
              initialView="timeGridWeek"
              weekends={true}
              hiddenDays={[0]}
              allDaySlot={false}
              slotMinTime="08:00:00"
              slotMaxTime="18:00:00"
              slotDuration="00:15:00"
              slotLabelInterval="01:00"
              nowIndicator={true}
              height="auto"
              eventOverlap={true}
              eventMinHeight={50}
              events={eventSource}
              eventContent={renderEventContent}
              eventClick={onEventClick}
              buttonText={{
                today: "Hoje",
                week: "Semana",
                day: "Dia",
              }}
              slotLabelFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              eventTimeFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "timeGridWeek,timeGridDay",
              }}
            />
          </div>
        )}
      </div>

      <Modal open={eventOpen} title="Detalhes do Agendamento" onClose={() => setEventOpen(false)}>
        {!eventDetails ? (
           <div className="flex h-32 items-center justify-center">
             <div className="h-6 w-6 animate-spin rounded-full border-r-2 border-t-2 border-slate-400"></div>
           </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Cabeçalho do Card */}
            <div className="flex items-start justify-between rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
                  Identificação
                </p>
                <h3 className="text-lg font-bold leading-tight text-slate-800">
                  {eventDetails.title}
                </h3>
                {eventDetails.property_address && (
                  <div className="mt-2 flex items-start gap-1.5 text-sm text-slate-500">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span className="leading-snug">{eventDetails.property_address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Grid de Informações Vitais */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">Horário</p>
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <div>
                    {eventDetails.start && <p className="text-sm font-bold text-slate-800">{new Date(eventDetails.start).toLocaleTimeString("pt-BR", {hour: '2-digit', minute:'2-digit'})}</p>}
                    {eventDetails.end && <p className="text-[11px] font-medium text-slate-500">até {new Date(eventDetails.end).toLocaleTimeString("pt-BR", {hour: '2-digit', minute:'2-digit'})}</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">Características</p>
                <div className="space-y-1.5">
                  {eventDetails.statusLabel && (
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${
                        eventDetails.statusLabel === 'Recebida' ? 'bg-blue-500' :
                        eventDetails.statusLabel === 'Em andamento' ? 'bg-amber-500' :
                        eventDetails.statusLabel === 'Concluída' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}></span>
                      <span className="text-xs font-semibold text-slate-700">{eventDetails.statusLabel}</span>
                    </div>
                  )}
                  {eventDetails.typeLabel && (
                    <div className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                      <span className="text-xs font-medium text-slate-600">{eventDetails.typeLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {typeof eventDetails.duration_minutes === "number" && (
              <div className="flex items-center justify-between rounded-xl bg-indigo-50/50 px-4 py-3">
                <span className="text-xs font-semibold text-indigo-800">Duração estimada:</span>
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-sm font-bold text-indigo-700">{eventDetails.duration_minutes} min</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
