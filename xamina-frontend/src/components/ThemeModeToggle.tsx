import { Sun, Moon, Sparkles } from "lucide-react";
import { useUiStore, type ThemeMode } from "@/store/ui.store";

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string; icon: any }> = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "fun", label: "Fun", icon: Sparkles },
];

interface ThemeModeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeModeToggle({ compact = false, className = "" }: ThemeModeToggleProps) {
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);

  return (
    <div className={`theme-toggle ${compact ? "theme-toggle-compact" : ""} ${className}`.trim()}>
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.mode}
            type="button"
            className={themeMode === option.mode ? "is-active" : ""}
            onClick={() => setThemeMode(option.mode)}
            aria-pressed={themeMode === option.mode}
            title={option.label}
          >
            <span className="theme-toggle-label">
              <Icon size={14} className={compact ? "" : "mr-1.5"} />
              {!compact && option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

