import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { createMockHostBridge } from "../../test/host-bridge";
import { SpeakButton } from "./SpeakButton";
import { useTtsStore } from "./tts/tts-store";
import { stop } from "./tts/tts-controller";

function installFakeSpeech() {
  class FakeUtterance {
    text: string;
    voice: unknown = null;
    rate = 1;
    onend: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  const synth = {
    getVoices: vi.fn(() => []),
    speak: vi.fn(() => {}),
    cancel: vi.fn(() => {}),
    onvoiceschanged: null as (() => void) | null,
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
}

describe("SpeakButton", () => {
  beforeEach(() => {
    installFakeSpeech();
    useTtsStore.setState({ messageId: null, status: "idle" });
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it("starts reading aloud when clicked and reflects state", async () => {
    const user = userEvent.setup();
    const bridge = createMockHostBridge({
      getSettings: vi.fn(async () => ({
        models: {
          text: { defaultModel: "", providers: {} },
          image: { defaultModel: "", providers: {} },
        },
        tts: { voiceURI: "v1", rate: 1 },
      })),
    });
    renderWithProviders(<SpeakButton messageId="m1" text="你好" sessionId="s1" />, { bridge });

    const button = screen.getByRole("button");
    await user.click(button);
    expect(useTtsStore.getState().status).toBe("speaking");
    expect(useTtsStore.getState().messageId).toBe("m1");
  });

  it("does nothing when sessionId is missing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SpeakButton messageId="m1" text="你好" />, {
      bridge: createMockHostBridge(),
    });
    await user.click(screen.getByRole("button"));
    expect(useTtsStore.getState().status).toBe("idle");
  });
});