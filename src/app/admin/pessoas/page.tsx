"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import Modal from "@/components/Modal";
import { apiFetch } from "@/lib/clientApi";

type Person = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
  active: boolean;
  phone: string | null;
  created_at: string;
};

type AccessRequest = {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  status: string;
  requested_at: string;
};

type WorkSchedule = {
  work_start: number;
  work_start_min: number;
  lunch_start: number;
  lunch_start_min: number;
  lunch_end: number;
  lunch_end_min: number;
  work_end: number;
  work_end_min: number;
};

const DEFAULT_SCHEDULE: WorkSchedule = {
  work_start: 8, work_start_min: 0,
  lunch_start: 12, lunch_start_min: 0,
  lunch_end: 13, lunch_end_min: 0,
  work_end: 18, work_end_min: 0,
};

type AppError = Error & { status?: number; details?: unknown };

function toAppError(err: unknown): AppError {
  if (err instanceof Error) return err as AppError;
  return new Error("Erro inesperado") as AppError;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function hhmm(h: number, m: number) {
  return `${pad2(h)}:${pad2(m)}`;
}

function TimeInput({
  label,
  hour,
  minute,
  onChangeH,
  onChangeM,
}: {
  label: string;
  hour: number;
  minute: number;
  onChangeH: (v: number) => void;
  onChangeM: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-slate-700">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={23}
          value={hour}
          onChange={(e) => onChangeH(Number(e.target.value))}
          className="w-16 h-10 rounded-xl border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm outline-none text-center transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <span className="text-slate-500 font-bold">:</span>
        <input
          type="number"
          min={0}
          max={59}
          step={5}
          value={minute}
          onChange={(e) => onChangeM(Number(e.target.value))}
          className="w-16 h-10 rounded-xl border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm outline-none text-center transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>
    </div>
  );
}

export default function PessoasPage() {
  const router = useRouter();

  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [loadingAccessRequests, setLoadingAccessRequests] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);
  const [selectedPersonByRequest, setSelectedPersonByRequest] = useState<Record<string, string>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    role: "inspector" as Person["role"],
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Work schedule modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulePerson, setSchedulePerson] = useState<Person | null>(null);
  const [scheduleForm, setScheduleForm] = useState<WorkSchedule>(DEFAULT_SCHEDULE);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const managers = useMemo(
    () => people.filter((person) => person.role === "manager"),
    [people],
  );
  const inspectors = useMemo(
    () => people.filter((person) => person.role === "inspector"),
    [people],
  );
  const attendants = useMemo(
    () => people.filter((person) => person.role === "attendant"),
    [people],
  );
  const marketingPeople = useMemo(
    () => people.filter((person) => person.role === "marketing"),
    [people],
  );

  async function verifyAdminPin(pinValue: string) {
    await apiFetch("/api/admin/verify", {
      method: "POST",
      adminPin: pinValue,
    });
  }

  async function loadPeople() {
    setLoading(true);
    setError(null);

    try {
      const payload = await apiFetch("/api/people?includeInactive=1");
      setPeople(Array.isArray(payload.people) ? payload.people : []);
    } catch (err: unknown) {
      const appError = toAppError(err);
      setError(appError.message || "Falha ao carregar pessoas.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAccessRequests() {
    setLoadingAccessRequests(true);
    setAccessError(null);

    try {
      const payload = await apiFetch("/api/auth/access-requests");
      const list = Array.isArray(payload.requests) ? (payload.requests as AccessRequest[]) : [];
      setAccessRequests(list);
      setSelectedPersonByRequest((prev) => {
        const next = { ...prev };
        for (const item of list) {
          if (!(item.id in next)) next[item.id] = "";
        }
        return next;
      });
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (appError.status === 401) {
        lock();
        setAccessError("PIN admin invalido. Desbloqueie novamente.");
        return;
      }
      setAccessError(appError.message || "Falha ao carregar pedidos de acesso.");
    } finally {
      setLoadingAccessRequests(false);
    }
  }

  useEffect(() => {
    const sessionPin = sessionStorage.getItem("adminPin") || "";
    if (!sessionPin) return;

    let cancelled = false;
    (async () => {
      try {
        await verifyAdminPin(sessionPin);
        if (cancelled) return;
        setPin(sessionPin);
        setUnlocked(true);
      } catch {
        sessionStorage.removeItem("adminPin");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    loadPeople().catch(() => {
      setError("Falha ao carregar pessoas.");
    });
    loadAccessRequests().catch(() => {
      setAccessError("Falha ao carregar pedidos de acesso.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  async function unlock() {
    setPinError(null);

    const value = pin.trim();
    if (!value) {
      setPinError("Informe o PIN.");
      return;
    }

    setUnlocking(true);
    try {
      await verifyAdminPin(value);
      sessionStorage.setItem("adminPin", value);
      setUnlocked(true);
    } catch (err: unknown) {
      const appError = toAppError(err);
      setPinError(
        appError.status === 401 ? "PIN admin inválido." : "Falha ao validar PIN.",
      );
    } finally {
      setUnlocking(false);
    }
  }

  function lock() {
    sessionStorage.removeItem("adminPin");
    setUnlocked(false);
    setPin("");
  }

  async function approveAccessRequest(requestId: string) {
    const personId = selectedPersonByRequest[requestId] || "";
    if (!personId) {
      setAccessError("Selecione uma pessoa antes de aprovar o acesso.");
      return;
    }

    setApprovingRequestId(requestId);
    setAccessError(null);

    try {
      await apiFetch(`/api/auth/access-requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify({ personId }),
      });
      await loadAccessRequests();
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (appError.status === 401) {
        lock();
        setAccessError("PIN admin invalido. Desbloqueie novamente.");
        return;
      }
      setAccessError(appError.message || "Falha ao aprovar acesso.");
    } finally {
      setApprovingRequestId(null);
    }
  }

  function openCreate(role?: Person["role"]) {
    setEditing(null);
    setForm({ name: "", phone: "", role: role || "inspector", active: true });
    setSaveError(null);
    setModalOpen(true);
  }

  function openEdit(person: Person) {
    setEditing(person);
    setForm({
      name: person.name,
      phone: person.phone || "",
      role: person.role,
      active: person.active,
    });
    setSaveError(null);
    setModalOpen(true);
  }

  async function openScheduleModal(person: Person) {
    setSchedulePerson(person);
    setScheduleError(null);
    setScheduleLoading(true);
    setScheduleModalOpen(true);

    try {
      const payload = await apiFetch(`/api/people/${person.id}/schedule`);
      if (payload.schedule) {
        setScheduleForm(payload.schedule as WorkSchedule);
      } else {
        setScheduleForm({ ...DEFAULT_SCHEDULE });
      }
    } catch {
      setScheduleForm({ ...DEFAULT_SCHEDULE });
    } finally {
      setScheduleLoading(false);
    }
  }

  async function saveSchedule() {
    if (!schedulePerson) return;
    setScheduleSaving(true);
    setScheduleError(null);

    try {
      await apiFetch(`/api/people/${schedulePerson.id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify(scheduleForm),
      });
      setScheduleModalOpen(false);
    } catch (err: unknown) {
      const appError = toAppError(err);
      setScheduleError(appError.message || "Falha ao salvar horário.");
    } finally {
      setScheduleSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (editing) {
        await apiFetch(`/api/people/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/api/people", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }

      setModalOpen(false);
      await loadPeople();
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (appError.status === 401) {
        lock();
        setSaveError("PIN admin inválido. Desbloqueie novamente.");
        return;
      }
      setSaveError(appError.message || "Falha ao salvar pessoa.");
    } finally {
      setSaving(false);
    }
  }

  function updateSch<K extends keyof WorkSchedule>(key: K, value: number) {
    setScheduleForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_100%_0%,rgba(245,158,11,0.14),transparent_58%),radial-gradient(520px_circle_at_0%_100%,rgba(217,119,6,0.1),transparent_62%)]" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Acesso Admin
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Pessoas
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Cadastro simples sem login. Criação e edição exigem PIN admin.
            </p>
          </div>

          {unlocked && (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-amber-700">
                Gestoras: {managers.length}
              </span>
              <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-cyan-700">
                Vistoriadores: {inspectors.length}
              </span>
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-indigo-700">
                Atendentes: {attendants.length}
              </span>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-rose-700">
                Marketing: {marketingPeople.length}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                Total: {people.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {!unlocked ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
          <div className="max-w-sm space-y-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">PIN admin</span>
              <input
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {pinError && <p className="text-sm text-red-700">{pinError}</p>}

            <div className="flex items-center gap-2">
              <Button onClick={unlock} disabled={unlocking}>
                {unlocking ? "Validando..." : "Entrar como admin"}
              </Button>
              <Button variant="secondary" onClick={() => router.push("/")}>
                Voltar
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              O PIN é definido na variável <span className="font-semibold">ADMIN_PIN</span>.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
              {people.length} pessoa(s)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => loadPeople()}>
                Atualizar
              </Button>
              <Button variant="secondary" onClick={lock}>
                Bloquear
              </Button>
              <Button variant="secondary" onClick={() => openCreate("manager")}>
                + Nova gestora
              </Button>
              <Button variant="secondary" onClick={() => openCreate("attendant")}>
                + Novo atendente
              </Button>
              <Button variant="secondary" onClick={() => openCreate("marketing")}>
                + Novo marketing
              </Button>
              <Button onClick={() => openCreate("inspector")}>
                + Novo vistoriador
              </Button>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                  Acessos Google pendentes
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Vincule a conta Google da beta a uma pessoa existente para liberar a entrada.
                </p>
              </div>
              <Button variant="secondary" onClick={() => loadAccessRequests()}>
                Atualizar acessos
              </Button>
            </div>

            {loadingAccessRequests && (
              <p className="text-sm text-slate-600">Carregando pedidos de acesso...</p>
            )}
            {accessError && (
              <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {accessError}
              </p>
            )}

            {!loadingAccessRequests && accessRequests.length === 0 && !accessError && (
              <p className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
                Nenhum acesso pendente no momento.
              </p>
            )}

            {!loadingAccessRequests && accessRequests.length > 0 && (
              <div className="grid gap-3">
                {accessRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"
                  >
                    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto] lg:items-end">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {request.full_name || request.email}
                        </p>
                        <p className="text-xs text-slate-500">
                          {request.email}
                        </p>
                        <p className="text-xs text-slate-500">
                          Solicitado em {new Date(request.requested_at).toLocaleString("pt-BR")}
                        </p>
                      </div>

                      <label className="grid gap-1.5">
                        <span className="text-[12px] font-semibold text-slate-700">
                          Vincular a pessoa
                        </span>
                        <select
                          value={selectedPersonByRequest[request.id] || ""}
                          onChange={(event) =>
                            setSelectedPersonByRequest((prev) => ({
                              ...prev,
                              [request.id]: event.target.value,
                            }))
                          }
                          className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Selecione...</option>
                          {people
                            .filter((person) => person.active)
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name} - {person.role === "manager"
                                  ? "Gestora"
                                  : person.role === "inspector"
                                    ? "Vistoriador"
                                    : person.role === "marketing"
                                      ? "Marketing"
                                      : "Atendente"}
                              </option>
                            ))}
                        </select>
                      </label>

                      <div className="flex justify-end">
                        <Button
                          onClick={() => approveAccessRequest(request.id)}
                          disabled={approvingRequestId === request.id}
                        >
                          {approvingRequestId === request.id ? "Aprovando..." : "Aprovar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {loading && <p className="mt-4 text-sm text-slate-600">Carregando...</p>}
          {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2.5">Nome</th>
                  <th className="py-2.5">WhatsApp</th>
                  <th className="py-2.5">Papel</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5">Criado em</th>
                  <th className="py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr
                    key={person.id}
                    className="border-t border-slate-200 transition hover:bg-slate-50"
                  >
                    <td className="py-3 font-semibold text-slate-900">{person.name}</td>
                    <td className="py-3 text-slate-600">{person.phone || "-"}</td>
                    <td className="py-3">
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          person.role === "manager"
                            ? "bg-amber-100 text-amber-700"
                            : person.role === "inspector"
                              ? "bg-cyan-100 text-cyan-700"
                              : person.role === "marketing"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-indigo-100 text-indigo-700",
                        ].join(" ")}
                      >
                        {person.role === "manager"
                          ? "Gestora"
                          : person.role === "inspector"
                            ? "Vistoriador"
                            : person.role === "marketing"
                              ? "Marketing"
                              : "Atendente"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          person.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-200 text-zinc-700",
                        ].join(" ")}
                      >
                        {person.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">
                      {new Date(person.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(person)}>
                          Editar
                        </Button>
                        {person.role === "inspector" && (
                          <Button size="sm" variant="secondary" onClick={() => openScheduleModal(person)}>
                            🕐 Horário
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {people.length === 0 && !loading && (
                  <tr>
                    <td className="py-4 text-slate-500" colSpan={6}>
                      Nenhuma pessoa cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Editar pessoa */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar pessoa" : "Nova pessoa"}
        onClose={() => setModalOpen(false)}
      >
        <div className="grid gap-3">
          {saveError && <p className="text-sm text-red-700">{saveError}</p>}

          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">Nome</span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-slate-700">
              WhatsApp (com DDD)
            </span>
            <input
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              placeholder="+5511999999999"
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Papel</span>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    role: event.target.value as Person["role"],
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="manager">Gestora</option>
                <option value="inspector">Vistoriador</option>
                <option value="attendant">Atendente</option>
                <option value="marketing">Marketing</option>
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-slate-700">Status</span>
              <select
                value={form.active ? "1" : "0"}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    active: event.target.value === "1",
                  }))
                }
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Horário de trabalho do vistoriador */}
      <Modal
        open={scheduleModalOpen}
        title={`Horário de trabalho — ${schedulePerson?.name ?? ""}`}
        onClose={() => setScheduleModalOpen(false)}
      >
        {scheduleLoading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : (
          <div className="grid gap-5">
            {scheduleError && <p className="text-sm text-red-700">{scheduleError}</p>}

            <p className="text-sm text-slate-600">
              Configure os horários de expediente. Os slots de agendamento seguirão esses limites,
              excluindo automaticamente o intervalo de almoço.
            </p>

            {/* Preview */}
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
              🕐 Expediente: <strong>{hhmm(scheduleForm.work_start, scheduleForm.work_start_min)}</strong>
              {" → "}<strong>{hhmm(scheduleForm.lunch_start, scheduleForm.lunch_start_min)}</strong>
              {" · Almoço: "}<strong>{hhmm(scheduleForm.lunch_start, scheduleForm.lunch_start_min)}</strong>
              {" → "}<strong>{hhmm(scheduleForm.lunch_end, scheduleForm.lunch_end_min)}</strong>
              {" · Tarde: "}<strong>{hhmm(scheduleForm.lunch_end, scheduleForm.lunch_end_min)}</strong>
              {" → "}<strong>{hhmm(scheduleForm.work_end, scheduleForm.work_end_min)}</strong>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TimeInput
                label="Entrada"
                hour={scheduleForm.work_start}
                minute={scheduleForm.work_start_min}
                onChangeH={(v) => updateSch("work_start", v)}
                onChangeM={(v) => updateSch("work_start_min", v)}
              />
              <TimeInput
                label="Início almoço"
                hour={scheduleForm.lunch_start}
                minute={scheduleForm.lunch_start_min}
                onChangeH={(v) => updateSch("lunch_start", v)}
                onChangeM={(v) => updateSch("lunch_start_min", v)}
              />
              <TimeInput
                label="Fim almoço"
                hour={scheduleForm.lunch_end}
                minute={scheduleForm.lunch_end_min}
                onChangeH={(v) => updateSch("lunch_end", v)}
                onChangeM={(v) => updateSch("lunch_end_min", v)}
              />
              <TimeInput
                label="Saída"
                hour={scheduleForm.work_end}
                minute={scheduleForm.work_end_min}
                onChangeH={(v) => updateSch("work_end", v)}
                onChangeM={(v) => updateSch("work_end_min", v)}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setScheduleModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveSchedule} disabled={scheduleSaving}>
                {scheduleSaving ? "Salvando..." : "Salvar horário"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
