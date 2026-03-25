import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, jsonNoStore } from "@/lib/apiResponse";
import { requireActor } from "@/lib/actor";
import { HttpError } from "@/lib/errors";
import { INSPECTION_TYPE_LABEL, INSPECTION_STATUS_LABEL } from "@/lib/labels";

export const runtime = "nodejs";

const QuerySchema = z.object({
  assignedTo: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const STATUS_COLOR: Record<string, string> = {
  received: "#2563eb",
  in_progress: "#d97706",
  completed: "#059669",
  finalized: "#047857",
};

type CalendarRow = {
  id: string;
  type: "ocupacao" | "desocupacao" | "revistoria" | "visita" | "placa_fotos" | "manutencao";
  status:
    | "new"
    | "received"
    | "in_progress"
    | "completed"
    | "finalized"
    | "canceled";
  property_code: string;
  property_address: string;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number | null;
};

export async function GET(req: Request) {
  try {
    const actor = await requireActor(req);
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      assignedTo: url.searchParams.get("assignedTo") || undefined,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });

    const isFieldWorker = actor.role === "inspector" || actor.role === "marketing";
    const assignedTo = isFieldWorker ? actor.id : query.assignedTo;
    if (!assignedTo) {
      throw new HttpError(400, "assignedTo obrigatório para perfil de solicitação.");
    }

    const sb = supabaseAdmin();
    const assignedToColumn = actor.role === "marketing" ? "assigned_to_marketing" : "assigned_to";
    const { data, error } = await sb
      .from("inspections")
      .select(
        "id,type,status,property_code,property_address,scheduled_start,scheduled_end,duration_minutes",
      )
      .eq(assignedToColumn, assignedTo)
      .neq("status", "canceled")
      .not("scheduled_start", "is", null)
      .not("scheduled_end", "is", null)
      .lt("scheduled_start", query.to)
      .gt("scheduled_end", query.from)
      .order("scheduled_start", { ascending: true });

    if (error) throw new HttpError(500, "Falha ao listar eventos.", error);

    const rows = (data || []) as CalendarRow[];
    const events = rows.map((row) => {
      const typeLabel = INSPECTION_TYPE_LABEL[row.type] || row.type;
      const statusLabel = INSPECTION_STATUS_LABEL[row.status] || row.status;
      const color = STATUS_COLOR[row.status] || "#64748b";
      const codeLabel = row.property_code?.trim() || "Sem código";

      return {
        id: row.id,
        title: `${codeLabel} - ${typeLabel}`,
        start: row.scheduled_start,
        end: row.scheduled_end,
        backgroundColor: color,
        borderColor: color,
        extendedProps: {
          status: row.status,
          statusLabel,
          type: row.type,
          typeLabel,
          property_code: row.property_code,
          property_address: row.property_address,
          duration_minutes: row.duration_minutes,
        },
      };
    });

    return jsonNoStore({ events });
  } catch (err) {
    return apiError(err);
  }
}
