import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { marketplaceSkillsQueryOptions, useAllSkills, useProjectSkills } from "./skills";
import { queryClient } from "./client";
import { projectQueryKeys } from "./keys";
import type { ApiClient } from "../lib/api";

const fakeClient = {} as ApiClient;

function globalWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("marketplaceSkillsQueryOptions", () => {
  it("keys the query to the project marketplace skills domain", () => {
    const options = marketplaceSkillsQueryOptions("p1", fakeClient, true);
    expect(options.queryKey).toEqual(projectQueryKeys.marketplaceSkills("p1"));
  });

  it("passes enabled through", () => {
    expect(marketplaceSkillsQueryOptions("p1", fakeClient, true).enabled).toBe(true);
    expect(marketplaceSkillsQueryOptions("p1", fakeClient, false).enabled).toBe(false);
  });

  it("opts out of the global infinite staleTime so reopening refetches", () => {
    expect(marketplaceSkillsQueryOptions("p1", fakeClient, true).staleTime).toBe(0);
  });
});

describe("useProjectSkills / useAllSkills", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("useProjectSkills requests the project scope", async () => {
    const listSkills = vi.fn().mockResolvedValue([]);
    const client = { listSkills } as unknown as ApiClient;
    const { result } = renderHook(() => useProjectSkills("p1", client), {
      wrapper: globalWrapper,
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(listSkills).toHaveBeenCalledWith("project");
  });

  it("useAllSkills requests the full list on a separate key", async () => {
    const listSkills = vi.fn().mockResolvedValue([]);
    const client = { listSkills } as unknown as ApiClient;
    const { result } = renderHook(() => useAllSkills("p1", client), {
      wrapper: globalWrapper,
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(listSkills).toHaveBeenCalledWith();
    expect(projectQueryKeys.allSkills("p1")).not.toEqual(projectQueryKeys.skills("p1"));
  });
});
