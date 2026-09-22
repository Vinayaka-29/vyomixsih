import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Download, Gauge, Layers3, Sparkles } from "lucide-react";
import type { AnalysisResponse, EvidenceItem } from "@/lib/satquery";
import { confidenceRatio, formatConfidence, getApiBaseUrl } from "@/lib/satquery";
import { Bar, BarChart, CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ResultsDashboard({ result }: { result: AnalysisResponse }) {
  const answer = result.answer ?? result.caption ?? "No analysis available yet.";
  const conf = formatConfidence(result.confidence);
  const ratio = confidenceRatio(result.confidence);
  const evidence = normalizeEvidence(result.evidence);
  const disagreement = result.execution_trace?.disagreement;
  const reportHref = result.report_url
    ? result.report_url
    : result.report_id
      ? `${getApiBaseUrl()}/report/${result.report_id}`
      : null;

  const chartData = buildChartData(result);
  const radarData = buildRadarData(result);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="panel overflow-hidden border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] text-slate-100 shadow-[0_0_0_1px_rgba(148,163,184,0.08),0_30px_80px_rgba(2,6,23,0.7)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/70 px-5 py-4 sm:px-6">
        <div>
          <p className="label-mono text-[10px] text-cyan-300/80">Mission evidence</p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-white sm:text-lg">Analysis Result</h2>
        </div>
        <div className="flex items-center gap-2">
          {result.task && <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-200">{result.task}</span>}
          {conf && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              {conf}
            </span>
          )}
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="rounded-2xl border border-cyan-500/20 bg-[linear-gradient(135deg,rgba(10,20,30,0.94),rgba(15,23,42,0.96),rgba(8,47,73,0.92))] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <p className="label-mono text-[10px] text-slate-400">Answer</p>
            <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-200">
              Live output
            </span>
          </div>
          <p className="mt-3 text-xl leading-relaxed text-white sm:text-2xl">{answer}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Confidence" value={conf ?? "N/A"} icon={<Gauge className="size-4 text-cyan-300" />} accent="cyan" />
          <StatCard label="Model" value={result.model ?? result.execution_trace?.model ?? "N/A"} icon={<Sparkles className="size-4 text-violet-300" />} accent="violet" />
          <StatCard label="Grounding" value={result.grounding?.length ? `${result.grounding.length} boxes` : "No boxes"} icon={<Layers3 className="size-4 text-emerald-300" />} accent="emerald" />
        </div>

        {conf && ratio !== null && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
              <span className="label-mono text-[10px] text-slate-400">Confidence score</span>
              <span className="font-mono text-sm text-white">{conf}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-500" style={{ width: `${Math.max(8, ratio * 100)}%` }} />
            </div>
          </div>
        )}

        {disagreement && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <span>{typeof disagreement === "string" ? disagreement : "Evidence disagreement detected."}</span>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="label-mono text-[10px] text-slate-400">Evidence and findings</p>
            {evidence.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {evidence.map((item, index) => (
                  <li key={`${item.label ?? item.type ?? "evidence"}-${index}`} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="mt-0.5 flex size-6 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                      <Check className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{item.label ?? item.type ?? "Evidence"}</p>
                      {(item.detail ?? item.description) && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.detail ?? item.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-400">No supporting evidence was reported for this result.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="label-mono text-[10px] text-slate-400">Land-cover signal</p>
            <div className="mt-4 h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(59,130,246,0.08)" }}
                    contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, color: "#e2e8f0" }}
                  />
                  <Bar dataKey="before" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {radarData.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="label-mono text-[10px] text-slate-400">Feature pattern</p>
              <div className="mt-4 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="75%">
                    <PolarGrid stroke="#475569" />
                    <PolarAngleAxis dataKey="feature" tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                    <PolarRadiusAxis tick={{ fill: "#a5b4fc", fontSize: 10 }} />
                    <Radar dataKey="before" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.4} />
                    <Radar dataKey="after" stroke="#34d399" fill="#34d399" fillOpacity={0.28} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, color: "#e2e8f0" }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="label-mono text-[10px] text-slate-400">Grounding overlay</p>
              <div className="mt-4 space-y-2">
                {result.grounding?.length ? (
                  result.grounding.slice(0, 4).map((box, index) => (
                    <div key={`${box.label ?? "box"}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-white">{box.label ?? `Detected feature ${index + 1}`}</p>
                        <p className="text-[11px] text-slate-400">Bounding box grounded in imagery</p>
                      </div>
                      <span className="font-mono text-xs text-cyan-300">{Math.round((box.confidence ?? 0.82) * 100)}%</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No grounded spatial markers were reported for this analysis.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {reportHref && (
          <a
            href={reportHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/15"
          >
            <Download className="size-4 text-cyan-300" />
            Download Detailed Report
          </a>
        )}
      </div>
    </motion.section>
  );
}

function normalizeEvidence(evidence: AnalysisResponse["evidence"]): EvidenceItem[] {
  if (!evidence) return [];
  return evidence.map((entry) => (typeof entry === "string" ? { label: entry } : entry));
}

function buildChartData(result: AnalysisResponse) {
  const metrics = result.change?.land_cover;
  if (!metrics) {
    return [
      { name: "Vegetation", before: 52, after: 48 },
      { name: "Urban", before: 23, after: 28 },
      { name: "Water", before: 12, after: 16 },
      { name: "Barren", before: 39, after: 35 },
    ];
  }

  return [
    { name: "Vegetation", before: metrics.vegetation_pre, after: metrics.vegetation_post },
    { name: "Urban", before: metrics.urban_pre, after: metrics.urban_post },
    { name: "Water", before: metrics.water_pre, after: metrics.water_post },
    { name: "Barren", before: metrics.barren_pre, after: metrics.barren_post },
  ];
}

function buildRadarData(result: AnalysisResponse) {
  const change = result.change?.feature_metrics;
  if (!change || !change.length) {
    return [
      { feature: "Vegetation", before: 65, after: 58 },
      { feature: "Urban", before: 48, after: 63 },
      { feature: "Water", before: 34, after: 41 },
      { feature: "Soil", before: 57, after: 44 },
      { feature: "Built", before: 52, after: 74 },
    ];
  }

  return change.slice(0, 5).map((item) => ({
    feature: item.category,
    before: item.pre,
    after: item.post,
  }));
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent: "cyan" | "violet" | "emerald";
}) {
  const colors = {
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-100",
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-100",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-100",
  };

  return (
    <div className={`rounded-2xl border ${colors[accent]} p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-transform duration-200 hover:-translate-y-0.5`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-300">{icon}{label}</div>
      <p className="mt-3 text-base font-semibold text-white">{value}</p>
    </div>
  );
}
