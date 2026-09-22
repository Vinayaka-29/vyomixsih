import { useState } from "react";
import { Globe } from "lucide-react";
import { useI18n, LANGUAGES, type Language } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);

  const currentLang = LANGUAGES.find((l) => l.code === lang);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change language"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white backdrop-blur-sm"
        title={t("language")}
      >
        <Globe className="size-3.5" />
        <span className="hidden sm:inline">{currentLang?.nativeLabel}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-white/10 bg-[#0c1425]/95 backdrop-blur-xl p-1.5 shadow-2xl shadow-black/40">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all ${
                  lang === l.code
                    ? "bg-cyan-500/15 text-cyan-300 font-semibold"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-base">{l.nativeLabel}</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {l.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
