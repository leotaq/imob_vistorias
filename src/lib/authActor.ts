import "server-only";

import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { HttpError } from "@/lib/errors";
import { requireAdminPin } from "@/lib/adminPin";
import { isBetaServerVariant } from "@/lib/appVariant";

export type PersonRole = "manager" | "inspector" | "attendant" | "marketing";

export type Actor = {
  id: string;
  name: string;
  role: PersonRole;
  active: boolean;
};

export type AuthUserInfo = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export type ResolvedAuthActor =
  | {
    status: "anonymous";
    actor: null;
    source: "none";
    user: null;
    requestId: null;
  }
  | {
    status: "pending";
    actor: null;
    source: "supabase_pending";
    user: AuthUserInfo;
    requestId: string | null;
  }
  | {
    status: "approved";
    actor: Actor;
    source: "legacy_header" | "beta_admin_fallback" | "supabase_link";
    user: AuthUserInfo | null;
    requestId: null;
  };

type LinkedPersonRow = {
  person_id: string;
  people: {
    id: string;
    name: string;
    role: PersonRole;
    active: boolean;
  } | null;
};

function isMissingTableError(error: unknown, relationName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const haystack = `${record.message ?? ""} ${record.details ?? ""}`.toLowerCase();
  return code === "42P01" || code === "PGRST205" || haystack.includes(relationName.toLowerCase());
}

function assertRole(value: string): asserts value is PersonRole {
  if (
    value !== "manager"
    && value !== "inspector"
    && value !== "attendant"
    && value !== "marketing"
  ) {
    throw new HttpError(500, "Pessoa com papel invalido no banco.");
  }
}

async function resolveLegacyHeaderActor(req: Request): Promise<Actor | null> {
  const actorId = req.headers.get("x-actor-id");
  if (!actorId) return null;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("people")
    .select("id,name,role,active")
    .eq("id", actorId)
    .maybeSingle();

  if (error) throw new HttpError(500, "Falha ao buscar pessoa.", error);
  if (!data) throw new HttpError(403, "Pessoa nao encontrada.");
  if (!data.active) throw new HttpError(403, "Pessoa inativa.");
  assertRole(data.role);

  return data as Actor;
}

function toAuthUserInfo(user: User): AuthUserInfo {
  const metadata = user.user_metadata ?? {};
  const fullName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;
  const avatarUrl =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : null;

  return {
    id: user.id,
    email: user.email ?? null,
    fullName,
    avatarUrl,
  };
}

async function resolveSupabaseUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new HttpError(401, "Nao foi possivel validar a sessao atual.", error);
  }
  return data.user ?? null;
}

async function findLinkedActor(user: User): Promise<Actor | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("person_auth_links")
    .select("person_id,people:person_id(id,name,role,active)")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "person_auth_links")) {
      throw new HttpError(
        500,
        "Banco beta sem migration de auth. Crie as tabelas de autenticacao antes de usar login Google.",
        error,
      );
    }
    throw new HttpError(500, "Falha ao buscar vinculo de autenticacao.", error);
  }

  const row = data as LinkedPersonRow | null;
  if (!row?.people) return null;
  if (!row.people.active) {
    throw new HttpError(403, "Pessoa vinculada esta inativa.");
  }
  assertRole(row.people.role);
  return row.people;
}

async function ensurePendingAccessRequest(user: User): Promise<string | null> {
  const sb = supabaseAdmin();
  const info = toAuthUserInfo(user);

  const { data, error } = await sb
    .from("auth_access_requests")
    .upsert(
      {
        auth_user_id: user.id,
        email: info.email ?? "",
        full_name: info.fullName,
        avatar_url: info.avatarUrl,
        provider: "google",
        status: "pending",
      },
      { onConflict: "auth_user_id" },
    )
    .select("id")
    .single();

  if (error) {
    if (isMissingTableError(error, "auth_access_requests")) {
      throw new HttpError(
        500,
        "Banco beta sem migration de auth_access_requests. Crie as tabelas de auth antes de liberar o login Google.",
        error,
      );
    }
    throw new HttpError(500, "Falha ao registrar solicitacao de acesso.", error);
  }

  return (data as { id?: string } | null)?.id ?? null;
}

function adminFallbackAuthorized(req: Request): boolean {
  try {
    requireAdminPin(req);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAuthActor(req: Request): Promise<ResolvedAuthActor> {
  if (!isBetaServerVariant()) {
    const actor = await resolveLegacyHeaderActor(req);
    if (!actor) {
      return { status: "anonymous", actor: null, source: "none", user: null, requestId: null };
    }
    return {
      status: "approved",
      actor,
      source: "legacy_header",
      user: null,
      requestId: null,
    };
  }

  if (adminFallbackAuthorized(req)) {
    const fallbackActor = await resolveLegacyHeaderActor(req);
    if (fallbackActor) {
      return {
        status: "approved",
        actor: fallbackActor,
        source: "beta_admin_fallback",
        user: null,
        requestId: null,
      };
    }
  }

  const user = await resolveSupabaseUser();
  if (!user) {
    return { status: "anonymous", actor: null, source: "none", user: null, requestId: null };
  }

  const actor = await findLinkedActor(user);
  if (actor) {
    return {
      status: "approved",
      actor,
      source: "supabase_link",
      user: toAuthUserInfo(user),
      requestId: null,
    };
  }

  const requestId = await ensurePendingAccessRequest(user);
  return {
    status: "pending",
    actor: null,
    source: "supabase_pending",
    user: toAuthUserInfo(user),
    requestId,
  };
}
