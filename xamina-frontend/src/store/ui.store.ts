import { create } from "zustand";
import { persist } from "zustand/middleware";

type InstallPromptState = "unsupported" | "available" | "dismissed" | "installed";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface UiState {
  pageTitle: string;
  setPageTitle: (title: string) => void;
  activeTenantId: string | null;
  setActiveTenantId: (tenantId: string | null) => void;
  installPromptState: InstallPromptState;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  setDeferredInstallPrompt: (event: BeforeInstallPromptEvent | null) => void;
  setInstallPromptState: (state: InstallPromptState) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      pageTitle: "Dashboard",
      setPageTitle: (pageTitle) => set({ pageTitle }),
      activeTenantId: null,
      setActiveTenantId: (activeTenantId) => set({ activeTenantId }),
      installPromptState: "unsupported",
      deferredInstallPrompt: null,
      setDeferredInstallPrompt: (deferredInstallPrompt) => set({ deferredInstallPrompt }),
      setInstallPromptState: (installPromptState) => set({ installPromptState }),
    }),
    {
      name: "xamina-ui-storage",
      partialize: (state) => ({ activeTenantId: state.activeTenantId })
    }
  )
);
