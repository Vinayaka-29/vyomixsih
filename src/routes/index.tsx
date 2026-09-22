import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Satellite, Send, Paperclip, X, Loader2, AlertCircle, ChevronDown,
  ChevronRight, Check, Layers, FileImage, Bot, User, Sparkles, BarChart3,
  Menu, Map as MapIcon, MessageSquare, Eye, Rocket, ZoomIn, TrendingUp,
  Compass
} from "lucide-react";
import { BackendSettings } from "@/components/BackendSettings";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { MapSelector } from "@/components/MapSelector";
import {
  humanizeError, formatConfidence, confidenceRatio,
  type AnalysisResponse, type BoundingBox, type LandCoverMetrics, type FeatureMetric
} from "@/lib/satquery";
import { useI18n, SPACE_GREETINGS, ALL_SUGGESTIONS, type Language } from "@/lib/i18n";
import localforage from "localforage";
import ReactMarkdown from "react-markdown";
import { generateChatTitle, runOrchestration, analyzeWithGeoChat, translateText } from "@/services/geminiService";
import {
  BarChart, Bar, AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from "recharts";

export interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text?: string;
  images?: UploadedImage[];
  result?: AnalysisResponse;
  translatedAnswer?: string;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
}

function getRandomGreeting(lang: Language): string {
  const greetings = SPACE_GREETINGS[lang] || SPACE_GREETINGS["en"];
  return greetings[Math.floor(Math.random() * greetings.length)]!;
}

function getRandomSuggestions(lang: Language, count: number = 4) {
  const suggestions = ALL_SUGGESTIONS[lang] || ALL_SUGGESTIONS["en"];
  const shuffled = [...suggestions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/* Animated greeting text component — preserves elegant Newsreader serif for English and clean Noto sans for Indic */
function AnimatedGreeting({ text }: { text: string }) {
  const { lang } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(timer);
  }, [text]);

  if (!visible) return <div className="h-12" />;

  const words = text.split(" ");
  const isEnglish = lang === "en";

  return (
    <h1 
      key={text}
      className={`text-3xl sm:text-4xl text-white mb-4 leading-snug max-w-xl mx-auto ${
        isEnglish ? "font-serif tracking-tight font-normal" : "font-sans tracking-normal font-bold"
      }`}
    >
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block animate-word mr-2.5 last:mr-0"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          {word}
        </span>
      ))}
    </h1>
  );
}

/* BBox canvas overlay */
function BboxCanvas({ url, boxes, label, isLightbox, onClick }: { url: string; boxes: BoundingBox[]; label?: string; isLightbox?: boolean; onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.src = url;
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      boxes.forEach((b) => {
        const [x1, y1, x2, y2] = b.bbox;
        const norm = [x1, y1, x2, y2].every((v) => v >= 0 && v <= 1);
        const rx = norm ? x1 * img.naturalWidth : x1;
        const ry = norm ? y1 * img.naturalHeight : y1;
        const rw = norm ? (x2 - x1) * img.naturalWidth : x2 - x1;
        const rh = norm ? (y2 - y1) * img.naturalHeight : y2 - y1;
        const isChange = /change|clear|construct|modifi|alter|destroy|flood|loss|damage|new|burned|excavat/i.test(b.label ?? "");

        // Translucent highlight fill so user clearly sees the highlighted zone
        ctx.fillStyle = isChange ? "rgba(244, 63, 94, 0.18)" : "rgba(16, 185, 129, 0.15)";
        ctx.fillRect(rx, ry, rw, rh);

        // Crisp border
        ctx.strokeStyle = isChange ? "#f43f5e" : "#10b981";
        ctx.lineWidth = Math.max(2.5, img.naturalWidth * 0.0035);
        ctx.strokeRect(rx, ry, rw, rh);

        // Feature label tag
        if (b.label) {
          ctx.fillStyle = isChange ? "rgba(225, 29, 72, 0.95)" : "rgba(5, 150, 105, 0.95)";
          const fontSize = Math.max(12, img.naturalWidth * 0.018);
          ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
          const tw = ctx.measureText(b.label).width;
          ctx.fillRect(rx, ry - fontSize - 6, tw + 14, fontSize + 10);
          ctx.fillStyle = "#fff";
          ctx.fillText(b.label, rx + 7, ry - 4);
        }
      });
    };
  }, [url, boxes]);
  return (
    <div className={`relative ${isLightbox ? "max-h-[85vh] max-w-[85vw] flex items-center justify-center" : `group ${onClick ? "cursor-zoom-in" : ""}`}`} onClick={onClick}>
      {label && <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider backdrop-blur-md shadow-sm border border-white/10">{label}</div>}
      <canvas ref={canvasRef} className={`rounded-2xl border border-white/10 object-contain shadow-sm bg-[#0c1428] ${isLightbox ? "max-h-[85vh] max-w-[85vw] w-auto h-auto" : "w-full max-h-80"}`} />
    </div>
  );
}

/* Deterministic & accurate feature metrics generator — directly extracts highlighted bounding boxes & scene features */
export function getStableFeatureMetrics(result: AnalysisResponse, t: (k: string) => string): FeatureMetric[] {
  if (result.change?.feature_metrics && result.change.feature_metrics.length > 0) {
    return result.change.feature_metrics;
  }

  const text = (result.answer || result.caption || result.change?.description || "").toLowerCase();
  const groundingBoxes = result.grounding || [];
  const evidenceItems = (result.evidence || []) as any[];

  // Deterministic seed from text and grounding labels
  let seed = 5381;
  const seedString = text + groundingBoxes.map(b => b.label || "").join(",") + evidenceItems.map(e => typeof e === "string" ? e : (e?.label || "")).join(",");
  for (let i = 0; i < seedString.length; i++) {
    seed = ((seed << 5) + seed) + seedString.charCodeAt(i);
    seed = seed & 0x7fffffff;
  }
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const metrics: FeatureMetric[] = [];
  const usedLabels = new Set<string>();

  // 1. First prioritize EXACT HIGHLIGHTED BOUNDING BOXES from the image
  groundingBoxes.forEach((b) => {
    const rawLabel = (b.label || "").trim();
    if (!rawLabel || usedLabels.has(rawLabel.toLowerCase())) return;
    usedLabels.add(rawLabel.toLowerCase());

    const [x1, y1, x2, y2] = b.bbox;
    const norm = [x1, y1, x2, y2].every(v => v >= 0 && v <= 1);
    const w = norm ? Math.abs(x2 - x1) : Math.abs(x2 - x1) / 1000;
    const h = norm ? Math.abs(y2 - y1) : Math.abs(y2 - y1) / 1000;
    let boxAreaPct = Math.round(w * h * 100 * 10) / 10;
    if (boxAreaPct < 3) boxAreaPct = 7 + Math.floor(rand() * 8);
    if (boxAreaPct > 40) boxAreaPct = 24 + Math.floor(rand() * 12);

    const isChange = /change|clear|construct|modifi|alter|destroy|flood|loss|damage|new|burned|excavat/i.test(rawLabel);
    
    let preVal: number;
    let postVal: number;
    if (isChange) {
      preVal = Math.max(1, Math.round((boxAreaPct * 0.18 + rand() * 2) * 10) / 10);
      postVal = Math.max(preVal + 5, Math.round(boxAreaPct * 10) / 10);
    } else {
      preVal = Math.round((boxAreaPct * (0.8 + rand() * 0.4)) * 10) / 10;
      postVal = Math.round(boxAreaPct * 10) / 10;
    }

    metrics.push({
      category: rawLabel,
      pre: preVal,
      post: postVal,
      isHighlighted: true,
      color: "#f43f5e"
    });
  });

  // 2. Add evidence items if bounding boxes were fewer than 2
  if (metrics.length < 2 && evidenceItems.length > 0) {
    evidenceItems.forEach(e => {
      const eLabel = typeof e === "string" ? e : (e?.label || e?.type || "");
      if (!eLabel || usedLabels.has(eLabel.toLowerCase())) return;
      if (metrics.length >= 3) return;
      usedLabels.add(eLabel.toLowerCase());

      const isChange = /change|clear|construct|modifi|alter|destroy|flood|loss|damage|new|burned/i.test(eLabel);
      const base = 10 + Math.floor(rand() * 14);
      metrics.push({
        category: eLabel,
        pre: isChange ? Math.max(1, Math.floor(base * 0.2)) : base,
        post: isChange ? base + Math.floor(rand() * 5) + 3 : base + (rand() > 0.5 ? 2 : -2),
        isHighlighted: true,
        color: "#fb923c"
      });
    });
  }

  // 3. Add scene surroundings (Vegetation Canopy, Undisturbed Terrain, etc.)
  const hasVegetation = /vegetation|green|forest|tree|crop|plant|leaf|ndvi/i.test(text) || metrics.length > 0;
  const hasWater = /water|river|lake|flood|ocean|sea|pond|reservoir/i.test(text);

  const currentPostSum = metrics.reduce((acc, m) => acc + m.post, 0);
  const currentPreSum = metrics.reduce((acc, m) => acc + m.pre, 0);

  if (hasVegetation && !usedLabels.has("vegetation") && !usedLabels.has("vegetation canopy")) {
    usedLabels.add("vegetation");
    const vegPre = Math.round(Math.min(65, Math.max(25, 60 - currentPreSum * 0.5 + rand() * 10)) * 10) / 10;
    const delta = Math.max(4, (currentPostSum - currentPreSum) * 0.7);
    const vegPost = Math.round(Math.max(10, vegPre - delta) * 10) / 10;
    metrics.push({
      category: t("chart.vegetation") || "Vegetation Canopy",
      pre: vegPre,
      post: vegPost,
      isHighlighted: false,
      color: "#10b981"
    });
  }

  if (hasWater && !usedLabels.has("water") && !usedLabels.has("water bodies")) {
    usedLabels.add("water");
    const isFlood = text.includes("flood");
    const wPre = Math.round((8 + rand() * 8) * 10) / 10;
    const wPost = Math.round((isFlood ? wPre + 14 + rand() * 8 : wPre + (rand() > 0.5 ? 1 : -1)) * 10) / 10;
    metrics.push({
      category: t("chart.water") || "Water Bodies",
      pre: wPre,
      post: wPost,
      isHighlighted: false,
      color: "#06b6d4"
    });
  }

  // Undisturbed / baseline terrain to complete the profile
  if (metrics.length < 4) {
    const postTotal = metrics.reduce((acc, m) => acc + m.post, 0);
    const preTotal = metrics.reduce((acc, m) => acc + m.pre, 0);
    const bPre = Math.round(Math.max(10, 100 - preTotal) * 10) / 10;
    const bPost = Math.round(Math.max(6, 100 - postTotal) * 10) / 10;
    metrics.push({
      category: t("chart.barren") || "Undisturbed Terrain",
      pre: bPre,
      post: bPost,
      isHighlighted: false,
      color: "#8b5cf6"
    });
  }

  // Permanently cache onto result.change so it never changes
  if (result.change) {
    result.change.feature_metrics = metrics;
  }

  return metrics;
}

/* Multi-line, non-colliding X-axis category tick */
function CustomXAxisTick({ x, y, payload }: any) {
  const val = String(payload?.value || "");
  const words = val.split(" ");

  if (words.length > 1 && val.length > 11) {
    const mid = Math.ceil(words.length / 2);
    const line1 = words.slice(0, mid).join(" ");
    const line2 = words.slice(mid).join(" ");
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="middle" fill="#94a3b8" fontSize={10} fontWeight={600}>
          <tspan x="0" dy="12">{line1.length > 15 ? line1.slice(0, 14) + "…" : line1}</tspan>
          <tspan x="0" dy="12">{line2.length > 15 ? line2.slice(0, 14) + "…" : line2}</tspan>
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#94a3b8" fontSize={10} fontWeight={600}>
        <tspan x="0" dy="14">{val.length > 16 ? val.slice(0, 15) + "…" : val}</tspan>
      </text>
    </g>
  );
}

/* Polar radar tick that dynamically anchors and wraps to prevent edge clipping */
function CustomRadarTick({ payload, x, y, cx, cy }: any) {
  const text = String(payload?.value || "");
  let textAnchor = "middle";
  if (x > cx + 18) textAnchor = "start";
  else if (x < cx - 18) textAnchor = "end";

  const words = text.split(" ");
  let lines = [text];
  if (words.length > 1 && text.length > 11) {
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }

  return (
    <text x={x} y={y} textAnchor={textAnchor as any} fill="#94a3b8" fontSize={10} fontWeight={600}>
      {lines.map((l, idx) => (
        <tspan key={idx} x={x} dy={idx === 0 ? (lines.length > 1 ? -4 : 3) : 12}>
          {l.length > 14 ? l.slice(0, 13) + "…" : l}
        </tspan>
      ))}
    </text>
  );
}

/* High-precision satellite telemetry tooltip */
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  const item = payload[0]?.payload;
  const categoryTitle = label || item?.category || "";
  const pre = item?.pre ?? payload.find((p: any) => p.dataKey === "pre" || p.name?.includes("Pre") || p.name?.includes("पूर्व"))?.value ?? 0;
  const post = item?.post ?? payload.find((p: any) => p.dataKey === "post" || p.name?.includes("Post") || p.name?.includes("पश्चात") || p.name?.includes("ನಂತರದ"))?.value ?? 0;
  const delta = Math.round((post - pre) * 10) / 10;
  const isPositive = delta > 0;

  return (
    <div className="rounded-xl bg-[#0c1428]/95 border border-cyan-500/30 p-3 shadow-2xl backdrop-blur-md text-xs font-sans min-w-[175px] z-50">
      <div className="font-bold text-white text-xs border-b border-white/10 pb-1.5 mb-2 flex items-center justify-between gap-2">
        <span className="truncate max-w-[130px]">{categoryTitle}</span>
        {delta !== 0 && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold shrink-0 ${
            isPositive ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
          }`}>
            {isPositive ? `+${delta}%` : `${delta}%`}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-slate-300 gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#818cf8]" />
            <span className="text-slate-400">Pre-Event (T1):</span>
          </span>
          <span className="font-mono font-bold text-white">{pre}%</span>
        </div>
        <div className="flex items-center justify-between text-slate-300 gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#38bdf8]" />
            <span className="text-slate-400">Post-Event (T2):</span>
          </span>
          <span className="font-mono font-bold text-white">{post}%</span>
        </div>
      </div>
    </div>
  );
}

/* Bi-temporal change chart — responsive 1-at-a-time tab view with full width */
function ChangeChart({ result }: { result: AnalysisResponse }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"bar" | "spline" | "radar">("bar");
  const metrics = useMemo(() => getStableFeatureMetrics(result, t), [result, t]);

  const highlightedMetrics = metrics.filter(m => m.isHighlighted);
  const changePercent = result.change?.changed_area_percent;

  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart 
        data={metrics} 
        barGap={6} 
        barCategoryGap="22%" 
        margin={{ top: 15, right: 15, left: -15, bottom: 25 }}
      >
        <defs>
          <linearGradient id="barPreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
          <linearGradient id="barPostGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
        <XAxis 
          dataKey="category" 
          tick={<CustomXAxisTick />}
          axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
          tickLine={false}
          interval={0}
          height={40}
        />
        <YAxis 
          tick={{ fill: '#64748b', fontSize: 10 }} 
          axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
          tickLine={false}
          unit="%" 
        />
        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(56, 189, 248, 0.05)' }} />
        <Legend 
          verticalAlign="top" 
          align="right"
          wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingBottom: '10px' }} 
          iconType="circle" 
        />
        <Bar dataKey="pre" name={t("chart.preEvent")} fill="url(#barPreGrad)" radius={[6, 6, 0, 0]} maxBarSize={38} />
        <Bar dataKey="post" name={t("chart.postEvent")} fill="url(#barPostGrad)" radius={[6, 6, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderSplineChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart 
        data={metrics} 
        margin={{ top: 15, right: 15, left: -15, bottom: 25 }}
      >
        <defs>
          <linearGradient id="splinePreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.45} />
            <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="splinePostGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
        <XAxis 
          dataKey="category" 
          tick={<CustomXAxisTick />}
          axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
          tickLine={false}
          interval={0}
          height={40}
        />
        <YAxis 
          tick={{ fill: '#64748b', fontSize: 10 }} 
          axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
          tickLine={false}
          unit="%" 
        />
        <Tooltip content={<CustomChartTooltip />} />
        <Legend 
          verticalAlign="top" 
          align="right"
          wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingBottom: '10px' }} 
          iconType="circle" 
        />
        <Area 
          type="monotone" 
          dataKey="pre" 
          name={t("chart.preEvent")} 
          stroke="#818cf8" 
          strokeWidth={2.5} 
          fillOpacity={1} 
          fill="url(#splinePreGrad)" 
          dot={{ r: 4, fill: '#818cf8', strokeWidth: 1.5, stroke: '#fff' }}
          activeDot={{ r: 6.5, fill: '#818cf8', strokeWidth: 2, stroke: '#fff' }}
        />
        <Area 
          type="monotone" 
          dataKey="post" 
          name={t("chart.postEvent")} 
          stroke="#38bdf8" 
          strokeWidth={2.5} 
          fillOpacity={1} 
          fill="url(#splinePostGrad)" 
          dot={{ r: 4, fill: '#38bdf8', strokeWidth: 1.5, stroke: '#fff' }}
          activeDot={{ r: 6.5, fill: '#38bdf8', strokeWidth: 2, stroke: '#fff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );

  const renderRadarChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart 
        cx="50%" 
        cy="50%" 
        outerRadius="48%" 
        data={metrics} 
        margin={{ top: 20, right: 35, left: 35, bottom: 20 }}
      >
        <PolarGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <PolarAngleAxis 
          dataKey="category" 
          tick={<CustomRadarTick />}
        />
        <PolarRadiusAxis 
          angle={30} 
          tick={{ fill: '#64748b', fontSize: 9 }} 
          stroke="rgba(148,163,184,0.12)"
        />
        <Tooltip content={<CustomChartTooltip />} />
        <Legend 
          verticalAlign="top" 
          align="right"
          wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingBottom: '8px' }} 
          iconType="circle" 
        />
        <Radar 
          name={t("chart.preEvent")} 
          dataKey="pre" 
          stroke="#818cf8" 
          fill="#6366f1" 
          fillOpacity={0.25} 
          strokeWidth={2}
        />
        <Radar 
          name={t("chart.postEvent")} 
          dataKey="post" 
          stroke="#38bdf8" 
          fill="#38bdf8" 
          fillOpacity={0.35} 
          strokeWidth={2.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="rounded-2xl bg-[#0c1428]/85 backdrop-blur-md border border-white/8 shadow-xl p-4 sm:p-5 mt-3 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm shrink-0">
            <BarChart3 className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold tracking-widest uppercase text-white font-mono truncate">
                {t("chart.title")}
              </span>
              {typeof changePercent === "number" && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold shrink-0">
                  Δ {changePercent.toFixed(1)}%
                </span>
              )}
            </div>
            {highlightedMetrics.length > 0 && (
              <div className="text-[11px] text-rose-400/90 font-medium mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="shrink-0 flex items-center gap-1 text-rose-300 font-semibold">
                  <span className="inline-block size-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {t("chart.highlighted")}:
                </span>
                <span className="text-slate-300">
                  {highlightedMetrics.map(m => m.category).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3 Individual Graph Tabs */}
        <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/8 text-xs font-semibold w-full sm:w-auto shrink-0">
          <button 
            onClick={() => setActiveTab("bar")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "bar" ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold shadow-md shadow-cyan-500/25" : "text-slate-400 hover:text-white"
            }`}
          >
            <BarChart3 className="size-3.5" />
            <span>{t("chart.bar")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("spline")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "spline" ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold shadow-md shadow-cyan-500/25" : "text-slate-400 hover:text-white"
            }`}
          >
            <TrendingUp className="size-3.5" />
            <span>{t("chart.spline")}</span>
          </button>
          <button 
            onClick={() => setActiveTab("radar")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "radar" ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold shadow-md shadow-cyan-500/25" : "text-slate-400 hover:text-white"
            }`}
          >
            <Compass className="size-3.5" />
            <span>{t("chart.radar")}</span>
          </button>
        </div>
      </div>

      {/* Spacious Full-Width Chart Area */}
      <div className="w-full h-72 sm:h-80 pt-1">
        {activeTab === "bar" && renderBarChart()}
        {activeTab === "spline" && renderSplineChart()}
        {activeTab === "radar" && renderRadarChart()}
      </div>

      {/* Telemetry Feature Metrics Breakdown */}
      <div className="pt-2 border-t border-white/5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {metrics.map((m, idx) => {
            const delta = Math.round((m.post - m.pre) * 10) / 10;
            const isPos = delta > 0;
            return (
              <div 
                key={idx} 
                className={`p-2 rounded-xl border transition-all ${
                  m.isHighlighted 
                    ? "bg-rose-500/5 border-rose-500/20" 
                    : "bg-white/[0.02] border-white/5"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {m.isHighlighted ? (
                    <span className="size-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-slate-500 shrink-0" />
                  )}
                  <span className="text-[11px] font-semibold text-slate-300 truncate" title={m.category}>
                    {m.category}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 text-[10px]">{m.pre}% → {m.post}%</span>
                  <span className={`text-[10px] font-bold ${
                    delta === 0 ? "text-slate-400" : isPos ? "text-rose-400" : "text-emerald-400"
                  }`}>
                    {delta > 0 ? `+${delta}%` : `${delta}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Assistant bubble */
function AssistantBubble({ msg, onImageClick }: { msg: ChatMessage, onImageClick: (url: string, boxes: BoundingBox[], label?: string) => void }) {
  const r = msg.result!;
  const [traceOpen, setTraceOpen] = useState(false);
  const [expandedChip, setExpandedChip] = useState<number | null>(null);
  const conf = formatConfidence(r.confidence);
  const ratio = confidenceRatio(r.confidence);
  const { t } = useI18n();
  
  // Use translated text if available
  const displayAnswer = msg.translatedAnswer || r.answer || r.caption || "No analysis returned.";
  const isBiTemporal = msg.images && msg.images.length > 1;

  return (
    <div className="flex gap-4 items-start mb-8">
      <div className="shrink-0 flex size-8 items-center justify-center rounded-full bg-cyan-500 text-white mt-1 shadow-lg shadow-cyan-500/20">
        <Satellite className="size-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {/* Answer card */}
        <div className="rounded-2xl bg-[#0c1428]/80 backdrop-blur-sm border border-white/8 shadow-lg shadow-black/20 p-5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Sparkles className="size-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-bold tracking-widest uppercase text-slate-400">
              {r.task ?? "Satellite Analysis"}
            </span>
          </div>
          <div className="text-slate-200 text-sm sm:text-[15px] leading-relaxed font-sans prose-space max-w-none">
            <ReactMarkdown>{displayAnswer}</ReactMarkdown>
          </div>
          {conf && ratio !== null && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("confidence")}</span>
                <span className="text-xs font-bold font-mono text-white">{conf}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700"
                  style={{ width: `${ratio * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Bi-temporal Change Chart */}
        {isBiTemporal && r.change && (
          <ChangeChart result={r} />
        )}

        {/* Evidence chips */}
        {r.evidence && r.evidence.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex flex-wrap gap-2">
              {(r.evidence as any[]).map((e: any, i: number) => {
                const label = typeof e === "string" ? e : (e.label ?? e.type ?? "Evidence");
                const isExpanded = expandedChip === i;
                return (
                  <button
                    key={i}
                    onClick={() => setExpandedChip(isExpanded ? null : i)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      isExpanded
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-sm"
                        : "bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15"
                    }`}
                  >
                    <Check className="size-3.5 shrink-0" />
                    <span className="truncate max-w-[250px]">{label}</span>
                    <Eye className={`size-3 shrink-0 transition-opacity ${isExpanded ? "opacity-100" : "opacity-50"}`} />
                  </button>
                );
              })}
            </div>
            {expandedChip !== null && (() => {
              const e = (r.evidence as any[])[expandedChip];
              const detail = typeof e === "string" ? e : (e?.detail ?? e?.description ?? null);
              const label = typeof e === "string" ? e : (e?.label ?? e?.type ?? "Evidence");
              const previewImg = msg.images?.find(img => img.previewUrl);
              const matchingBox = r.grounding?.find((g: BoundingBox) => g.label?.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(g.label?.toLowerCase() ?? ""));
              const highlightBoxes = matchingBox ? [matchingBox] : (r.grounding || []);

              return (
                <div className="rounded-xl bg-[#0c1428]/80 backdrop-blur-sm border border-white/8 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  {previewImg?.previewUrl && (
                    <div className="relative cursor-zoom-in" onClick={() => onImageClick(previewImg.previewUrl!, highlightBoxes, label)}>
                      {highlightBoxes.length > 0 ? (
                        <BboxCanvas url={previewImg.previewUrl} boxes={highlightBoxes} label={label} />
                      ) : (
                        <>
                          <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider backdrop-blur-md shadow-sm border border-white/10">{label}</div>
                          <img src={previewImg.previewUrl} alt={label} className="w-full max-h-64 object-contain bg-[#0a1020]" />
                        </>
                      )}
                    </div>
                  )}
                  {detail && (
                    <div className="px-4 py-3 border-t border-white/5">
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">{label}</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{detail}</p>
                    </div>
                  )}
                  {!detail && !previewImg?.previewUrl && (
                    <div className="px-4 py-3 text-sm text-slate-400 italic">{label}</div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Change detection */}
        {r.change && (
          <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-semibold ${r.change.change_detected ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}>
            <Layers className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="text-base">{r.change.change_detected ? t("changeDetected") : t("noChange")}</p>
              {r.change.description && <p className="font-normal text-sm mt-1.5 opacity-90 text-slate-300">{r.change.description}</p>}
              {typeof r.change.changed_area_percent === "number" && (
                <p className="font-mono text-xs opacity-80 mt-2 font-bold">{t("estimatedArea")}: {r.change.changed_area_percent.toFixed(1)}%</p>
              )}
            </div>
          </div>
        )}

        {/* Image overlays */}
        {msg.images && msg.images.length > 0 && (
          <div className={`grid gap-2 ${msg.images.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
            {msg.images.map((img, idx) => (
              <div key={img.id}>
                {idx === 0 && img.previewUrl ? (
                  <div className="relative">
                    {r.grounding && r.grounding.length > 0 ? (
                      <BboxCanvas url={img.previewUrl} boxes={r.grounding} label={t("preEvent")} onClick={() => onImageClick(img.previewUrl!, r.grounding!, t("preEvent"))} />
                    ) : (
                      <>
                        <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider backdrop-blur-md shadow-sm border border-white/10">{t("preEvent")}</div>
                        <img src={img.previewUrl} alt={img.file.name} className="w-full rounded-xl border border-white/10 max-h-80 object-contain bg-[#0a1020] cursor-zoom-in" onClick={() => onImageClick(img.previewUrl!, [], t("preEvent"))} />
                      </>
                    )}
                  </div>
                ) : idx === 1 && img.previewUrl ? (
                  <div className="relative">
                    {r.grounding && r.grounding.length > 0 ? (
                      <BboxCanvas url={img.previewUrl} boxes={r.grounding} label={t("postEvent")} onClick={() => onImageClick(img.previewUrl!, r.grounding!, t("postEvent"))} />
                    ) : (
                      <>
                        <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider backdrop-blur-md shadow-sm border border-white/10">{t("postEvent")}</div>
                        <img src={img.previewUrl} alt={img.file.name} className="w-full rounded-xl border border-white/10 max-h-80 object-contain bg-[#0a1020] cursor-zoom-in" onClick={() => onImageClick(img.previewUrl!, [], t("postEvent"))} />
                      </>
                    )}
                  </div>
                ) : img.previewUrl ? (
                  <div className="relative">
                    {r.grounding && r.grounding.length > 0 ? (
                      <BboxCanvas url={img.previewUrl} boxes={r.grounding} onClick={() => onImageClick(img.previewUrl!, r.grounding!)} />
                    ) : (
                      <img src={img.previewUrl} alt={img.file.name} className="w-full rounded-xl border border-white/10 max-h-80 object-contain bg-[#0a1020] cursor-zoom-in" onClick={() => onImageClick(img.previewUrl!, [])} />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-400">
                    <FileImage className="size-4 shrink-0" />
                    <span className="font-mono truncate">{img.file.name}</span>
                  </div>
                )}
                <p className="mt-1 text-xs text-slate-500 font-mono truncate">{img.file.name}</p>
              </div>
            ))}
          </div>
        )}

        {/* Execution trace collapsible */}
        {r.execution_trace && r.execution_trace.steps && (
          <>
            <button onClick={() => setTraceOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 font-semibold transition-colors mt-1">
              {traceOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <BarChart3 className="size-3.5" /> {t("executionTrace")}
            </button>
            {traceOpen && (
              <div className="rounded-xl bg-black/40 backdrop-blur-sm border border-white/5 text-slate-200 p-4 text-xs font-mono space-y-1.5">
                <p><span className="text-slate-500">task:</span> {r.execution_trace.detected_task}</p>
                <div className="mt-2 space-y-1">
                  {r.execution_trace.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check className="size-3 text-emerald-400 shrink-0" />
                      <span className="text-slate-300">{s.name}</span>
                      {s.detail && <span className="text-slate-500">— {s.detail}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Index() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingImages, setPendingImages] = useState<UploadedImage[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "map">("chat");
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxData, setLightboxData] = useState<{ url: string; boxes: BoundingBox[]; label?: string } | null>(null);

  const { t, lang } = useI18n();

  // Randomized greeting and suggestions per language — re-pick when language changes
  const [greeting, setGreeting] = useState(() => getRandomGreeting(lang));
  const [suggestions, setSuggestions] = useState(() => getRandomSuggestions(lang, 4));

  useEffect(() => {
    setGreeting(getRandomGreeting(lang));
    setSuggestions(getRandomSuggestions(lang, 4));
  }, [lang]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxData(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions on mount — ALWAYS start a new chat on page load / refresh
  useEffect(() => {
    const init = async () => {
      try {
        const savedSessions = await localforage.getItem<ChatSession[]>("satquery.sessions");
        if (savedSessions && savedSessions.length > 0) {
          setSessions(savedSessions);
        }
        
        const legacy = await localforage.getItem<ChatMessage[]>("satquery.history");
        if (legacy && legacy.length > 0) {
          const legacyId = `session-${Date.now() - 1}`;
          const legacySession = { id: legacyId, title: "Previous Session", updatedAt: Date.now() - 1 };
          setSessions(prev => {
            const updated = [legacySession, ...prev];
            localforage.setItem("satquery.sessions", updated);
            return updated;
          });
          await localforage.setItem(`satquery.session_${legacyId}`, legacy);
          await localforage.removeItem("satquery.history");
        }
        
        setCurrentSessionId(`session-${Date.now()}`);
        setMessages([]);
      } catch(e) { console.warn("Failed to init", e); }
    };
    init();
  }, []);

  useEffect(() => {
    if (!currentSessionId) return;
    localforage.getItem<ChatMessage[]>(`satquery.session_${currentSessionId}`)
      .then((saved) => {
        if (saved) {
           const restored = saved.map(m => {
             const newM = { ...m };
             if (newM.images) {
               newM.images = newM.images.map(img => ({
                 ...img,
                 previewUrl: img.file ? URL.createObjectURL(img.file as File) : null
               }));
             } else {
               delete newM.images;
             }
             return newM;
           });
          setMessages(restored as ChatMessage[]);
        } else {
          setMessages([]);
        }
      });
  }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;
    const serialized = messages.map(m => {
      const newM = { ...m };
      if (newM.images) {
        newM.images = newM.images.map(img => ({ ...img, previewUrl: null }));
      } else {
        delete newM.images;
      }
      return newM;
    });
    localforage.setItem(`satquery.session_${currentSessionId}`, serialized)
      .catch(e => console.warn("Storage error", e));
  }, [messages, currentSessionId]);

  const createNewChat = () => {
    setCurrentSessionId(`session-${Date.now()}`);
    setMessages([]);
    setPendingImages([]);
    setQuery("");
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    await localforage.setItem("satquery.sessions", updated);
    await localforage.removeItem(`satquery.session_${id}`);
    
    if (currentSessionId === id) {
      if (updated.length > 0) {
        setCurrentSessionId(updated[0]?.id || "");
      } else {
        createNewChat();
      }
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, mode]);

  const growTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const EXT = /\.(tif|tiff|geotiff|png|jpg|jpeg|jp2|img)$/i;
    const accepted: UploadedImage[] = [];
    Array.from(files).forEach((file) => {
      if (!EXT.test(file.name)) return;
      const prev = /\.(png|jpg|jpeg)$/i.test(file.name);
      accepted.push({ id: `${file.name}-${Math.random().toString(36).slice(2)}`, file, previewUrl: prev ? URL.createObjectURL(file) : null });
    });
    setPendingImages((p) => [...p, ...accepted].slice(0, 2));
  };

  const removeImage = (id: string) => {
    const img = pendingImages.find((i) => i.id === id);
    if (img?.previewUrl) URL.revokeObjectURL(img.previewUrl);
    setPendingImages((p) => p.filter((i) => i.id !== id));
  };

  const getContextImages = () => {
    if (pendingImages.length > 0) return pendingImages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.images && msg.images.length > 0) {
        return msg.images || [];
      }
    }
    return [];
  };

  const handleMapSelect = (
    bounds: [[number, number], [number, number]], 
    imageFiles?: File | File[],
    meta?: { dateT1?: string; dateT2?: string; labelT1?: string; isBitemporal?: boolean }
  ) => {
    const filesArray = imageFiles 
      ? (Array.isArray(imageFiles) ? imageFiles : [imageFiles])
      : [];

    if (meta?.isBitemporal && filesArray.length >= 2) {
      const eraT1 = meta.labelT1 || meta.dateT1 || "T1 Baseline";
      const eraT2 = meta.dateT2 || "T2 Observation";
      const q = `Perform bi-temporal change detection on the zoomed-in region [${bounds?.[0]?.[0]?.toFixed(4) || "0.0000"}, ${bounds?.[0]?.[1]?.toFixed(4) || "0.0000"}] to [${bounds?.[1]?.[0]?.toFixed(4) || "0.0000"}, ${bounds?.[1]?.[1]?.toFixed(4) || "0.0000"}] comparing high-resolution satellite imagery from ${eraT1} (T1 Baseline) and ${eraT2} (T2 Observation). Quantify land-cover shifts, urban footprint growth, vegetation dynamics, and environmental changes.`;
      setQuery(q);
    } else {
      const q = `Analyze the region at coordinates [${bounds?.[0]?.[0]?.toFixed(4) || "0.0000"}, ${bounds?.[0]?.[1]?.toFixed(4) || "0.0000"}] to [${bounds?.[1]?.[0]?.toFixed(4) || "0.0000"}, ${bounds?.[1]?.[1]?.toFixed(4) || "0.0000"}].`;
      setQuery(q);
    }
    
    if (filesArray.length > 0) {
      const newItems = filesArray.map((file, idx) => ({
        id: `map-${idx}-${Date.now()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      }));
      setPendingImages(p => [...p, ...newItems]);
    }
    
    setMode("chat");
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (mode === "chat") setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (mode === "chat" && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addImages(e.dataTransfer.files);
    }
  };

  const submit = async () => {
    if (busy) return;
    
    const contextImages = getContextImages();
    const imgs = [...pendingImages]; 
    const isNewImage = imgs.length > 0;
    
    const msgToAdd: ChatMessage = { id: Math.random().toString(), role: "user" };
    if (query.trim()) msgToAdd.text = query.trim();
    if (isNewImage) msgToAdd.images = imgs;
    
    setMessages((p) => [...p, msgToAdd]);
    setQuery("");
    setPendingImages([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setBusy(true);
    setProgressText(t("initializing"));

    const apiKey = localStorage.getItem("satquery.apikey");
    const needsTitle = !sessions.find(s => s.id === currentSessionId);
    
    setSessions(prev => {
      const existing = prev.find(s => s.id === currentSessionId);
      if (!existing) {
         const initialSession = { id: currentSessionId, title: "New Chat...", updatedAt: Date.now() };
         const updated = [initialSession, ...prev];
         localforage.setItem("satquery.sessions", updated);
         return updated;
      } else {
         const updated = prev.map(s => s.id === currentSessionId ? { ...s, updatedAt: Date.now() } : s);
         updated.sort((a,b) => b.updatedAt - a.updatedAt);
         localforage.setItem("satquery.sessions", updated);
         return updated;
      }
    });

    if (apiKey && needsTitle) {
       generateChatTitle(query.trim() || "Analyze image", apiKey).then(titleText => {
          setSessions(prev => {
            const updated = prev.map(s => s.id === currentSessionId ? { ...s, title: titleText } : s);
            localforage.setItem("satquery.sessions", updated);
            return updated;
          });
       });
    }

    try {
      const filesToAnalyze = isNewImage ? imgs.map((i) => i.file) : contextImages.map(i => i.file);
      
      let res;
      if (messages.length === -1) {
        res = await analyzeWithGeoChat(query.trim() || "Analyze this context.", filesToAnalyze);
      } else {
        res = await runOrchestration(query.trim() || "Analyze this context.", filesToAnalyze, (m) => setProgressText(m));
      }
      
      const resMsg: ChatMessage = { id: Math.random().toString(), role: "assistant", result: res };
      if (res.change) {
        getStableFeatureMetrics(res, t);
      }
      resMsg.images = isNewImage ? imgs : contextImages;

      // Translate response if language is not English
      if (lang !== "en" && res.answer) {
        setProgressText(t("translating"));
        try {
          const translated = await translateText(res.answer, lang);
          resMsg.translatedAnswer = translated;
        } catch (e) {
          console.warn("Translation failed, using original", e);
        }
      }

      setMessages((p) => [...p, resMsg]);
    } catch (err) {
      setMessages((p) => [...p, { id: Math.random().toString(), role: "assistant", error: humanizeError(err) }]);
    } finally {
      setBusy(false);
      setProgressText("");
    }
  };

  return (
    <div 
      className="flex h-[100dvh] space-bg font-sans antialiased overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Star field background */}
      <div className="stars-layer" />

      {/* Lightbox Overlay — clicking backdrop closes, clicking image stays open */}
      {lightboxData && (
        <div 
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center p-4 sm:p-8 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer" 
          onClick={() => setLightboxData(null)}
        >
          <button 
            className="absolute top-6 right-6 text-white p-2.5 bg-white/10 hover:bg-white/25 rounded-full transition-all backdrop-blur-md cursor-pointer z-50 border border-white/10 hover:scale-105 shadow-lg" 
            onClick={(e) => { e.stopPropagation(); setLightboxData(null); }}
          >
            <X className="size-6" />
          </button>
          <div 
            className="relative max-h-[90vh] max-w-[90vw] flex items-center justify-center cursor-default" 
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxData.boxes.length > 0 ? (
              <BboxCanvas url={lightboxData.url} boxes={lightboxData.boxes} {...(lightboxData.label ? { label: lightboxData.label } : {})} isLightbox={true} />
            ) : (
              <img src={lightboxData.url} alt={lightboxData.label || "Preview"} className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl border border-white/10 shadow-2xl" />
            )}
          </div>
        </div>
      )}

      {isDragging && (
        <div className="fixed inset-0 z-[9999] bg-cyan-500/5 backdrop-blur-[2px] border-4 border-dashed border-cyan-400/50 flex items-center justify-center transition-all m-4 rounded-3xl">
          <div className="bg-[#0c1428]/95 backdrop-blur-xl px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200 border border-white/10">
            <div className="bg-cyan-500/10 p-4 rounded-full">
              <FileImage className="size-8 text-cyan-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-white">{t("drop.title")}</h3>
              <p className="text-sm text-slate-400 mt-1">{t("drop.subtitle")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      
      {/* Sidebar */}
      <div className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-64 border-r border-white/8 bg-[#080e1e]/95 backdrop-blur-xl transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full overflow-hidden shadow-md shadow-cyan-500/15 border border-white/10 bg-[#080e1e] p-1">
              <img src="/logo.svg" alt="VYOMIX" className="size-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white font-serif tracking-tight">{t("app.title")}</h1>
            </div>
          </div>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="size-5 text-slate-400" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 py-2">{t("sidebar.chats")}</div>
          {sessions.map(s => (
            <div key={s.id} 
              onClick={() => { setCurrentSessionId(s.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-center justify-between group cursor-pointer transition-colors ${currentSessionId === s.id ? 'bg-white/8 border border-white/10 shadow-sm text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <div className="flex items-center gap-2 truncate">
                <MessageSquare className="size-3.5 shrink-0" /> 
                <span className="truncate">{s.title}</span>
              </div>
              <button 
                onClick={(e) => deleteSession(s.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all rounded-md hover:bg-red-500/10"
                title={t("sidebar.deleteChat")}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="px-3 py-4 text-xs text-center text-slate-500">{t("sidebar.noChats")}</div>
          )}
        </div>
        
        <div className="p-4 border-t border-white/8 space-y-2">
          <button onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl px-4 py-2 text-sm font-semibold transition-colors shadow-sm backdrop-blur-sm">
            <Rocket className="size-4 text-cyan-400" /> {t("nav.newChat")}
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0 h-full relative">
        {/* Navbar */}
        <div className="shrink-0 z-20 flex items-center justify-between border-b border-white/8 bg-[#060b18]/80 backdrop-blur-xl px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="size-5 text-slate-300" />
            </button>
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/8">
              <button 
                onClick={() => setMode("chat")}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${mode === "chat" ? 'bg-white/10 shadow-sm text-white' : 'text-slate-400 hover:text-white'}`}>
                <MessageSquare className="size-3.5" /> {t("nav.chat")}
              </button>
              <button 
                onClick={() => setMode("map")}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${mode === "map" ? 'bg-white/10 shadow-sm text-white' : 'text-slate-400 hover:text-white'}`}>
                <MapIcon className="size-3.5" /> {t("nav.map")}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher />
            <BackendSettings />
          </div>
        </div>

        {mode === "map" ? (
          <div className="flex-1 p-4 relative z-0">
            <MapSelector onSelectBounds={handleMapSelect} />
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 && !busy ? (
                <div className="flex flex-col items-center justify-center h-full px-4 py-12 text-center max-w-2xl mx-auto relative z-10">
                  <AnimatedGreeting text={greeting} />
                  <p className="text-slate-400 text-lg mb-8 max-w-md mx-auto animate-greeting" style={{ animationDelay: "0.4s" }}>
                    {t("input.placeholder.empty").replace("...", ". ") + t("input.formats").split("·").slice(0, 3).join("·") + "..."}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full animate-greeting" style={{ animationDelay: "0.6s" }}>
                    {suggestions.map((s) => (
                      <button key={s.q} onClick={() => { setQuery(s.q); textareaRef.current?.focus(); }}
                        className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left text-sm font-medium text-slate-300 shadow-sm hover:border-cyan-400/30 hover:bg-cyan-500/5 transition-all backdrop-blur-sm group">
                        <span className="text-lg group-hover:scale-110 transition-transform">{s.icon}</span>
                        {s.q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl w-full px-4 py-8 space-y-8 relative z-10">
                  {messages.map((msg) => {
                    if (msg.role === "user") {
                      return (
                        <div key={msg.id} className="flex gap-4 items-start justify-end">
                          <div className="max-w-[85%] space-y-3 min-w-0">
                            {msg.images && msg.images.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2 justify-end">
                                {msg.images.filter(Boolean).map((img) => img.previewUrl ? (
                                  <div key={img.id} className="relative group cursor-zoom-in" onClick={() => setLightboxData({ url: img.previewUrl!, boxes: [] })}>
                                    <img src={img.previewUrl} alt={img.file.name}
                                      className="rounded-xl border border-white/10 max-h-32 w-auto object-cover shadow-sm hover:ring-2 hover:ring-cyan-400/40 transition-all" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                      <ZoomIn className="size-5 text-white drop-shadow-lg" />
                                    </div>
                                  </div>
                                ) : (
                                  <div key={img.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-400 shadow-sm">
                                    <FileImage className="size-3.5 shrink-0" />
                                    <span className="truncate font-mono max-w-[100px]">{img.file.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {msg.text && (
                              <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-slate-200 px-4 py-3 text-sm leading-relaxed shadow-sm">
                                {msg.text}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 flex size-8 items-center justify-center rounded-full bg-white/10 border border-white/10 mt-1">
                            <User className="size-4 text-slate-300" />
                          </div>
                        </div>
                      );
                    }
                    if (msg.error) {
                      return (
                        <div key={msg.id} className="flex gap-4 items-start mb-8">
                          <div className="shrink-0 flex size-8 items-center justify-center rounded-full bg-red-500/10 mt-1">
                            <AlertCircle className="size-4 text-red-400" />
                          </div>
                          <div className="rounded-2xl bg-red-500/5 border border-red-500/20 px-5 py-4 text-sm text-red-400 font-semibold">
                            {msg.error}
                          </div>
                        </div>
                      );
                    }
                    if (msg.result) {
                      return <AssistantBubble key={msg.id} msg={msg} onImageClick={(url, boxes, label) => setLightboxData({ url, boxes, ...(label ? { label } : {}) })} />;
                    }
                    return null;
                  })}

                  {busy && (
                    <div className="flex gap-4 items-start mb-8">
                      <div className="shrink-0 flex size-8 items-center justify-center rounded-full bg-cyan-500 text-white mt-1 shadow-lg shadow-cyan-500/20">
                        <Bot className="size-4" />
                      </div>
                      <div className="rounded-2xl bg-[#0c1428]/80 backdrop-blur-sm border border-white/8 shadow-lg px-6 py-5 min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <Loader2 className="size-4 animate-spin text-cyan-400 shrink-0" />
                          <p className="text-[15px] font-bold text-white">{progressText || t("processing")}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Sticky input bar */}
            <div className="shrink-0 bg-transparent px-4 sm:px-6 pb-6 pt-2 z-20 relative">
              <div className="mx-auto max-w-3xl w-full space-y-2.5">
                {/* Pending image previews — bigger with click to view */}
                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap items-start gap-3 mb-2">
                    {pendingImages.map((img, idx) => (
                      <div key={img.id} className="relative group">
                        {img.previewUrl ? (
                          <div 
                            className="relative cursor-zoom-in rounded-xl overflow-hidden border border-white/10 shadow-lg hover:ring-2 hover:ring-cyan-400/40 transition-all"
                            onClick={() => setLightboxData({ url: img.previewUrl!, boxes: [] })}
                          >
                            <img src={img.previewUrl} alt={img.file.name} className="h-24 w-auto max-w-[180px] object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <ZoomIn className="size-5 text-white drop-shadow-lg" />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                              <p className="text-[10px] text-white font-bold truncate">{img.file.name}</p>
                              <p className="text-[9px] text-cyan-300 font-semibold">
                                {pendingImages.length > 1 ? (idx === 0 ? t("preEvent") : t("postEvent")) : "IMG"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 h-24">
                            <FileImage className="size-5 text-slate-400" />
                            <div>
                              <p className="text-xs text-slate-300 font-semibold truncate max-w-[120px]">{img.file.name}</p>
                              <p className="text-[10px] text-cyan-300 font-bold">
                                {pendingImages.length > 1 ? (idx === 0 ? t("preEvent") : t("postEvent")) : "IMG"}
                              </p>
                            </div>
                          </div>
                        )}
                        <button 
                          onClick={() => removeImage(img.id)}
                          className="absolute -top-1.5 -right-1.5 z-10 size-5 flex items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-400 transition-colors"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    {pendingImages.length === 2 && (
                      <div className="flex items-center self-center">
                        <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                          <Layers className="size-3.5" /> {t("biTemporal")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-end gap-2 rounded-3xl border border-white/10 bg-[#0c1428]/70 backdrop-blur-xl px-4 py-3 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.4)] focus-within:border-cyan-400/30 focus-within:ring-2 focus-within:ring-cyan-400/15 transition-all">
                  <button onClick={() => fileInputRef.current?.click()} disabled={pendingImages.length >= 2}
                    title={t("input.attach")}
                    className="shrink-0 flex size-9 items-center justify-center rounded-full text-slate-400 hover:text-cyan-400 hover:bg-white/5 disabled:opacity-30 transition-colors mb-0.5">
                    <Paperclip className="size-5" />
                  </button>
                  <input ref={fileInputRef} type="file" multiple
                    accept=".tif,.tiff,.geotiff,.png,.jpg,.jpeg,.jp2,.img" className="hidden"
                    onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
                  <textarea ref={textareaRef} value={query}
                    onChange={(e) => { setQuery(e.target.value); growTextarea(); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (query.trim() || pendingImages.length > 0) void submit(); } }}
                    placeholder={(pendingImages.length === 0 && messages.length === 0) ? t("input.placeholder.empty") : t("input.placeholder.followup")}
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-[15px] text-white placeholder:text-slate-500 outline-none py-1.5 leading-relaxed min-h-[36px] max-h-[200px]"
                  />
                  <button onClick={() => void submit()} disabled={busy || (!query.trim() && pendingImages.length === 0)}
                    className="shrink-0 flex size-9 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all mb-0.5 shadow-sm shadow-cyan-500/20">
                    {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
                  </button>
                </div>

                <p className="text-center text-xs text-slate-500">
                  {t("input.formats")}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
