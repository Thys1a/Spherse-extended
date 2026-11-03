import { useEffect } from "react";
import { Outlet } from "react-router";
import { TooltipProvider } from "../components/ui/tooltip";
import { Toaster } from "../components/ui/sonner";
import { ApprovalNoticeBridge } from "../features/chat/ApprovalNoticeBridge";
import { useHostBridge } from "../context/host-bridge-context";
import { I18nProvider } from "@spherse/i18n/react";
import { DEFAULT_LOCALE } from "@spherse/i18n";
import { useAppStore } from "../stores/app-store";
import { useSettingsStore } from "../stores/settings-store";
import { useBusStore } from "../stores/bus-store";

export function FloatRoot() {
  const bridge = useHostBridge();
  const locale = useSettingsStore((s) => s.locale);
  const loadSettings = useSettingsStore((s) => s.loadPrefs);
  const refreshConnection = useAppStore((s) => s.refreshConnection);

  useEffect(() => {
    void refreshConnection(bridge);
  }, [bridge, refreshConnection]);

  useEffect(() => {
    void loadSettings(bridge);
  }, [bridge, loadSettings]);

  useEffect(() => {
    void useBusStore.getState().init(bridge);
  }, [bridge]);

  return (
    <I18nProvider locale={locale ?? DEFAULT_LOCALE}>
      <TooltipProvider>
        <div data-float-root className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
          <Outlet />
          <Toaster />
          <ApprovalNoticeBridge />
        </div>
      </TooltipProvider>
    </I18nProvider>
  );
}
