import { useEffect, useState, useRef } from "react";
import { Settings, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function BackendSettings({ onChange }: { onChange?: (keys: any) => void }) {
  const [open, setOpen] = useState(false);
  const [apiKey1, setApiKey1] = useState("");
  const [apiKey2, setApiKey2] = useState("");
  const [online, setOnline] = useState<boolean | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const getStorage = (key: string) => typeof window !== "undefined" ? window.localStorage.getItem(key) : "";
    const k1 = getStorage("satquery.apikey1") || getStorage("satquery.apikey") || "";
    const k2 = getStorage("satquery.apikey2") || "";

    setApiKey1(k1);
    setApiKey2(k2);
    setOnline(!!k1 || !!k2);

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const save = () => {
    if (typeof window !== "undefined") {
      const setStorage = (k: string, v: string) => v ? window.localStorage.setItem(k, v.trim()) : window.localStorage.removeItem(k);
      setStorage("satquery.apikey1", apiKey1);
      setStorage("satquery.apikey", apiKey1);
      setStorage("satquery.apikey2", apiKey2);
      setOnline(!!apiKey1 || !!apiKey2);
    }
    onChange?.({ apiKey1, apiKey2 });
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open backend settings"
        className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-sm transition-all hover:bg-white/10 backdrop-blur-sm cursor-pointer"
        title="Settings"
      >
        <Settings className="size-4 text-slate-300" />
        <div className="absolute -right-0.5 -top-0.5 rounded-full bg-[#0c1428]">
          {online ? (
            <CheckCircle2 className="size-3 text-emerald-400" />
          ) : (
            <AlertCircle className="size-3 text-amber-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-white/10 bg-[#0c1425]/95 backdrop-blur-xl p-5 shadow-2xl shadow-black/40 max-h-[80vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="size-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white font-serif">{t("settings.title")}</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>API Key 1</span>
                <span className="text-[10px] text-cyan-400 font-bold lowercase bg-cyan-500/10 px-1.5 py-0.5 rounded">primary</span>
              </label>
              <input
                value={apiKey1}
                type="password"
                onChange={(e) => setApiKey1(e.target.value)}
                placeholder="Enter Primary API Key..."
                className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 font-mono text-xs text-white outline-none transition-colors focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 placeholder:text-slate-500"
              />
            </div>
            
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>API Key 2</span>
                <span className="text-[10px] text-slate-400 font-bold lowercase bg-white/5 px-1.5 py-0.5 rounded">backup</span>
              </label>
              <input
                value={apiKey2}
                type="password"
                onChange={(e) => setApiKey2(e.target.value)}
                placeholder="Enter Backup API Key..."
                className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 font-mono text-xs text-white outline-none transition-colors focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 placeholder:text-slate-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {t("settings.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-cyan-400 transition-colors cursor-pointer"
              >
                {t("settings.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
