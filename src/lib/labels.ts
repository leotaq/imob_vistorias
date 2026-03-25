export const INSPECTION_TYPE_LABEL: Record<
  "ocupacao" | "desocupacao" | "revistoria" | "visita" | "placa_fotos" | "manutencao",
  string
> = {
  ocupacao: "🏠 Ocupação",
  desocupacao: "📦 Desocupação",
  revistoria: "🔍 Revistoria",
  visita: "👁️ Visita",
  placa_fotos: "📸 Placa/Fotos",
  manutencao: "🔧 Manutenção",
};

export const INSPECTION_STATUS_LABEL: Record<
  "new" | "received" | "in_progress" | "completed" | "awaiting_contract" | "finalized" | "canceled",
  string
> = {
  new: "Nova",
  received: "Recebida",
  in_progress: "Em andamento",
  completed: "Concluída",
  awaiting_contract: "Sem Contrato",
  finalized: "Finalizada",
  canceled: "Cancelada",
};
