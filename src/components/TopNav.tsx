"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/clientApi";
import {
  clearStoredActor,
  notifyAuthStateChanged,
  setStoredActor,
  useActor,
} from "@/hooks/useActor";
import { isBetaClientVariant } from "@/lib/appVariant";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Person = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
  active: boolean;
};

const ROLE_LABEL: Record<Person["role"], string> = {
  manager: "Gestora",
  inspector: "Vistoriador",
  attendant: "Atendente",
  marketing: "Marketing",
};

const LOGO_CANDIDATES = ["/logo-imobiliaria.png", "/download.png"] as const;

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.2 0-7 2.1-7 5v1h14v-1c0-2.9-2.8-5-7-5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const betaVariant = isBetaClientVariant();
  const { actor, authStatus, authSource } = useActor();

  const [openSelector, setOpenSelector] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [logoIndex, setLogoIndex] = useState(0);

  const activePeople = useMemo(
    () => people.filter((person) => person.active),
    [people],
  );
  const canUseSelector = !betaVariant || authSource === "beta_admin_fallback";

  const roleChipClass =
    actor?.role === "manager"
      ? "bg-amber-100 text-amber-700"
      : actor?.role === "inspector"
        ? "bg-cyan-100 text-cyan-700"
        : actor?.role === "marketing"
          ? "bg-rose-100 text-rose-700"
          : "bg-indigo-100 text-indigo-700";
  const showDashboard = true;
  const showCalendar = Boolean(actor);
  const logoSrc = LOGO_CANDIDATES[logoIndex] ?? null;

  const linkClass = (href: string) =>
    [
      "rounded-xl px-3 py-2 text-sm font-semibold transition",
      pathname === href || pathname.startsWith(`${href}/`)
        ? "bg-[var(--accent)] text-white shadow-[0_8px_20px_rgba(0,103,252,0.35)]"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");
  const controlButtonClass =
    "inline-flex h-10 items-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100";

  useEffect(() => {
    if (!canUseSelector) return;
    if (!openSelector) {
      setLoadingPeople(false);
      return;
    }
    if (activePeople.length > 0) return;

    const controller = new AbortController();
    let active = true;

    (async () => {
      try {
        setLoadingPeople(true);
        setPeopleError(null);
        const payload = await apiFetch("/api/people", { signal: controller.signal });
        if (!active) return;
        setPeople(Array.isArray(payload.people) ? payload.people : []);
      } catch (err: unknown) {
        if (!active) return;
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (!aborted) {
          setPeopleError("Nao foi possivel carregar usuarios.");
        }
      } finally {
        if (active) setLoadingPeople(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [openSelector, activePeople.length, canUseSelector]);

  async function logout() {
    clearStoredActor();
    setOpenSelector(false);
    if (betaVariant && authSource !== "beta_admin_fallback") {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      notifyAuthStateChanged();
    }
    router.replace("/");
    router.refresh();
  }

  function selectPerson(person: Person) {
    setStoredActor({ id: person.id, name: person.name, role: person.role });
    setOpenSelector(false);
    router.replace("/vistorias");
  }

  return (
    <div className="sticky top-0 z-40 border-b border-[var(--topnav-border)] bg-[var(--topnav-bg)] shadow-sm backdrop-blur-md">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 text-base font-bold tracking-tight text-slate-900 sm:text-lg"
            >
              {logoSrc && (
                <Image
                  src={logoSrc}
                  alt="Logo da imobiliaria"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md object-contain"
                  onError={() => setLogoIndex((prev) => prev + 1)}
                />
              )}
              <span className="max-w-[220px] truncate sm:max-w-none">
                Alice Imoveis Vistorias
              </span>
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              <Link className={linkClass("/vistorias")} href="/vistorias">
                Vistorias
              </Link>
              {showDashboard && (
                <Link className={linkClass("/dashboard")} href="/dashboard">
                  Dashboard
                </Link>
              )}
              {showCalendar && (
                <Link className={linkClass("/calendario")} href="/calendario">
                  Agenda
                </Link>
              )}
              <Link className={linkClass("/pessoas")} href="/pessoas">
                Usuarios
              </Link>
              <Link className={linkClass("/admin/pessoas")} href="/admin/pessoas">
                Admin
              </Link>
            </nav>
          </div>

          <div className="relative flex items-center gap-2">
            {actor ? (
              <>
                <div className="inline-flex h-10 max-w-[150px] items-center gap-2 truncate rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm sm:hidden">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <UserIcon />
                  </span>
                  {actor.name}
                </div>

                <div className="hidden h-10 min-w-[188px] max-w-[240px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 shadow-sm sm:flex">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <UserIcon />
                  </span>
                  <p
                    className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em] text-slate-900"
                    title={actor.name}
                  >
                    {actor.name}
                  </p>
                  <div
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${roleChipClass}`}
                  >
                    {ROLE_LABEL[actor.role]}
                  </div>
                </div>

                {canUseSelector && (
                  <button
                    onClick={() => setOpenSelector((prev) => !prev)}
                    className={controlButtonClass}
                  >
                    Trocar usuario
                  </button>
                )}

                <button
                  onClick={() => void logout()}
                  className={controlButtonClass}
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.push(authStatus === "pending" ? "/acesso-pendente" : "/")}
                  className={controlButtonClass}
                >
                  {betaVariant ? "Entrar" : "Selecionar usuario"}
                </button>
                {betaVariant && authStatus === "pending" && (
                  <button
                    onClick={() => void logout()}
                    className={controlButtonClass}
                  >
                    Sair
                  </button>
                )}
              </>
            )}

            {canUseSelector && openSelector && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.2)]">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Selecionar usuario
                  </p>
                  <button
                    onClick={() => setOpenSelector(false)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Fechar
                  </button>
                </div>

                {loadingPeople && (
                  <p className="px-1 py-2 text-sm text-slate-500">Carregando...</p>
                )}
                {peopleError && (
                  <p className="px-1 py-2 text-sm text-red-700">{peopleError}</p>
                )}

                {!loadingPeople && !peopleError && activePeople.length === 0 && (
                  <p className="px-1 py-2 text-sm text-slate-500">
                    Nenhum usuario ativo cadastrado.
                  </p>
                )}

                <div className="grid max-h-[min(60vh,420px)] gap-2 overflow-y-auto pr-1">
                  {activePeople.map((person) => {
                    const selected = actor?.id === person.id;
                    const roleClass =
                      person.role === "manager"
                        ? "bg-amber-100 text-amber-700"
                        : person.role === "inspector"
                          ? "bg-cyan-100 text-cyan-700"
                          : person.role === "marketing"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-indigo-100 text-indigo-700";

                    return (
                      <button
                        key={person.id}
                        onClick={() => selectPerson(person)}
                        className={[
                          "rounded-xl border px-3.5 py-2.5 text-left transition",
                          selected
                            ? "border-[var(--accent)] bg-[var(--card-soft)] ring-1 ring-[var(--accent)]"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-slate-900">
                              {person.name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {person.role === "manager"
                                ? "Perfil de gestora"
                                : person.role === "inspector"
                                  ? "Perfil de vistoriador"
                                  : person.role === "marketing"
                                    ? "Perfil de marketing"
                                    : "Perfil de atendente"}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${roleClass}`}
                          >
                            {ROLE_LABEL[person.role]}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="mt-2 flex items-center gap-1 sm:hidden">
          <Link className={linkClass("/vistorias")} href="/vistorias">
            Vistorias
          </Link>
          {showDashboard && (
            <Link className={linkClass("/dashboard")} href="/dashboard">
              Dashboard
            </Link>
          )}
          {showCalendar && (
            <Link className={linkClass("/calendario")} href="/calendario">
              Agenda
            </Link>
          )}
          <Link className={linkClass("/pessoas")} href="/pessoas">
            Usuarios
          </Link>
          <Link className={linkClass("/admin/pessoas")} href="/admin/pessoas">
            Admin
          </Link>
        </nav>
      </div>
    </div>
  );
}
