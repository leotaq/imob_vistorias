"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import { setStoredActor, type Actor, useActor } from "@/hooks/useActor";
import { isBetaClientVariant } from "@/lib/appVariant";
import { apiFetch } from "@/lib/clientApi";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Person = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
  active: boolean;
};

export default function Home() {
  const router = useRouter();
  const betaVariant = isBetaClientVariant();
  const { ready, actor, authStatus, authUser, error: authError } = useActor();

  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

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
    if (!betaVariant) return;
    if (!ready) return;
    if (actor && authStatus === "approved") {
      router.replace("/vistorias");
      return;
    }
    if (authStatus === "pending") {
      router.replace("/acesso-pendente");
    }
  }, [betaVariant, ready, actor, authStatus, router]);

  useEffect(() => {
    if (betaVariant) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const json = await apiFetch("/api/people");
        if (!cancelled) setPeople(Array.isArray(json.people) ? json.people : []);
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
  }, [betaVariant]);

  async function signInWithGoogle() {
    try {
      setSigningIn(true);
      setError(null);
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/vistorias`;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (signInError) throw signInError;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Falha ao iniciar login Google.";
      setError(message);
      setSigningIn(false);
    }
  }

  function selectPerson(person: Person) {
    const nextActor: Actor = { id: person.id, name: person.name, role: person.role };
    setStoredActor(nextActor);
    router.replace("/vistorias");
  }

  function PersonButton({ person }: { person: Person }) {
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

    return (
      <button
        key={person.id}
        onClick={() => selectPerson(person)}
        className={`group min-h-[86px] rounded-2xl border px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${roleTheme}`}
      >
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
        </div>
      </button>
    );
  }

  if (betaVariant) {
    if (!ready) return null;

    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_100%_0%,rgba(0,103,252,0.1),transparent_58%),radial-gradient(520px_circle_at_0%_100%,rgba(16,185,129,0.08),transparent_62%)]" />

          <div className="relative grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Alice Imoveis Beta
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                Entre com sua conta Google
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Esta versao beta usa autenticacao real por usuario. Depois do login,
                o acesso precisa ser aprovado e vinculado a uma pessoa existente no sistema.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Status atual
              </p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>
                  Sessao:{" "}
                  <span className="font-semibold">
                    {authStatus === "approved"
                      ? "Aprovada"
                      : authStatus === "pending"
                        ? "Pendente"
                        : "Nao autenticada"}
                  </span>
                </p>
                {authUser?.email && (
                  <p>
                    Conta: <span className="font-semibold">{authUser.email}</span>
                  </p>
                )}
                {authError && (
                  <p className="text-red-700">
                    Erro: {authError}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Como funciona na beta
            </h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                1. Voce entra com Google.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                2. A beta cria ou atualiza seu pedido de acesso.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                3. Um admin vincula sua conta a uma pessoa do sistema.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                4. Depois disso, voce entra direto nas telas operacionais.
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-blue-200 bg-white p-6 shadow-[0_12px_35px_rgba(59,130,246,0.12)]">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Acesso
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Use a mesma conta Google que sera aprovada para o seu perfil na beta.
            </p>

            {(error || authError) && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error || authError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={signInWithGoogle} disabled={signingIn}>
                {signingIn ? "Redirecionando..." : "Entrar com Google"}
              </Button>
              <Button variant="secondary" onClick={() => router.push("/admin/pessoas")}>
                Abrir Admin
              </Button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_circle_at_100%_0%,rgba(0,103,252,0.1),transparent_58%),radial-gradient(520px_circle_at_0%_100%,rgba(0,37,206,0.06),transparent_62%)]" />

        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Alice Imoveis
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Selecione seu perfil para continuar
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Acesso rapido para operacao diaria das vistorias. Escolha uma gestora,
              atendente, vistoriador ou marketing e entre direto no painel com suas permissoes.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-xl font-bold text-amber-800">{managers.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Gestoras
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-center">
              <p className="text-xl font-bold text-indigo-800">{attendants.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                Atendentes
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-center">
              <p className="text-xl font-bold text-cyan-800">{inspectors.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
                Vistoriadores
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center">
              <p className="text-xl font-bold text-rose-800">{marketingPeople.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                Marketing
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-xl font-bold text-slate-800">{people.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Total ativo
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-[0_12px_35px_rgba(251,191,36,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-amber-100 pb-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
                Gestoras
              </h2>
              <p className="text-xs text-slate-500">Solicitacoes e acompanhamento</p>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              {managers.length}
            </span>
          </div>
          <div className="grid gap-3">
            {managers.map((person) => (
              <PersonButton key={person.id} person={person} />
            ))}
            {!loading && !error && managers.length === 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Nenhuma gestora ativa cadastrada.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-[0_12px_35px_rgba(99,102,241,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-indigo-100 pb-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
                Atendentes
              </h2>
              <p className="text-xs text-slate-500">Abertura e suporte de solicitacoes</p>
            </div>
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
              {attendants.length}
            </span>
          </div>
          <div className="grid gap-3">
            {attendants.map((person) => (
              <PersonButton key={person.id} person={person} />
            ))}
            {!loading && !error && attendants.length === 0 && (
              <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">
                Nenhum atendente ativo cadastrado.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-200 bg-white p-6 shadow-[0_12px_35px_rgba(34,211,238,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-cyan-100 pb-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
                Vistoriadores
              </h2>
              <p className="text-xs text-slate-500">Execucao e atualizacao de status</p>
            </div>
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-800">
              {inspectors.length}
            </span>
          </div>
          <div className="grid gap-3">
            {inspectors.map((person) => (
              <PersonButton key={person.id} person={person} />
            ))}
            {!loading && !error && inspectors.length === 0 && (
              <p className="rounded-xl bg-cyan-50 p-3 text-sm text-cyan-800">
                Nenhum vistoriador ativo cadastrado.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-[0_12px_35px_rgba(244,63,94,0.12)]">
          <div className="mb-4 flex items-center justify-between border-b border-rose-100 pb-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">
                Marketing
              </h2>
              <p className="text-xs text-slate-500">Fotos e placas de imoveis</p>
            </div>
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
              {marketingPeople.length}
            </span>
          </div>
          <div className="grid gap-3">
            {marketingPeople.map((person) => (
              <PersonButton key={person.id} person={person} />
            ))}
            {!loading && !error && marketingPeople.length === 0 && (
              <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                Nenhum marketing ativo cadastrado.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
        {loading && <p className="text-sm text-slate-600">Carregando usuarios...</p>}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error} (verifique Supabase e variaveis de ambiente)
          </p>
        )}

        {!loading && !error && people.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Nenhuma pessoa cadastrada ainda.
            </p>
            <p className="text-sm text-slate-700">
              Va em <span className="font-semibold">Pessoas</span> e cadastre ao
              menos uma gestora e um vistoriador.
            </p>
            <Button onClick={() => router.push("/admin/pessoas")}>
              Abrir Pessoas
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
