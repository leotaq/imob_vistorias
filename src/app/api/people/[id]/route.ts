import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireAdminPin } from "@/lib/adminPin";
import { HttpError } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";

type PgErrorLike = { code?: string };

function getPgCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const pg = error as PgErrorLike;
  return typeof pg.code === "string" ? pg.code : null;
}

function isMissingPhoneColumnError(error: unknown): boolean {
  const code = getPgCode(error);
  if (code === "42703" || code === "PGRST204") return true;

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
    return message.includes("people.phone") && message.includes("does not exist");
  }

  return false;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const sb = supabaseAdmin();
    const withPhone = await sb
      .from("people")
      .select("id,name,role,active,phone,created_at")
      .eq("id", id)
      .maybeSingle();

    if (withPhone.error && isMissingPhoneColumnError(withPhone.error)) {
      const withoutPhone = await sb
        .from("people")
        .select("id,name,role,active,created_at")
        .eq("id", id)
        .maybeSingle();

      if (withoutPhone.error) {
        throw new HttpError(500, "Falha ao buscar pessoa.", withoutPhone.error);
      }
      if (!withoutPhone.data) throw new HttpError(404, "Pessoa não encontrada.");

      return jsonNoStore({ person: { ...withoutPhone.data, phone: null } });
    }

    if (withPhone.error) throw new HttpError(500, "Falha ao buscar pessoa.", withPhone.error);
    if (!withPhone.data) throw new HttpError(404, "Pessoa não encontrada.");

    return jsonNoStore({ person: withPhone.data });
  } catch (err) {
    return apiError(err);
  }
}

const PersonPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: z.enum(["manager", "inspector", "attendant", "marketing"]).optional(),
    active: z.boolean().optional(),
    phone: z.string().optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, "Informe algum campo para editar.");

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    requireAdminPin(req);

    const { id } = await ctx.params;
    const body = PersonPatchSchema.parse(await req.json());
    const patch = { ...body };
    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      const normalizedPhone = normalizePhone(body.phone ?? null);
      if (typeof body.phone === "string" && body.phone.trim() && !normalizedPhone) {
        throw new HttpError(
          400,
          "Telefone/WhatsApp inválido. Use formato com DDD, ex: +5511999999999.",
        );
      }
      patch.phone = normalizedPhone;
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("people")
      .update(patch)
      .eq("id", id)
      .select("id,name,role,active,created_at")
      .single();

    if (error) {
      if (
        Object.prototype.hasOwnProperty.call(patch, "phone")
        && isMissingPhoneColumnError(error)
      ) {
        throw new HttpError(
          500,
          "Banco desatualizado para WhatsApp. Execute a migration de telefone e tente novamente.",
        );
      }
      throw new HttpError(500, "Falha ao editar pessoa.", error);
    }
    return jsonNoStore({ person: { ...data, phone: patch.phone ?? null } });
  } catch (err) {
    return apiError(err);
  }
}
