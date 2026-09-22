import { Eye, Globe, Layers, ShieldCheck } from "lucide-react";

export function AboutSection() {
  return (
    <section className="panel mt-12 w-full border-slate-800 bg-slate-950/70 p-6 text-slate-100 sm:p-10">
      <div className="w-full">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-200">
          <Globe className="size-3.5 text-cyan-300" />
          <span>VYOMIX · SIH26167</span>
        </div>

        <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          About VYOMIX
        </h2>

        <p className="mt-4 max-w-4xl text-base font-medium leading-relaxed text-slate-300 sm:text-lg">
          VYOMIX is a multimodal satellite-intelligence platform that turns raw remote-sensing scenes into explainable, region-grounded insights for environmental monitoring, disaster response, and strategic analysis.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
              <Layers className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Multimodal Fusion</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
              Fuse optical and SAR evidence into a unified understanding of land-use change and operational risk.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
              <Eye className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Spatial Grounding</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
              Surface grounded detections with precise bounding-box overlays and measurable change signatures.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <ShieldCheck className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Transparent Tracing</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
              Show every observable execution stage so a reviewer can trust the decision path and confidence.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

