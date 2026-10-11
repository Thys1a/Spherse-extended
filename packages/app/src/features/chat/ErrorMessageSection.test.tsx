import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorEventCode } from "@spherse/contracts";
import { renderWithProviders } from "../../test/render";
import { ErrorMessageSection } from "./ErrorMessageSection";

function renderError(props: { errorCode?: ErrorEventCode; onRetry?: () => void; diagnostics?: import("./model/entry").EntryDiagnostics } = {}) {
  renderWithProviders(
    <ErrorMessageSection
      error="raw failure text"
      errorCode={props.errorCode}
      diagnostics={props.diagnostics}
      onRetry={props.onRetry}
    />,
  );
}

describe("ErrorMessageSection", () => {
  it("collapses the raw error behind the summary trigger and expands on click", async () => {
    const user = userEvent.setup();
    renderError();

    expect(screen.getByRole("button", { name: /回复生成失败/ })).toBeInTheDocument();
    expect(screen.queryByText("raw failure text")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /回复生成失败/ }));
    expect(screen.getByText("raw failure text")).toBeInTheDocument();
  });

  it("renders the model-not-configured hint instead of the raw error for that code", async () => {
    const user = userEvent.setup();
    renderError({ errorCode: ErrorEventCode.ModelNotConfigured });

    await user.click(screen.getByRole("button", { name: /回复生成失败/ }));
    expect(screen.getByText(/尚未配置模型/)).toBeInTheDocument();
    expect(screen.queryByText("raw failure text")).not.toBeInTheDocument();
  });

  it("renders an open-settings button for auth errors that opens the models settings", async () => {
    const user = userEvent.setup();
    renderError({ errorCode: ErrorEventCode.Auth });

    const openSettings = screen.getByRole("button", { name: "打开设置" });
    await user.click(openSettings);

    const { useAppUiStore } = await import("../../stores/app-ui-store");
    expect(useAppUiStore.getState().settingsModalOpen).toBe(true);
    expect(useAppUiStore.getState().settingsModalTab).toBe("models");
  });

  it("does not render the open-settings button for other codes", () => {
    renderError({ errorCode: ErrorEventCode.ModelNotConfigured });
    expect(screen.queryByRole("button", { name: "打开设置" })).not.toBeInTheDocument();
  });

  it("wires the retry button when provided", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderError({ onRetry });

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry button when not provided", () => {
    renderError();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
  });

  it("renders diagnostics rows and copies them on click", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderError({
      diagnostics: { provider: "custom-go", stopReason: "length", promptTokens: 120, seq: 12 },
    });

    await user.click(screen.getByRole("button", { name: /回复生成失败/ }));
    expect(screen.getByText("诊断信息")).toBeInTheDocument();
    expect(screen.getByText("custom-go")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "复制诊断信息" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("provider: custom-go");
    expect(writeText.mock.calls[0][0]).toContain("seq: 12");
  });

  it("omits the diagnostics block without diagnostics", async () => {
    const user = userEvent.setup();
    renderError();

    await user.click(screen.getByRole("button", { name: /回复生成失败/ }));
    expect(screen.queryByText("诊断信息")).not.toBeInTheDocument();
  });
});
