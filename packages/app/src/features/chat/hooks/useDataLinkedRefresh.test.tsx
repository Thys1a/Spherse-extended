import { renderHook } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDataLinkedRefresh } from "./useDataLinkedRefresh";
import { connectMockBus, emitBusEvent, stubMockBusSocket, teardownMockBus } from "../../../test/bus";

const HTML = `<script>entries({file:"forum.data.json"})</script>`;

beforeEach(() => {
  stubMockBusSocket();
});

afterEach(() => {
  teardownMockBus();
});

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function emitChange(path: string): void {
  emitBusEvent({
    channel: "fs-watch",
    projectId: "p1",
    type: "change",
    payload: { eventType: "change", path },
  });
}

describe("useDataLinkedRefresh", () => {
  it("bumps on data-file and own-file changes, ignores others", async () => {
    const { result } = renderHook(() => useDataLinkedRefresh("p1", "card.html", HTML));
    await connectMockBus();
    expect(result.current).toBe(0);

    emitChange("forum.data.json");
    await settle();
    expect(result.current).toBe(1);

    emitChange("card.html");
    await settle();
    expect(result.current).toBe(2);

    emitChange("unrelated.txt");
    await settle();
    expect(result.current).toBe(2);
  });

  it("cleans up on unmount without crashing", async () => {
    const { result, unmount } = renderHook(() => useDataLinkedRefresh("p1", "card.html", HTML));
    await connectMockBus();
    unmount();
    emitChange("forum.data.json");
    await settle();
    expect(result.current).toBe(0);
  });
});
