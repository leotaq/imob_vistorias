"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type MutableRefObject,
  type RefAttributes,
} from "react";
import dynamic from "next/dynamic";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { EChartsOption } from "echarts";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import { useActor } from "@/hooks/useActor";
import { apiFetch } from "@/lib/clientApi";

type EChartsComponentProps = {
  option: EChartsOption;
  style?: CSSProperties;
  className?: string;
};

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
}) as unknown as ForwardRefExoticComponent<
  EChartsComponentProps & RefAttributes<unknown>
>;

type EchartsChartInstance = {
  getDataURL: (opts: {
    type: "png";
    pixelRatio: number;
    backgroundColor: string;
  }) => string;
};

type EchartsComponentRef = {
  getEchartsInstance: () => EchartsChartInstance;
};

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

function isEchartsRef(value: unknown): value is EchartsComponentRef {
  if (!value || typeof value !== "object") return false;
  return "getEchartsInstance" in value;
}

type DashboardMetricsPayload = {
  periodo: {
    from: string;
    to: string;
    timezone: string;
  };
  filtrosAplicados: {
    managerId: string | null;
    inspectorId: string | null;
    types: string[];
    statuses: string[];
    cities: string[];
  };
  kpis: {
    criadas_no_periodo: number;
    em_aberto_atual: number;
    concluidas_no_periodo: number;
    finalizadas_no_periodo: number;
    canceladas_no_periodo: number;
    atrasadas_ativas: number;
    sla_no_prazo_percentual: number;
    tempo_medio_conclusao_horas: number;
  };
  por_tipo: Array<{ key: string; label: string; total: number }>;
  por_cidade: Array<{ city: string; total: number }>;
  por_status: Array<{ key: string; label: string; total: number }>;
  evolucao_diaria: Array<{ date: string; total: number }>;
  ranking_gestoras: Array<{ person_id: string; name: string; total: number }>;
  ranking_vistoriadores: Array<{
    person_id: string;
    name: string;
    total: number;
    concluidas: number;
  }>;
  options: {
    cities: string[];
    types: Array<{ value: string; label: string }>;
    statuses: Array<{ value: string; label: string }>;
    managers: Array<{ id: string; name: string }>;
    inspectors: Array<{ id: string; name: string }>;
  };
};

function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function getDefaultPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(year, month, 0).getDate(),
  ).padStart(2, "0")}`;
  return { from, to };
}

function toggleListValue(current: string[], value: string) {
  if (current.includes(value)) return current.filter((item) => item !== value);
  return [...current, value];
}

function getChartImage(ref: MutableRefObject<unknown>) {
  if (!isEchartsRef(ref.current)) return null;
  const chart = ref.current.getEchartsInstance();
  return chart.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor: "#0c1830",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const { ready, actor, authStatus } = useActor();
  const periodDefault = useMemo(() => getDefaultPeriod(), []);

  const [fromDate, setFromDate] = useState(periodDefault.from);
  const [toDate, setToDate] = useState(periodDefault.to);
  const [managerId, setManagerId] = useState("");
  const [inspectorId, setInspectorId] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardMetricsPayload | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const evolutionRef = useRef<unknown>(null);
  const typeRef = useRef<unknown>(null);
  const cityRef = useRef<unknown>(null);
  const statusRef = useRef<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    if (actor) return;
    router.replace(authStatus === "pending" ? "/acesso-pendente" : "/");
  }, [ready, actor, authStatus, router]);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set("from", fromDate);
      query.set("to", toDate);
      if (managerId) query.set("managerId", managerId);
      if (inspectorId) query.set("inspectorId", inspectorId);
      selectedTypes.forEach((item) => query.append("type[]", item));
      selectedStatuses.forEach((item) => query.append("status[]", item));
      selectedCities.forEach((item) => query.append("city[]", item));

      const data = (await apiFetch(
        `/api/dashboard/metrics?${query.toString()}`,
      )) as DashboardMetricsPayload;
      setPayload(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Falha ao carregar dashboard.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, managerId, inspectorId, selectedTypes, selectedStatuses, selectedCities]);

  useEffect(() => {
    if (!ready || !actor) return;
    fetchMetrics().catch(() => {
      setError("Falha ao carregar dashboard.");
    });
  }, [ready, actor, fetchMetrics]);

  const evolutionOption = useMemo<EChartsOption>(() => {
    const series = payload?.evolucao_diaria || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: series.map((item) => formatDateOnly(item.date)),
        axisLine: { lineStyle: { color: "#243d6a" } },
        axisLabel: { color: "#90aace" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#1a2d4a", type: "dashed" } },
        axisLabel: { color: "#90aace" },
      },
      series: [
        {
          name: "Criadas",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { color: "#4f8ef7", width: 3 },
          data: series.map((item) => item.total),
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(79,142,247,0.35)" },
                { offset: 1, color: "rgba(79,142,247,0.0)" },
              ],
            },
          },
        },
      ],
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
    };
  }, [payload]);

  const byTypeOption = useMemo<EChartsOption>(() => {
    const data = payload?.por_tipo || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#1a2d4a", type: "dashed" } },
        axisLabel: { color: "#90aace" },
      },
      yAxis: {
        type: "category",
        data: data.map((item) => item.label),
        axisLine: { lineStyle: { color: "#243d6a" } },
        axisLabel: { color: "#90aace", margin: 12 },
      },
      series: [
        {
          type: "bar",
          data: data.map((item) => item.total),
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: "#4f8ef7" },
                { offset: 1, color: "#1a3c80" },
              ]
            },
            borderRadius: [0, 4, 4, 0]
          },
          barMaxWidth: 24,
        },
      ],
      grid: { left: 110, right: 20, top: 20, bottom: 24 },
    };
  }, [payload]);

  const byCityOption = useMemo<EChartsOption>(() => {
    const data = payload?.por_cidade || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#90aace" } },
      series: [
        {
          name: "Cidades",
          type: "pie",
          radius: ["42%", "72%"],
          data: data.map((item) => ({ name: item.city, value: item.total })),
          label: { formatter: "{b}: {d}%", color: "#c2d0e3" },
        },
      ],
    };
  }, [payload]);

  const byStatusOption = useMemo<EChartsOption>(() => {
    const data = payload?.por_status || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "category",
        data: data.map((item) => item.label),
        axisLine: { lineStyle: { color: "#243d6a" } },
        axisLabel: { color: "#90aace", margin: 12 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#1a2d4a", type: "dashed" } },
        axisLabel: { color: "#90aace" },
      },
      series: [
        {
          type: "bar",
          data: data.map((item) => item.total),
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#818cf8" },
                { offset: 1, color: "#3730a3" },
              ]
            },
            borderRadius: [4, 4, 0, 0]
          },
          barMaxWidth: 36,
        },
      ],
      grid: { left: 40, right: 20, top: 20, bottom: 42 },
    };
  }, [payload]);

  async function exportPdf() {
    if (!payload) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF("p", "pt", "a4");
      const pdfDoc = doc as JsPdfWithAutoTable;

      const logoResponse = await fetch("/download.png").catch(() => null);
      if (logoResponse?.ok) {
        const blob = await logoResponse.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(blob);
        });
        if (base64) {
          doc.addImage(base64, "PNG", 40, 26, 38, 38);
        }
      }

      doc.setFontSize(18);
      doc.text("Alice Imoveis Vistorias", 88, 44);
      doc.setFontSize(11);
      doc.text(
        `Relatorio mensal: ${formatDateOnly(payload.periodo.from)} a ${formatDateOnly(payload.periodo.to)}`,
        88,
        62,
      );

      autoTable(doc, {
        startY: 86,
        head: [["Indicador", "Valor"]],
        body: [
          ["Criadas no periodo", String(payload.kpis.criadas_no_periodo)],
          ["Em aberto operacional", String(payload.kpis.em_aberto_atual)],
          ["Concluidas no periodo (etapa)", String(payload.kpis.concluidas_no_periodo)],
          ["Finalizadas no periodo (inclui concluidas)", String(payload.kpis.finalizadas_no_periodo)],
          ["Canceladas no periodo", String(payload.kpis.canceladas_no_periodo)],
          ["Atrasadas ativas", String(payload.kpis.atrasadas_ativas)],
          ["SLA no prazo (%)", `${payload.kpis.sla_no_prazo_percentual.toFixed(2)}%`],
          ["Tempo medio de conclusao (h)", payload.kpis.tempo_medio_conclusao_horas.toFixed(2)],
        ],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 103, 252] },
      });

      let cursorY = (pdfDoc.lastAutoTable?.finalY ?? 86) + 18;

      autoTable(doc, {
        startY: cursorY,
        head: [["Tipos", "Total"]],
        body: payload.por_tipo.map((item) => [item.label, String(item.total)]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 103, 252] },
      });

      cursorY = (pdfDoc.lastAutoTable?.finalY ?? cursorY) + 14;
      autoTable(doc, {
        startY: cursorY,
        head: [["Cidades", "Total"]],
        body: payload.por_cidade.map((item) => [item.city, String(item.total)]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 37, 206] },
      });

      cursorY = (pdfDoc.lastAutoTable?.finalY ?? cursorY) + 14;
      autoTable(doc, {
        startY: cursorY,
        head: [["Status", "Total"]],
        body: payload.por_status.map((item) => [item.label, String(item.total)]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [15, 23, 42] },
      });

      cursorY = (pdfDoc.lastAutoTable?.finalY ?? cursorY) + 14;
      autoTable(doc, {
        startY: cursorY,
        head: [["Evolucao diaria", "Total"]],
        body: payload.evolucao_diaria.map((item) => [formatDateOnly(item.date), String(item.total)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [0, 103, 252] },
      });

      cursorY = (pdfDoc.lastAutoTable?.finalY ?? cursorY) + 14;
      const chartImages = [
        getChartImage(evolutionRef),
        getChartImage(typeRef),
        getChartImage(cityRef),
        getChartImage(statusRef),
      ].filter((item): item is string => Boolean(item));

      chartImages.forEach((image, idx) => {
        if (cursorY > 700) {
          doc.addPage();
          cursorY = 40;
        }
        doc.setFontSize(11);
        doc.text(`Grafico ${idx + 1}`, 40, cursorY);
        doc.addImage(image, "PNG", 40, cursorY + 8, 515, 170);
        cursorY += 190;
      });

      cursorY += 14;
      if (cursorY > 640) {
        doc.addPage();
        cursorY = 40;
      }

      autoTable(doc, {
        startY: cursorY,
        head: [["Ranking Gestoras", "Total"]],
        body: payload.ranking_gestoras.map((item) => [item.name, String(item.total)]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 37, 206] },
      });

      const finalY = (pdfDoc.lastAutoTable?.finalY ?? cursorY) + 14;
      autoTable(doc, {
        startY: finalY,
        head: [["Ranking Vistoriadores", "Total", "Encerradas"]],
        body: payload.ranking_vistoriadores.map((item) => [
          item.name,
          String(item.total),
          String(item.concluidas),
        ]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 103, 252] },
      });

      doc.save(
        `relatorio-vistorias-${payload.periodo.from}-a-${payload.periodo.to}.pdf`,
      );
    } finally {
      setExportingPdf(false);
    }
  }

  if (!ready) return null;

  const typeOptions = payload?.options.types || [];
  const statusOptions = payload?.options.statuses || [];
  const cityOptions = payload?.options.cities || [];
  const managerOptions = payload?.options.managers || [];
  const inspectorOptions = payload?.options.inspectors || [];

  return (
    <div className="space-y-6">
      {/* HEADER PRINCIPAL */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[var(--card)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(680px_circle_at_100%_0%,rgba(0,103,252,0.1),transparent_56%),radial-gradient(520px_circle_at_0%_100%,rgba(0,37,206,0.06),transparent_62%)]" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Painel Executivo
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Dashboard Operacional
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Acompanhe em tempo real o desempenho de vistoriadores, evolução de status e volume de demandas em todas as regiões.
          </p>
        </div>
      </div>

      {/* PAINEL DE FILTROS */}
      <div className="rounded-3xl border border-slate-200 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Controles do Relatório
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-end">
          <div className="grid gap-1.5 min-w-[120px]">
            <span className="text-xs font-semibold text-slate-600">De</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
          <div className="grid gap-1.5 min-w-[120px]">
            <span className="text-xs font-semibold text-slate-600">Ate</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Gestora</span>
            <select
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Todas</option>
              {managerOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">Vistoriador</span>
            <select
              value={inspectorId}
              onChange={(event) => setInspectorId(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Todos</option>
              {inspectorOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 xl:col-span-2">
            <Button variant="primary" onClick={fetchMetrics} className="w-full">
              Aplicar filtros
            </Button>
            <Button
              variant="secondary"
              onClick={exportPdf}
              disabled={!payload || exportingPdf}
              className="w-full"
            >
              {exportingPdf ? "Exportando..." : "Gerar PDF"}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-col md:flex-row flex-wrap gap-x-8 gap-y-3 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Tipos:</span>
            <div className="flex flex-wrap gap-1.5">
              {typeOptions.map((item) => {
                const selected = selectedTypes.includes(item.value);
                return (
                  <button
                    key={item.value}
                    onClick={() => setSelectedTypes((prev) => toggleListValue(prev, item.value))}
                    className={[
                      "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      selected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 bg-opacity-70",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Status:</span>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((item) => {
                const selected = selectedStatuses.includes(item.value);
                return (
                  <button
                    key={item.value}
                    onClick={() => setSelectedStatuses((prev) => toggleListValue(prev, item.value))}
                    className={[
                      "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      selected
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 bg-opacity-70",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Cidades:</span>
            <div className="flex flex-wrap gap-1.5">
              {cityOptions.map((item) => {
                const selected = selectedCities.includes(item);
                return (
                  <button
                    key={item}
                    onClick={() => setSelectedCities((prev) => toggleListValue(prev, item))}
                    className={[
                      "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      selected
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 bg-opacity-70",
                    ].join(" ")}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-600">Carregando metricas...</p>}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {payload && !loading && !error && (
        <>
          {/* CARDS DE KPIS */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-blue-50 opacity-50 blur-xl" />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total de Entradas
                </p>
                <div className="flex items-end gap-2">
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900">
                    {payload.kpis.criadas_no_periodo}
                  </p>
                  <p className="mb-1 text-sm font-semibold text-blue-600">no período</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-amber-200 opacity-40 blur-xl" />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Em Aberto Operacional
                </p>
                <div className="flex items-end gap-2">
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-amber-900">
                    {payload.kpis.em_aberto_atual}
                  </p>
                  <p className="mb-1 text-sm font-semibold text-amber-700">ativas agora</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-emerald-200 opacity-40 blur-xl" />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Sucesso no Prazo (SLA)
                </p>
                <div className="flex items-end gap-1">
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-emerald-900">
                    {payload.kpis.sla_no_prazo_percentual.toFixed(1)}
                  </p>
                  <p className="mb-1 text-lg font-bold text-emerald-600">%</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
              <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-purple-200 opacity-40 blur-xl" />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-800">
                  Tempo Médio de Fechamento
                </p>
                <div className="flex items-end gap-1">
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-purple-900">
                    {payload.kpis.tempo_medio_conclusao_horas.toFixed(1)}
                  </p>
                  <p className="mb-1 text-lg font-bold text-purple-600">horas</p>
                </div>
              </div>
            </div>

          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Evolucao diaria</h2>
              <ReactECharts ref={evolutionRef} option={evolutionOption} style={{ height: 280 }} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Volume por tipo</h2>
              <ReactECharts ref={typeRef} option={byTypeOption} style={{ height: 280 }} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Distribuicao por cidade</h2>
              <ReactECharts ref={cityRef} option={byCityOption} style={{ height: 280 }} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Status no periodo</h2>
              <p className="mb-3 text-xs text-slate-500">
                Neste grafico, Concluida entra somada em Finalizada.
              </p>
              <ReactECharts ref={statusRef} option={byStatusOption} style={{ height: 280 }} />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Top Gestoras</h3>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Por volume</span>
              </div>
              <div className="space-y-3">
                {payload.ranking_gestoras.map((item, idx) => {
                  const isTop3 = idx < 3;
                  const maxTotal = payload.ranking_gestoras[0]?.total || 1;
                  const percent = Math.max(5, (item.total / maxTotal) * 100);

                  return (
                    <div key={item.person_id} className="group relative overflow-hidden rounded-2xl bg-slate-50 p-1">
                      <div
                        className="absolute bottom-0 left-0 top-0 rounded-2xl bg-blue-100/50 transition-all duration-1000"
                        style={{ width: `${percent}%` }}
                      />
                      <div className="relative flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${idx === 0 ? "bg-amber-100 text-amber-700" :
                              idx === 1 ? "bg-slate-200 text-slate-700" :
                                idx === 2 ? "bg-orange-100 text-orange-800" :
                                  "bg-white text-slate-400 shadow-sm"
                            }`}>
                            {idx + 1}
                          </div>
                          <span className={`font-semibold ${isTop3 ? "text-slate-900" : "text-slate-700"}`}>{item.name}</span>
                        </div>
                        <span className="font-bold text-slate-900">{item.total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Top Vistoriadores</h3>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Encerradas / Total</span>
              </div>
              <div className="space-y-3">
                {payload.ranking_vistoriadores.map((item, idx) => {
                  const isTop3 = idx < 3;
                  const maxTotal = payload.ranking_vistoriadores[0]?.total || 1;
                  const percent = Math.max(5, (item.total / maxTotal) * 100);

                  return (
                    <div key={item.person_id} className="group relative overflow-hidden rounded-2xl bg-slate-50 p-1">
                      <div
                        className="absolute bottom-0 left-0 top-0 rounded-2xl bg-emerald-100/40 transition-all duration-1000"
                        style={{ width: `${percent}%` }}
                      />
                      <div className="relative flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${idx === 0 ? "bg-amber-100 text-amber-700" :
                              idx === 1 ? "bg-slate-200 text-slate-700" :
                                idx === 2 ? "bg-orange-100 text-orange-800" :
                                  "bg-white text-slate-400 shadow-sm"
                            }`}>
                            {idx + 1}
                          </div>
                          <span className={`font-semibold ${isTop3 ? "text-slate-900" : "text-slate-700"}`}>{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-500">{item.concluidas} /</span>
                          <span className="font-bold text-slate-900">{item.total}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
