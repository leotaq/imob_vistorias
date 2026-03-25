"use client";

import { useCallback, useEffect, useState } from "react";

import { isBetaClientVariant } from "@/lib/appVariant";
import { apiFetch } from "@/lib/clientApi";

export type Actor = {
  id: string;
  name: string;
  role: "manager" | "inspector" | "attendant" | "marketing";
};

export type AuthStatus = "anonymous" | "pending" | "approved";
export type AuthSource =
  | "none"
  | "legacy_header"
  | "beta_admin_fallback"
  | "supabase_link"
  | "supabase_pending";

export type AuthUserInfo = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

type AuthMeResponse = {
  status?: unknown;
  actor?: unknown;
  source?: unknown;
  user?: unknown;
  requestId?: unknown;
};

type HookState = {
  ready: boolean;
  actor: Actor | null;
  authStatus: AuthStatus;
  authSource: AuthSource;
  authUser: AuthUserInfo | null;
  requestId: string | null;
  error: string | null;
};

type AppError = Error & { status?: number };

const ACTOR_EVENT = "actor-changed";
const AUTH_EVENT = "auth-state-changed";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedActor: Actor | null = null;
let cachedActorKey = "";

function isValidRole(value: string): value is Actor["role"] {
  return (
    value === "manager"
    || value === "inspector"
    || value === "attendant"
    || value === "marketing"
  );
}

function getCachedClientActor(): Actor | null {
  if (typeof window === "undefined") return null;

  const id = localStorage.getItem("actorPersonId") || "";
  const name = localStorage.getItem("actorName") || "";
  const role = localStorage.getItem("actorRole") || "";
  const valid = UUID_RE.test(id) && !!name && isValidRole(role);
  const key = valid ? `${id}|${name}|${role}` : "";

  if (key === cachedActorKey) return cachedActor;

  cachedActorKey = key;
  cachedActor = valid ? { id, name, role } : null;
  return cachedActor;
}

function getStoredAdminPin(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("adminPin")?.trim() || "";
}

function toAppError(err: unknown): AppError {
  if (err instanceof Error) return err as AppError;
  return new Error("Erro inesperado") as AppError;
}

function parseActor(value: unknown): Actor | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { id?: unknown; name?: unknown; role?: unknown };
  if (
    typeof record.id !== "string"
    || typeof record.name !== "string"
    || typeof record.role !== "string"
    || !isValidRole(record.role)
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    role: record.role,
  };
}

function parseAuthUser(value: unknown): AuthUserInfo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    id?: unknown;
    email?: unknown;
    fullName?: unknown;
    avatarUrl?: unknown;
  };
  if (typeof record.id !== "string") return null;

  return {
    id: record.id,
    email: typeof record.email === "string" ? record.email : null,
    fullName: typeof record.fullName === "string" ? record.fullName : null,
    avatarUrl: typeof record.avatarUrl === "string" ? record.avatarUrl : null,
  };
}

function parseAuthStatus(value: unknown): AuthStatus {
  return value === "approved" || value === "pending" ? value : "anonymous";
}

function parseAuthSource(value: unknown): AuthSource {
  switch (value) {
    case "legacy_header":
    case "beta_admin_fallback":
    case "supabase_link":
    case "supabase_pending":
      return value;
    default:
      return "none";
  }
}

function buildLegacyState(actor: Actor | null): HookState {
  return {
    ready: true,
    actor,
    authStatus: actor ? "approved" : "anonymous",
    authSource: actor ? "legacy_header" : "none",
    authUser: null,
    requestId: null,
    error: null,
  };
}

function buildBetaFallbackState(actor: Actor): HookState {
  return {
    ready: true,
    actor,
    authStatus: "approved",
    authSource: "beta_admin_fallback",
    authUser: null,
    requestId: null,
    error: null,
  };
}

function buildInitialState(): HookState {
  if (isBetaClientVariant()) {
    const storedActor = getCachedClientActor();
    if (storedActor && getStoredAdminPin()) {
      return buildBetaFallbackState(storedActor);
    }
    return {
      ready: false,
      actor: null,
      authStatus: "anonymous",
      authSource: "none",
      authUser: null,
      requestId: null,
      error: null,
    };
  }

  return buildLegacyState(getCachedClientActor());
}

export function getStoredActor(): Actor | null {
  if (typeof window === "undefined") return null;
  return getCachedClientActor();
}

export function notifyAuthStateChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function setStoredActor(actor: Actor) {
  if (typeof window === "undefined") return;
  localStorage.setItem("actorPersonId", actor.id);
  localStorage.setItem("actorName", actor.name);
  localStorage.setItem("actorRole", actor.role);
  window.dispatchEvent(new Event(ACTOR_EVENT));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearStoredActor() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("actorPersonId");
  localStorage.removeItem("actorName");
  localStorage.removeItem("actorRole");
  window.dispatchEvent(new Event(ACTOR_EVENT));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function useActor() {
  const [state, setState] = useState<HookState>(buildInitialState);
  const betaVariant = isBetaClientVariant();

  const refresh = useCallback(async () => {
    const storedActor = getCachedClientActor();
    if (!betaVariant) {
      setState(buildLegacyState(storedActor));
      return;
    }

    if (storedActor && getStoredAdminPin()) {
      setState(buildBetaFallbackState(storedActor));
      return;
    }

    try {
      const payload = (await apiFetch("/api/auth/me")) as AuthMeResponse;
      setState({
        ready: true,
        actor: parseActor(payload.actor),
        authStatus: parseAuthStatus(payload.status),
        authSource: parseAuthSource(payload.source),
        authUser: parseAuthUser(payload.user),
        requestId: typeof payload.requestId === "string" ? payload.requestId : null,
        error: null,
      });
    } catch (err: unknown) {
      const appError = toAppError(err);
      if (appError.status === 401) {
        setState({
          ready: true,
          actor: null,
          authStatus: "anonymous",
          authSource: "none",
          authUser: null,
          requestId: null,
          error: null,
        });
        return;
      }

      setState({
        ready: true,
        actor: null,
        authStatus: "anonymous",
        authSource: "none",
        authUser: null,
        requestId: null,
        error: appError.message || "Falha ao validar sessao.",
      });
    }
  }, [betaVariant]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refresh();
    }, 0);

    const handleChange = () => {
      void refresh();
    };

    if (typeof window === "undefined") return () => {};

    window.addEventListener("storage", handleChange);
    window.addEventListener(ACTOR_EVENT, handleChange);
    window.addEventListener(AUTH_EVENT, handleChange);
    window.addEventListener("focus", handleChange);

    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("storage", handleChange);
      window.removeEventListener(ACTOR_EVENT, handleChange);
      window.removeEventListener(AUTH_EVENT, handleChange);
      window.removeEventListener("focus", handleChange);
    };
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}
