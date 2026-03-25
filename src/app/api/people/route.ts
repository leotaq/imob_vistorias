import { z } from "zod";

import { getActor } from "@/lib/actor";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { isBetaServerVariant } from "@/lib/appVariant";
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const role = url.searchParams.get("role");

    if (isBetaServerVariant()) {
      const actor = await getActor(req).catch(() => null);
      let hasAdminPin = false;
      try {
        requireAdminPin(req);
        hasAdminPin = true;
      } catch {
        hasAdminPin = false;
      }

      if (includeInactive && !hasAdminPin) {
        throw new HttpError(401, "PIN admin obrigatorio para listar pessoas inativas.");
      }
      if (!hasAdminPin && !actor) {
        throw new HttpError(401, "Sessao obrigatoria para listar pessoas na beta.");
      }
    }

    const sb = supabaseAdmin();
    let q = sb.from("people").select("id,name,role,active,phone,created_at");
    if (!includeInactive) q = q.eq("active", true);
    if (role === "manager" || role === "inspector" || role === "attendant" || role === "marketing") {
      q = q.eq("role", role);
    }

    const withPhone = await q.order("role").order("name");
    if (withPhone.error && isMissingPhoneColumnError(withPhone.error)) {
      let fallback = sb.from("people").select("id,name,role,active,created_at");
      if (!includeInactive) fallback = fallback.eq("active", true);
      if (role === "manager" || role === "inspector" || role === "attendant" || role === "marketing") {
        fallback = fallback.eq("role", role);
      }

      const withoutPhone = await fallback.order("role").order("name");
      if (withoutPhone.error) {
        console.error("GET /api/people failed", withoutPhone.error);
        throw new HttpError(500, "Falha ao listar pessoas.");
      }

      const people = (withoutPhone.data || []).map((person) => ({
        ...person,
        phone: null,
      }));
      return jsonNoStore({ people });
    }

    if (withPhone.error) {
      console.error("GET /api/people failed", withPhone.error);
      throw new HttpError(500, "Falha ao listar pessoas.");
    }

    return jsonNoStore({ people: withPhone.data || [] });
  } catch (err) {
    return apiError(err);
  }
}

const PersonCreateSchema = z.object({
  name: z.string().trim().min(1),
  role: z.enum(["manager", "inspector", "attendant", "marketing"]),
  active: z.boolean().optional(),
  phone: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    requireAdminPin(req);

    const body = PersonCreateSchema.parse(await req.json());
    const normalizedPhone = normalizePhone(body.phone ?? null);
    if (typeof body.phone === "string" && body.phone.trim() && !normalizedPhone) {
      throw new HttpError(
        400,
        "Telefone/WhatsApp inválido. Use formato com DDD, ex: +5511999999999.",
      );
    }

    const sb = supabaseAdmin();
    const insertPayload: {
      name: string;
      role: "manager" | "inspector" | "attendant" | "marketing";
      active: boolean;
      phone?: string;
    } = {
      name: body.name,
      role: body.role,
      active: body.active ?? true,
    };
    if (normalizedPhone) insertPayload.phone = normalizedPhone;

    const { data, error } = await sb
      .from("people")
      .insert(insertPayload)
      .select("id,name,role,active,created_at")
      .single();

    if (error) {
      if (normalizedPhone && isMissingPhoneColumnError(error)) {
        throw new HttpError(
          500,
          "Banco desatualizado para WhatsApp. Execute a migration de telefone e tente novamente.",
        );
      }
      console.error("POST /api/people failed", error);
      throw new HttpError(500, "Falha ao criar pessoa.");
    }
    return jsonNoStore({ person: { ...data, phone: normalizedPhone ?? null } }, 201);
  } catch (err) {
    return apiError(err);
  }
}
