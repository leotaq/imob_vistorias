import type { supabaseAdmin } from "@/lib/supabaseAdmin";

export type InspectionStatus =
  | "new"
  | "received"
  | "in_progress"
  | "completed"
  | "awaiting_contract"
  | "finalized"
  | "canceled";

type SupabaseClient = ReturnType<typeof supabaseAdmin>;

export async function recordInspectionStatusEvent(
  sb: SupabaseClient,
  input: {
    inspectionId: string;
    fromStatus: InspectionStatus | null;
    toStatus: InspectionStatus;
    changedBy: string | null;
    changedAt?: string;
  },
) {
  const { error } = await sb.from("inspection_status_events").insert({
    inspection_id: input.inspectionId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    changed_by: input.changedBy,
    changed_at: input.changedAt ?? new Date().toISOString(),
  });

  if (error) {
    // O historico de status nao pode impedir operacoes principais
    // (criar/agendar/atualizar vistoria). Apenas registra aviso.
    console.warn("Falha ao registrar historico de status.", error);
  }
}
