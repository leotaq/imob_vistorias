"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import { setStoredActor, useActor, type Actor } from "@/hooks/useActor";
import { isBetaClientVariant } from "@/lib/appVariant";
import { apiFetch } from "@/lib/clientApi";

type Person = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
  active: boolean;
};

export default function PessoasListPage() {
  const router = useRouter();
  const betaVariant = isBetaClientVariant();
  const { ready, actor, authStatus, authSource } = useActor();
  const canImpersonate = !betaVariant || authSource === "beta_admin_fallback";

  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!ready) return;
    if (!actor) {
      router.replace(authStatus === "pending" ? "/acesso-pendente" : "/");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const payload = await apiFetch("/api/people");
        if (cancelled) return;
        setPeople(Array.isArray(payload.people) ? payload.people : []);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Falha ao carregar pessoas.";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, actor, authStatus, router]);

  function selectPerson(person: Person) {
    if (!canImpersonate) return;
    const nextActor: Actor = { id: person.id, name: person.name, role: person.role };
    setStoredActor(nextActor);
    router.replace("/vistorias");
  }

  function PersonCard({ person }: { person: Person }) {
    const roleThemeMap: Record<string, string> = {
      manager: "border-amber-200 bg-amber-50/40 hover:border-amber-300",
      inspector: "border-cyan-200 bg-cyan-50/40 hover:border-cyan-300",
      attendant: "border-indigo-200 bg-indigo-50/40 hover:border-indigo-300",
      marketing: "border-rose-200 bg-rose-50/40 hover:border-rose-300",
    };
    const roleBadgeMap: Record<string, string> = {
      manager: "bg-amber-100 text-amber-800",
      inspector: "bg-cyan-100 text-cyan-800",
      attendant: "bg-indigo-100 text-indigo-800",
      marketing: "bg-rose-100 text-rose-800",
    };
    const roleTheme = roleThemeMap[person.role] || roleThemeMap.attendant;
    const roleBadgeTheme = roleBadgeMap[person.role] || roleBadgeMap.attendant;
    const cardClass = `group min-h-[86px] rounded-2xl border px-4 py-3.5 text-left shadow-sm transition ${canImpersonate ? "hover:-translate-y-0.5 hover:shadow-md" : ""} ${roleTheme}`;

    const content = (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold tracking-[-0.01em] text-slate-900">
            {person.name}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${roleBadgeTheme}`}
            >
              {person.role === "manager"
                ? "Gestora"
                : person.role === "inspector"
                  ? "Vistoriador"
                  : person.role === "marketing"
                    ? "Marketing"
                    : "Atendente"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Ativo
            </span>
          </div>
        </div>
        {canImpersonate && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] transition group-hover:border-[var(--accent)] group-hover:bg-white">
            Acessar
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              <path
                d="M7 5l5 5-5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </div>
    );

    if (!canImpersonate) {
      return (
        <div key={person.id} className={cardClass}>
          {content}
        </div>
      );
    }

    return (
      <button
        key={person.id}
        onClick={() => selectPerson(person)}
        className={cardClass}
      >
        {content}
      </button>
    );
  }

  if (!ready || !actor) return null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_100%_0%,rgba(16,185,129,0.14),transparent_58%),radial-gradient(520px_circle_at_0%_100%,rgba(14,116,144,0.1),transparent_62%)]" />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Pessoas
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {canImpersonate ? "Selecionar Usuario Ativo" : "Usuarios Ativos"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {canImpersonate
              ? "Troque rapidamente de gestora, atendente, vistoriador ou marketing para operar o sistema."
              : "Na beta, a troca manual fica restrita ao fallback administrativo."}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-[0_12px_35px_rgba(251,191,36,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-amber-100 pb-3">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
              Gestoras
            </h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {managers.length}
            </span>
          </div>
          <div className="grid gap-3">
            {managers.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
            {!loading && !error && managers.length === 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Nenhuma gestora ativa.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-[0_12px_35px_rgba(99,102,241,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-indigo-100 pb-3">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
              Atendentes
            </h2>
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              {attendants.length}
            </span>
          </div>
          <div className="grid gap-3">
            {attendants.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
            {!loading && !error && attendants.length === 0 && (
              <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">
                Nenhum atendente ativo.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-200 bg-white p-6 shadow-[0_12px_35px_rgba(34,211,238,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-cyan-100 pb-3">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
              Vistoriadores
            </h2>
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-700">
              {inspectors.length}
            </span>
          </div>
          <div className="grid gap-3">
            {inspectors.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
            {!loading && !error && inspectors.length === 0 && (
              <p className="rounded-xl bg-cyan-50 p-3 text-sm text-cyan-800">
                Nenhum vistoriador ativo.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-[0_12px_35px_rgba(244,63,94,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-rose-100 pb-3">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
              Marketing
            </h2>
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
              {marketingPeople.length}
            </span>
          </div>
          <div className="grid gap-3">
            {marketingPeople.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
            {!loading && !error && marketingPeople.length === 0 && (
              <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                Nenhum marketing ativo.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
        {loading && <p className="text-sm text-slate-600">Carregando...</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        {!loading && !error && people.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Nenhuma pessoa cadastrada.</p>
            <Button onClick={() => router.push("/admin/pessoas")}>
              Ir para Admin
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
