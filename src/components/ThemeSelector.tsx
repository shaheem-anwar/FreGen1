/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sun, Moon, Sparkles, Skull } from "lucide-react";

export type AppTheme = "dark" | "bright" | "green-aurora" | "violet-doom";

interface ThemeSelectorProps {
  theme: AppTheme;
  onChange: (theme: AppTheme) => void;
}

export default function ThemeSelector({ theme, onChange }: ThemeSelectorProps) {
  const options = [
    {
      id: "bright" as AppTheme,
      name: "Bright",
      icon: Sun,
      classes: "bg-[#FAF9F6] text-[#D97706] hover:bg-[#F3EFE0] border-amber-200",
      activeClasses: "ring-2 ring-amber-500 border-amber-400 bg-amber-50 text-amber-900",
    },
    {
      id: "dark" as AppTheme,
      name: "Dark",
      icon: Moon,
      classes: "bg-[#1E293B] text-slate-300 hover:bg-slate-700/80 border-slate-700",
      activeClasses: "ring-2 ring-slate-400 border-slate-400 bg-slate-800 text-white",
    },
    {
      id: "green-aurora" as AppTheme,
      name: "Aurora",
      icon: Sparkles,
      classes: "bg-[#0A1F13] text-[#059669] hover:bg-emerald-950/80 border-[#059669]/30",
      activeClasses: "ring-2 ring-emerald-400 border-emerald-400 bg-[#0c2e1b] text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]",
    },
    {
      id: "violet-doom" as AppTheme,
      name: "Doom",
      icon: Skull,
      classes: "bg-[#1C0D26] text-[#7C3AED] hover:bg-[#341847]/80 border-[#7C3AED]/30",
      activeClasses: "ring-2 ring-fuchsia-500 border-fuchsia-500 bg-[#2d1141] text-fuchsia-300 shadow-[0_0_15px_rgba(217,70,239,0.3)]",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-lg">
      <span className="text-[10px] uppercase tracking-wider font-mono font-bold opacity-60 px-2 select-none">
        Portal Theme:
      </span>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.id;
        return (
          <button
            key={opt.id}
            id={`theme_bt_${opt.id}`}
            onClick={() => onChange(opt.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-300 select-none ${
              isActive ? opt.activeClasses : opt.classes
            }`}
            title={`Switch to ${opt.name} design theme`}
          >
            <Icon size={14} className={isActive ? "animate-pulse" : ""} />
            <span>{opt.name}</span>
          </button>
        );
      })}
    </div>
  );
}
export { Sun, Moon, Sparkles, Skull };
