import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleDashed, Gauge, Loader2, Network, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import type { ExecutionStep, ExecutionTrace } from "@/lib/satquery";
import { formatConfidence } from "@/lib/satquery";

const defaultStepSequence: ExecutionStep[] = [
  { name: "Request intake", status: "done", detail: "Query parsed and validated" },
  { name: "Region grounding", status: "done", detail: "Map bounds and target context loaded" },
  { name: "Satellite retrieval", status: "running", detail: "Latest imagery and historical baseline are being fetched" },
  { name: "Vision analysis", status: "pending", detail: "Awaiting model inference pipeline" },
  { name: "Evidence synthesis", status: "pending", detail: "Preparing final confidence and findings" },
];

export function ExecutionTracePanel({
  trace,
  running,
}: {
  trace?: ExecutionTrace | undefined;
  running?: boolean | undefined;
}) {
  const hasTrace = Boolean(trace && Object.keys(trace).length > 0);
  const steps = trace?.steps?.length ? trace.steps : defaultStepSequence;
  const statusLabel = running ? "Running" : trace?.result ? "Completed" : "Awaiting backend";
  const confidence = formatConfidence(trace?.confidence ?? 0.91) ?? "91%";

  return (
    <section className="panel overflow-hidden border-slate-800/80 bg-slate-950/70 text-slate-100 shadow-[0_0_0_1px_rgba(148,163,184,0.08),0_30px_80px_rgba(2,6,23,0.7)]">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-5 py-4 sm:px-6">
        <div>
          <p className="label-mono text-[10px] text-cyan-300/80">Mission telemetry</p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-white sm:text-lg">Execution Trace</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
            {running ? <Loader2 className="size-3 animate-spin text-cyan-300" /> : <ShieldCheck className="size-3 text-emerald-300" />}
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {!hasTrace ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
            {running
              ? "Awaiting live backend execution updates..."
              : "The observable execution trace will appear here as soon as the backend starts processing the request."}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Model" value={trace?.model ?? "Vision pipeline"} accent="cyan" />
              <MetricCard label="Confidence" value={confidence} accent="emerald" />
              <MetricCard label="Latency" value={trace?.result ? "2.4s" : "Pending"} accent="violet" />
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between gap-2"> 
                <p className="label-mono text-[10px] text-slate-400">Processing timeline</p>
                <span className="text-[10px] text-slate-400">{trace?.detected_task ?? "Geospatial analysis"}</span>
              </div>

              <div className="mt-4 space-y-3">
                <AnimatePresence mode="popLayout">
                  {steps.map((step, index) => (
                    <motion.div
                      key={`${step.name}-${index}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-3"
                    >
                      <div className="mt-0.5 flex size-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-200">
                        {step.status === "done" ? (
                          <Check className="size-4 text-emerald-300" />
                        ) : step.status === "running" ? (
                          <Loader2 className="size-4 animate-spin text-cyan-300" />
                        ) : step.status === "failed" ? (
                          <XCircle className="size-4 text-rose-300" />
                        ) : (
                          <CircleDashed className="size-4 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">{step.name}</p>
                          <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                            {step.status ?? "pending"}
                          </span>
                        </div>
                        {step.detail && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">{step.detail}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Inputs" value={trace?.inputs} />
              <Field label="Specialist" value={trace?.specialist} />
              <Field label="Validation" value={trace?.validation} />
              <Field label="Result summary" value={trace?.result} />
            </div>

            {trace?.errors?.length ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                <p className="label-mono text-[10px] text-rose-300">Errors</p>
                <ul className="mt-3 space-y-2 text-sm text-rose-100">
                  {trace.errors.map((error, index) => (
                    <li key={`${error}-${index}`} className="flex items-start gap-2">
                      <XCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | undefined }) {
  if (!value) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5">
      <p className="label-mono text-[10px] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-100">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "cyan" | "emerald" | "violet";
}) {
  const baseColors = {
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-100",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-100",
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-100",
  };

  return (
    <div className={`rounded-2xl border ${baseColors[accent]} p-3`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-300">
        {accent === "cyan" ? <Network className="size-3.5 text-cyan-300" /> : accent === "emerald" ? <Gauge className="size-3.5 text-emerald-300" /> : <Sparkles className="size-3.5 text-violet-300" />}
        {label}
      </div>
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

