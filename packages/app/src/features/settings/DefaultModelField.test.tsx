import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@spherse/i18n";
import { renderWithProviders } from "../../test/render";
import { DefaultModelField } from "./DefaultModelField";
import type { ProviderConfig } from "./types";

const keyed = { name: "Keyed", models: [{ id: "m1", name: "M1" }] } as ProviderConfig;
const keyless = {
  name: "Keyless",
  models: [{ id: "k1", name: "K1" }],
  keyless: true,
} as ProviderConfig;

function renderField(
  props: Partial<Parameters<typeof DefaultModelField>[0]> = {},
) {
  renderWithProviders(
    <DefaultModelField
      providers={{ keyed, keyless }}
      apiKeys={{}}
      configured={{}}
      value=""
      onChange={vi.fn()}
      {...props}
    />,
  );
}

describe("DefaultModelField", () => {
  it("lists server-configured providers even without local api keys", async () => {
    const user = userEvent.setup();
    renderField({ configured: { keyed: true } });

    expect(screen.queryByText(translate("zh-CN", "settings.models.configureFirst"))).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("M1")).toBeInTheDocument();
  });

  it("lists keyless providers without keys or configured flags", async () => {
    const user = userEvent.setup();
    renderField();

    expect(screen.queryByText(translate("zh-CN", "settings.models.configureFirst"))).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("K1")).toBeInTheDocument();
  });

  it("shows the configure-first hint when nothing is available", () => {
    renderField({ providers: { keyed } });
    expect(screen.getByText(translate("zh-CN", "settings.models.configureFirst"))).toBeInTheDocument();
  });

  it("treats keyless providers without models as unavailable", () => {
    renderField({ providers: { empty: { name: "Empty", models: [] as Array<{ id: string; name: string }>, keyless: true } as ProviderConfig } });
    expect(screen.getByText(translate("zh-CN", "settings.models.configureFirst"))).toBeInTheDocument();
  });

  it("hides the hint on load error instead of suggesting configuration", () => {
    renderField({ providers: {}, loadError: true });
    expect(screen.queryByText(translate("zh-CN", "settings.models.configureFirst"))).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

