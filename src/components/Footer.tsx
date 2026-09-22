import { Link } from "react-router-dom";
import { Globe2, Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_0_30px_rgba(34,211,238,0.2)] ring-1 ring-cyan-500/20">
                <Sparkles className="size-5 text-cyan-300" />
              </span>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300 leading-none">
                  SIH26167
                </span>
                <span className="font-sans text-2xl font-bold tracking-tight text-white">
                  VYOMIX
                </span>
              </div>
            </div>

            <p className="max-w-sm text-sm font-medium leading-relaxed text-slate-300">
              Mission-ready satellite intelligence for rapid geospatial understanding, change detection, and evidence-backed decision support.
            </p>

            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200">
              <Globe2 className="size-3.5 text-cyan-300" />
              <span>VYOMIX Earth Intelligence Suite</span>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">Navigation</h3>
            <ul className="space-y-2.5 text-sm font-medium text-slate-400">
              <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><a href="/#workspace" className="hover:text-white transition-colors">Analyse</a></li>
              <li><a href="/#workspace" className="hover:text-white transition-colors">Evidence</a></li>
              <li><a href="/#workspace" className="hover:text-white transition-colors">Execution</a></li>
              <li><a href="/#workspace" className="hover:text-white transition-colors">Report</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">Account</h3>
            <ul className="space-y-2.5 text-sm font-medium text-slate-400">
              <li><Link to="/login" className="hover:text-white transition-colors">Login</Link></li>
              <li><Link to="/signup" className="hover:text-white transition-colors">Sign Up</Link></li>
              <li><Link to="/profile" className="hover:text-white transition-colors">Profile</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">Information</h3>
            <ul className="space-y-2.5 text-sm font-medium text-slate-400">
              <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
              <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Terms & Conditions</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-6 text-xs font-medium text-slate-400 sm:flex-row">
          <p>© 2026 VYOMIX. All rights reserved.</p>
          <p className="font-semibold text-slate-200">VYOMIX — SIH26167</p>
        </div>
      </div>
    </footer>
  );
}
