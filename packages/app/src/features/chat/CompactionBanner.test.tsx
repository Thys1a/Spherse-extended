import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { translate } from "@spherse/i18n";
import type { ApiClient } from "../../lib/api";
import { renderWithProviders } from "../../test/render";
import { CompactionBanner } from "./CompactionBanner";

afterEach(() => {
  cleanup();
});

const EVENTS_WITH_DIGEST = [
  { seq: 0, type: "user/message", time: 1, data: {} },
  {
    seq: 5,
    type: "compaction/applied",
    time: 2,
    data: { anchorSeq: 4, digestContent: "summary of q1", excludedSeqs: [1, 2, 3] },
  },
];

function createClient(events: unknown = EVENTS_WITH_DIGEST) {
  return {
    getSessionEvents: vi.fn().mockResolvedValue({ sessionId: "s1", events }),
  } as unknown as ApiClient;
}

function renderBanner(
  props: Partial<Parameters<typeof CompactionBanner>[0]> = {},
  client = createClient(),
) {
  renderWithProviders(
    <CompactionBanner
      result={{ applied: true, excludedCount: 3 }}
      sessionId="s1"
      agentId="a1"
      client={client}
      onDismiss={vi.fn()}
      {...props}
    />,
  );
  return client;
}

describe("CompactionBanner", () => {
  it("renders the title with the collapsed count and no digest initially", () => {
    renderBanner();
    expect(
      screen.getByText(translate("zh-CN", "chat.compactBannerTitle", { count: 3 })),
    ).toBeInTheDocument();
    expect(screen.queryByText("summary of q1")).not.toBeInTheDocument();
  });

  it("renders the no-op text when compaction was not applied", () => {
    renderBanner({ result: { applied: false } });
    expect(screen.getByText(translate("zh-CN", "chat.compactNotNeeded"))).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: translate("zh-CN", "chat.compactBannerExpand") }),
    ).not.toBeInTheDocument();
  });

  it("loads the digest lazily on first expand", async () => {
    const user = userEvent.setup();
    const client = renderBanner();
    await user.click(
      screen.getByRole("button", { name: translate("zh-CN", "chat.compactBannerExpand") }),
    );
    expect(await screen.findByText("summary of q1")).toBeInTheDocument();
    expect(client.getSessionEvents).toHaveBeenCalledWith("a1", "s1");
  });

  it("shows the fallback text when the digest cannot be loaded", async () => {
    const user = userEvent.setup();
    renderBanner(
      {},
      { getSessionEvents: vi.fn().mockRejectedValue(new Error("boom")) } as unknown as ApiClient,
    );
    await user.click(
      screen.getByRole("button", { name: translate("zh-CN", "chat.compactBannerExpand") }),
    );
    expect(
      await screen.findByText(translate("zh-CN", "chat.compactBannerDigestFailed")),
    ).toBeInTheDocument();
  });

  it("shows the fallback text when the latest digest is missing or empty", async () => {
    const user = userEvent.setup();
    renderBanner(
      {},
      {
        getSessionEvents: vi.fn().mockResolvedValue({
          sessionId: "s1",
          events: [
            { seq: 5, type: "compaction/applied", time: 2, data: { anchorSeq: 4, excludedSeqs: [1] } },
            { seq: 9, type: "compaction/applied", time: 3, data: { anchorSeq: 8, excludedSeqs: [2], digestContent: "  " } },
          ],
        }),
      } as unknown as ApiClient,
    );
    await user.click(
      screen.getByRole("button", { name: translate("zh-CN", "chat.compactBannerExpand") }),
    );
    expect(
      await screen.findByText(translate("zh-CN", "chat.compactBannerDigestFailed")),
    ).toBeInTheDocument();
  });

  it("calls onDismiss when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderBanner({ onDismiss });
    await user.click(
      screen.getByRole("button", { name: translate("zh-CN", "chat.compactBannerClose") }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when client is missing", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CompactionBanner
        result={{ applied: true, excludedCount: 1 }}
        sessionId="s1"
        agentId="a1"
        client={null}
        onDismiss={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: translate("zh-CN", "chat.compactBannerExpand") }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(translate("zh-CN", "chat.compactBannerDigestFailed")),
      ).toBeInTheDocument();
    });
  });
});
