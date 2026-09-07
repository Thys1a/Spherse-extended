import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProviderCatalogItem } from "@spherse/core";
import { renderWithProviders } from "../../test/render";
import { AgentModelField } from "./AgentModelField";

const provider = (id: string, models: string[]): ProviderCatalogItem => ({
  id,
  name: id,
  auth: { type: "apiKey", envKeys: [] },
  models: models.map((m) => ({
    id: m,
    name: m,
    provider: id,
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
  })),
});

describe("AgentModelField", () => {
  it("shows configure-first hint when no provider has an API key", () => {
    renderWithProviders(
      <AgentModelField
        providers={{ openai: provider("openai", ["gpt-4"]) }}
        apiKeys={{}}
        globalDefault="gpt-4"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("请先在设置中配置 API Key")).toBeTruthy();
  });

  it("shows the selected model name in the trigger", () => {
    renderWithProviders(
      <AgentModelField
        providers={{ openai: provider("openai", ["gpt-4"]) }}
        apiKeys={{ openai: "sk-test" }}
        globalDefault="gpt-4"
        value="openai/gpt-4"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("gpt-4")).toBeTruthy();
  });

  it("shows follow-global label when value is empty", () => {
    renderWithProviders(
      <AgentModelField
        providers={{ openai: provider("openai", ["gpt-4"]) }}
        apiKeys={{ openai: "sk-test" }}
        globalDefault="gpt-4"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("跟随全局默认（当前：gpt-4）")).toBeTruthy();
  });
});
