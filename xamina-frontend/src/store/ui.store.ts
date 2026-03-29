import { create } from "zustand";
import { persist } from "zustand/middleware";

type InstallPromptState = "unsupported" | "available" | "dismissed" | "installed";
type CoreTourPage = "dashboard" | "question_bank" | "exams" | "reports";
type CoreTourStatus = "active" | "dismissed" | "completed";
export type ThemeMode = "light" | "dark" | "fun";

const CORE_TOUR_SEQUENCE: CoreTourPage[] = ["dashboard", "question_bank", "exams", "reports"];

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface UiState {
  pageTitle: string;
  setPageTitle: (title: string) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  activeTenantId: string | null;
  setActiveTenantId: (tenantId: string | null) => void;
  installPromptState: InstallPromptState;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  setDeferredInstallPrompt: (event: BeforeInstallPromptEvent | null) => void;
  setInstallPromptState: (state: InstallPromptState) => void;
  coreTourStatus: CoreTourStatus;
  coreTourStep: number;
  advanceCoreTour: () => void;
  dismissCoreTour: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      pageTitle: "Dashboard",
      setPageTitle: (pageTitle) => set({ pageTitle }),
      themeMode: "light",
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleThemeMode: () =>
        set((state) => ({
          themeMode:
            state.themeMode === "light"
              ? "dark"
              : state.themeMode === "dark"
                ? "fun"
                : "light",
        })),
      activeTenantId: null,
      setActiveTenantId: (activeTenantId) => set({ activeTenantId }),
      installPromptState: "unsupported",
      deferredInstallPrompt: null,
      setDeferredInstallPrompt: (deferredInstallPrompt) => set({ deferredInstallPrompt }),
      setInstallPromptState: (installPromptState) => set({ installPromptState }),
      coreTourStatus: "active",
      coreTourStep: 0,
      advanceCoreTour: () =>
        set((state) => {
          const nextStep = state.coreTourStep + 1;
          if (nextStep >= CORE_TOUR_SEQUENCE.length) {
            return { coreTourStep: CORE_TOUR_SEQUENCE.length - 1, coreTourStatus: "completed" };
          }
          return { coreTourStep: nextStep, coreTourStatus: "active" };
        }),
      dismissCoreTour: () => set({ coreTourStatus: "dismissed" }),
    }),
    {
      name: "xamina-ui-storage",
      partialize: (state) => ({
        themeMode: state.themeMode,
        activeTenantId: state.activeTenantId,
        coreTourStatus: state.coreTourStatus,
        coreTourStep: state.coreTourStep,
      }),
    }
  )
);

export { CORE_TOUR_SEQUENCE };
export type { CoreTourPage, CoreTourStatus };
