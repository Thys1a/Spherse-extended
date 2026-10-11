import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ApiClient } from "../../lib/api";
import { queryClient } from "../client";
import { projectQueryKeys } from "../keys";
import { refreshAgentProfile, useAgentProfile } from "./agents";

function fakeClient(profile: unknown): ApiClient {
  return {
    getAgent: vi.fn().mockResolvedValue(profile),
  } as unknown as ApiClient;
}

function globalWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useAgentProfile", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the full agent profile including R4.2 fields", async () => {
    const profile = {
      id: "a1",
      name: "Helper",
      slug: "helper",
      systemPrompt: "p",
      filePath: "agent.md",
      placeholder: "输入消息…",
      greeting: "你好",
    };
    const client = fakeClient(profile);
    const { result } = renderHook(() => useAgentProfile("p1", client, "a1"), {
      wrapper: globalWrapper,
    });
    await waitFor(() => {
      expect(result.current.profile).toEqual(profile);
    });
    expect(client.getAgent).toHaveBeenCalledWith("a1");
  });

  it("refreshAgentProfile refetches the cached profile", async () => {
    const getAgent = vi
      .fn()
      .mockResolvedValueOnce({
        id: "a1",
        name: "Helper",
        slug: "helper",
        systemPrompt: "p",
        filePath: "agent.md",
        greeting: "v1",
      })
      .mockResolvedValue({
        id: "a1",
        name: "Helper",
        slug: "helper",
        systemPrompt: "p",
        filePath: "agent.md",
        greeting: "v2",
      });
    const client = { getAgent } as unknown as ApiClient;
    const { result } = renderHook(() => useAgentProfile("p1", client, "a1"), {
      wrapper: globalWrapper,
    });
    await waitFor(() => {
      expect(result.current.profile?.greeting).toBe("v1");
    });

    await refreshAgentProfile("p1", "a1");
    await waitFor(() => {
      expect(result.current.profile?.greeting).toBe("v2");
    });
    expect(getAgent).toHaveBeenCalledTimes(2);
  });

  it("keys the profile query under the project agents domain", async () => {
    const client = fakeClient({
      id: "a1",
      name: "Helper",
      slug: "helper",
      systemPrompt: "p",
      filePath: "agent.md",
    });
    await queryClient.fetchQuery({
      queryKey: [...projectQueryKeys.agents("p1"), "a1", "profile"],
      queryFn: () => client.getAgent("a1"),
    });
    expect(client.getAgent).toHaveBeenCalledTimes(1);
  });
});
