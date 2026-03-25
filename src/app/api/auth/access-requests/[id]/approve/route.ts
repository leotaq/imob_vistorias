import { z } from "zod";

import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireAdminPin } from "@/lib/adminPin";
import { getActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ApproveSchema = z.object({
  personId: z.string().uuid(),
});

type AccessRequestRow = {
  id: string;
  auth_user_id: string;
  email: string;
  provider: string;
  status: string;
};

type ExistingLinkRow = {
  id: string;
  person_id: string;
  auth_user_id: string;
};

function isMissingRelation(error: unknown, relationName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const haystack = `${record.message ?? ""} ${record.details ?? ""}`.toLowerCase();
  return code === "42P01" || code === "PGRST205" || haystack.includes(relationName.toLowerCase());
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireAdminPin(req);

    const { id } = await context.params;
    if (!id) throw new HttpError(400, "Pedido de acesso invalido.");

    const body = ApproveSchema.parse(await req.json());
    const reviewer = await getActor(req).catch(() => null);
    const reviewerId = reviewer?.id ?? null;

    const sb = supabaseAdmin();
    const requestQuery = await sb
      .from("auth_access_requests")
      .select("id,auth_user_id,email,provider,status")
      .eq("id", id)
      .maybeSingle();

    if (requestQuery.error) {
      if (isMissingRelation(requestQuery.error, "auth_access_requests")) {
        throw new HttpError(
          500,
          "Banco beta sem a migration de auth_access_requests.",
          requestQuery.error,
        );
      }
      throw new HttpError(500, "Falha ao buscar pedido de acesso.", requestQuery.error);
    }

    const accessRequest = requestQuery.data as AccessRequestRow | null;
    if (!accessRequest) {
      throw new HttpError(404, "Pedido de acesso nao encontrado.");
    }
    if (accessRequest.status !== "pending") {
      throw new HttpError(409, "Esse pedido nao esta mais pendente.");
    }

    const personQuery = await sb
      .from("people")
      .select("id,active")
      .eq("id", body.personId)
      .maybeSingle();

    if (personQuery.error) {
      throw new HttpError(500, "Falha ao buscar pessoa para vinculacao.", personQuery.error);
    }
    if (!personQuery.data) {
      throw new HttpError(404, "Pessoa selecionada nao encontrada.");
    }
    if (!personQuery.data.active) {
      throw new HttpError(400, "Nao e permitido vincular conta a uma pessoa inativa.");
    }

    const conflictQuery = await sb
      .from("person_auth_links")
      .select("id,person_id,auth_user_id")
      .eq("active", true)
      .or(`person_id.eq.${body.personId},auth_user_id.eq.${accessRequest.auth_user_id}`);

    if (conflictQuery.error) {
      if (isMissingRelation(conflictQuery.error, "person_auth_links")) {
        throw new HttpError(
          500,
          "Banco beta sem a migration de person_auth_links.",
          conflictQuery.error,
        );
      }
      throw new HttpError(500, "Falha ao validar vinculos existentes.", conflictQuery.error);
    }

    const conflicts = (conflictQuery.data || []) as ExistingLinkRow[];
    const exactMatch = conflicts.find(
      (item) =>
        item.person_id === body.personId
        && item.auth_user_id === accessRequest.auth_user_id,
    );
    const blockingConflict = conflicts.find(
      (item) =>
        item.person_id !== body.personId
        || item.auth_user_id !== accessRequest.auth_user_id,
    );

    if (blockingConflict) {
      throw new HttpError(
        409,
        "Ja existe um vinculo ativo para essa pessoa ou para essa conta Google.",
      );
    }

    if (exactMatch) {
      const { error } = await sb
        .from("person_auth_links")
        .update({
          email: accessRequest.email,
          provider: accessRequest.provider || "google",
          active: true,
          revoked_at: null,
          revoked_by: null,
        })
        .eq("id", exactMatch.id);

      if (error) {
        throw new HttpError(500, "Falha ao reativar vinculo existente.", error);
      }
    } else {
      const { error } = await sb
        .from("person_auth_links")
        .insert({
          person_id: body.personId,
          auth_user_id: accessRequest.auth_user_id,
          email: accessRequest.email,
          provider: accessRequest.provider || "google",
          active: true,
          created_by: reviewerId,
        });

      if (error) {
        throw new HttpError(500, "Falha ao criar vinculo da conta Google.", error);
      }
    }

    const { error: reviewError } = await sb
      .from("auth_access_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId,
      })
      .eq("id", id);

    if (reviewError) {
      throw new HttpError(500, "Falha ao atualizar status do pedido.", reviewError);
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
