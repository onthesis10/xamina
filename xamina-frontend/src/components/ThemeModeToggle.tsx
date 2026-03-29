import { useUiStore, type ThemeMode } from "@/store/ui.store";

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string; shortLabel: string }> = [
  { mode: "light", label: "☀️ Light", shortLabel: "Light" },
  { mode: "dark", label: "🌙 Dark", shortLabel: "Dark" },
  { mode: "fun", label: "🎨 Fun", shortLabel: "Fun" },
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
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          className={themeMode === option.mode ? "is-active" : ""}
          onClick={() => setThemeMode(option.mode)}
          aria-pressed={themeMode === option.mode}
        >
          <span className="theme-toggle-label">{compact ? option.shortLabel : option.label}</span>
        </button>
      ))}
    </div>
  );
}

