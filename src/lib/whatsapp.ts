import "server-only";

import { normalizePhone } from "@/lib/phone";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type NotificationInspection = {
  id: string;
  type: "ocupacao" | "desocupacao" | "revistoria" | "visita" | "placa_fotos" | "manutencao";
  property_code: string;
  property_address: string;
  scheduled_start: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  created_by: string;
  assigned_to: string;
  assigned_to_marketing?: string | null;
  created_by_person_name: string | null;
  assigned_to_person_name: string | null;
  assigned_to_marketing_person_name?: string | null;
};

type NotificationEvent =
  | "inspection_assigned_to_inspector"
  | "inspection_assigned_to_marketing"
  | "inspection_scheduled"
  | "inspection_completed";

export type NotificationDispatchResult = {
  enabled: boolean;
  recipients: number;
  sent: number;
  failed: number;
};

function normalizeEnv(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "undefined" || lowered === "null" || lowered === "none") {
    return null;
  }
  return trimmed;
}

function notificationsEnabled(): boolean {
  return process.env.WHATSAPP_NOTIFICATIONS_ENABLED === "1";
}

function getDefaultCountryCode(): string {
  return normalizeEnv(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE) ?? "55";
}

function getTimezone(): string {
  return normalizeEnv(process.env.WHATSAPP_TIMEZONE) ?? "America/Sao_Paulo";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Não informado";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informado";

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: getTimezone(),
  });
  return formatter.format(date);
}

function inspectionCodeLabel(propertyCode: string): string {
  const cleaned = propertyCode.trim();
  return cleaned || "Sem código";
}

const INSPECTION_TYPE_LABEL: Record<NotificationInspection["type"], string> = {
  ocupacao: "Ocupacao",
  desocupacao: "Desocupacao",
  revistoria: "Revistoria",
  visita: "Visita",
  placa_fotos: "Placa/Fotos",
  manutencao: "Manutencao",
};

function parseExtraRecipients(): string[] {
  const raw = normalizeEnv(process.env.WHATSAPP_NOTIFY_EXTRA_TO);
  if (!raw) return [];

  const countryCode = getDefaultCountryCode();
  return raw
    .split(",")
    .map((item) => normalizePhone(item, countryCode))
    .filter((item): item is string => Boolean(item));
}

async function resolvePersonPhone(personId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("people")
    .select("phone")
    .eq("id", personId)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp] Falha ao consultar telefone da pessoa.", error);
    return null;
  }

  if (!data || typeof data.phone !== "string") return null;
  return normalizePhone(data.phone, getDefaultCountryCode());
}

function buildAssignedToInspectorMessage(inspection: NotificationInspection): string {
  const codeLabel = inspectionCodeLabel(inspection.property_code);
  const typeLabel = INSPECTION_TYPE_LABEL[inspection.type];
  return [
    "*Nova solicitacao de vistoria*",
    "",
    `*Codigo:* ${codeLabel}`,
    `*Tipo:* ${typeLabel}`,
    `*Imovel:* ${inspection.property_address}`,
    "",
    `*Solicitante:* ${inspection.created_by_person_name ?? "Nao informado"}`,
    `*Vistoriador:* ${inspection.assigned_to_person_name ?? "Nao informado"}`,
  ].join("\n");
}

function buildScheduledMessage(inspection: NotificationInspection): string {
  const codeLabel = inspectionCodeLabel(inspection.property_code);
  const typeLabel = INSPECTION_TYPE_LABEL[inspection.type];
  return [
    "*Vistoria agendada*",
    "",
    `*Codigo:* ${codeLabel}`,
    `*Tipo:* ${typeLabel}`,
    `*Imovel:* ${inspection.property_address}`,
    "",
    `*Solicitante:* ${inspection.created_by_person_name ?? "Nao informado"}`,
    `*Vistoriador:* ${inspection.assigned_to_person_name ?? "Nao informado"}`,
    `*Inicio:* ${formatDateTime(inspection.scheduled_start)}`,
    `*Duracao:* ${inspection.duration_minutes ?? 0} min`,
  ].join("\n");
}

function buildCompletedMessage(inspection: NotificationInspection): string {
  const codeLabel = inspectionCodeLabel(inspection.property_code);
  const typeLabel = INSPECTION_TYPE_LABEL[inspection.type];
  return [
    "*Vistoria concluida*",
    "",
    `*Codigo:* ${codeLabel}`,
    `*Tipo:* ${typeLabel}`,
    `*Imovel:* ${inspection.property_address}`,
    "",
    `*Solicitante:* ${inspection.created_by_person_name ?? "Nao informado"}`,
    `*Vistoriador:* ${inspection.assigned_to_person_name ?? "Nao informado"}`,
    `*Concluida em:* ${formatDateTime(inspection.completed_at)}`,
  ].join("\n");
}

async function sendViaWebhook(opts: {
  recipient: string;
  message: string;
  event: NotificationEvent;
  inspection: NotificationInspection;
}) {
  const webhookUrl = normalizeEnv(process.env.WHATSAPP_WEBHOOK_URL);
  if (!webhookUrl) {
    throw new Error("WHATSAPP_WEBHOOK_URL ausente.");
  }

  const token = normalizeEnv(process.env.WHATSAPP_WEBHOOK_TOKEN);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event: opts.event,
      to: opts.recipient,
      message: opts.message,
      inspection: {
        id: opts.inspection.id,
        code: opts.inspection.property_code,
        type: opts.inspection.type,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook rejeitou envio (${response.status}): ${body}`);
  }
}

async function sendViaMeta(opts: { recipient: string; message: string }) {
  const token = normalizeEnv(process.env.WHATSAPP_META_ACCESS_TOKEN);
  const phoneNumberId = normalizeEnv(process.env.WHATSAPP_META_PHONE_NUMBER_ID);
  const version = normalizeEnv(process.env.WHATSAPP_META_API_VERSION) ?? "v22.0";

  if (!token || !phoneNumberId) {
    throw new Error(
      "WHATSAPP_META_ACCESS_TOKEN e WHATSAPP_META_PHONE_NUMBER_ID são obrigatórios para provider meta.",
    );
  }

  const recipientDigits = opts.recipient.replace(/\D/g, "");
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipientDigits,
      type: "text",
      text: {
        body: opts.message,
        preview_url: false,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta rejeitou envio (${response.status}): ${body}`);
  }
}

async function dispatchMessage(opts: {
  recipient: string;
  message: string;
  event: NotificationEvent;
  inspection: NotificationInspection;
}) {
  const provider = (normalizeEnv(process.env.WHATSAPP_PROVIDER) ?? "webhook")
    .toLowerCase();

  if (provider === "meta") {
    await sendViaMeta({ recipient: opts.recipient, message: opts.message });
    return;
  }

  await sendViaWebhook({
    recipient: opts.recipient,
    message: opts.message,
    event: opts.event,
    inspection: opts.inspection,
  });
}

async function notify(
  event: NotificationEvent,
  inspection: NotificationInspection,
  message: string,
) : Promise<NotificationDispatchResult> {
  if (!notificationsEnabled()) {
    return { enabled: false, recipients: 0, sent: 0, failed: 0 };
  }
  const recipientPersonIds =
    event === "inspection_assigned_to_inspector"
      ? [inspection.assigned_to]
      : event === "inspection_assigned_to_marketing"
        ? [inspection.assigned_to_marketing].filter((id): id is string => Boolean(id))
        : [inspection.created_by];

  const recipients = new Set<string>();
  for (const personId of recipientPersonIds) {
    const personPhone = await resolvePersonPhone(personId);
    if (personPhone) recipients.add(personPhone);
  }
  for (const phone of parseExtraRecipients()) recipients.add(phone);

  if (recipients.size === 0) {
    console.info(
      `[whatsapp] Sem destinatários para ${event} na vistoria ${inspection.id}.`,
    );
    return { enabled: true, recipients: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await dispatchMessage({ recipient, message, event, inspection });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[whatsapp] Falha ao enviar ${event} para ${recipient} (vistoria ${inspection.id}).`,
        error,
      );
    }
  }

  return { enabled: true, recipients: recipients.size, sent, failed };
}

export async function notifyInspectionAssignedToInspector(
  inspection: NotificationInspection,
) {
  return notify(
    "inspection_assigned_to_inspector",
    inspection,
    buildAssignedToInspectorMessage(inspection),
  );
}

function buildAssignedToMarketingMessage(inspection: NotificationInspection): string {
  const codeLabel = inspectionCodeLabel(inspection.property_code);
  const typeLabel = INSPECTION_TYPE_LABEL[inspection.type];
  return [
    "*Nova solicitacao de fotos/placas*",
    "",
    `*Codigo:* ${codeLabel}`,
    `*Tipo:* ${typeLabel}`,
    `*Imovel:* ${inspection.property_address}`,
    "",
    `*Solicitante:* ${inspection.created_by_person_name ?? "Nao informado"}`,
    `*Marketing:* ${inspection.assigned_to_marketing_person_name ?? "Nao informado"}`,
    `*Vistoriador:* ${inspection.assigned_to_person_name ?? "Nao informado"}`,
  ].join("\n");
}

export async function notifyInspectionAssignedToMarketing(
  inspection: NotificationInspection,
) {
  return notify(
    "inspection_assigned_to_marketing",
    inspection,
    buildAssignedToMarketingMessage(inspection),
  );
}

export async function notifyInspectionScheduled(inspection: NotificationInspection) {
  return notify(
    "inspection_scheduled",
    inspection,
    buildScheduledMessage(inspection),
  );
}

export async function notifyInspectionCompleted(inspection: NotificationInspection) {
  return notify(
    "inspection_completed",
    inspection,
    buildCompletedMessage(inspection),
  );
}
