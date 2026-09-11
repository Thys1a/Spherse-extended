import { useEffect, useRef, useState } from "react";
import { act, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ApiClient } from "../../../lib/api";
import { useDirtyPathsStore } from "../../../lib/dirty-paths";
import { useContentEditor } from "./useContentEditor";

function Harness({
  client,
  onApi,
}: {
  client: ApiClient;
  onApi: (api: ReturnType<typeof useContentEditor>) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState("hello");
  const editor = useContentEditor({
    client,
    projectId: "p1",
    filePath: "a.md",
    content,
    setContent,
    containerRef,
  });
  useEffect(() => {
    onApi(editor);
  });
  return (
    <div ref={containerRef}>
      <button type="button">inside</button>
    </div>
  );
}

function renderEditor() {
  const client = {
    saveContent: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as ApiClient & { saveContent: ReturnType<typeof vi.fn> };
  let api: ReturnType<typeof useContentEditor> | null = null;
  renderWithProviders(<Harness client={client} onApi={(a) => (api = a)} />);
  return {
    client,
    api: () => {
      if (!api) throw new Error("api not captured");
      return api;
    },
  };
}

describe("useContentEditor Ctrl+S scope", () => {
  beforeEach(() => {
    useDirtyPathsStore.setState({ byProject: {} });
  });

  it("saves when focus is inside the container", async () => {
    const user = userEvent.setup();
    const { client, api } = renderEditor();

    act(() => {
      api().enterEdit();
    });
    act(() => {
      api().setEditedContent("hello world");
    });
    await user.click(screen.getByText("inside"));
    await user.keyboard("{Control>}s{/Control}");

    expect(client.saveContent).toHaveBeenCalledWith("a.md", "hello world");
  });

  it("ignores Ctrl+S when focus is outside the container", async () => {
    const user = userEvent.setup();
    const { client, api } = renderEditor();

    act(() => {
      api().enterEdit();
    });
    act(() => {
      api().setEditedContent("hello world");
    });
    await user.click(document.body);
    await user.keyboard("{Control>}s{/Control}");

    expect(client.saveContent).not.toHaveBeenCalled();
  });
});
