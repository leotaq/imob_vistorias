import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireAdminPin } from "@/lib/adminPin";
import { HttpError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isMissingRelation(error: unknown, relationName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const haystack = `${record.message ?? ""} ${record.details ?? ""}`.toLowerCase();
  return code === "42P01" || code === "PGRST205" || haystack.includes(relationName.toLowerCase());
}

export async function GET(req: Request) {
  try {
    requireAdminPin(req);

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("auth_access_requests")
      .select("id,auth_user_id,email,full_name,avatar_url,provider,status,requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    if (error) {
      if (isMissingRelation(error, "auth_access_requests")) {
        throw new HttpError(
          500,
          "Banco beta sem a migration de auth_access_requests. Execute as migrations da beta antes de listar acessos.",
          error,
        );
      }
      throw new HttpError(500, "Falha ao listar pedidos de acesso.", error);
    }

    return jsonNoStore({ requests: data || [] });
  } catch (err) {
    return apiError(err);
  }
}
