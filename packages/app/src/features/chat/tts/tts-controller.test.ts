import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickVoice } from "./tts-controller";
import { speak, stop } from "./tts-controller";
import { useTtsStore } from "./tts-store";

function fakeVoice(voiceURI: string, lang: string): SpeechSynthesisVoice {
  return { voiceURI, lang, name: voiceURI, localService: true, default: false } as SpeechSynthesisVoice;
}

let instances: Array<{ text: string; onend: (() => void) | null }> = [];

function installFakeSpeech() {
  instances = [];
  class FakeUtterance {
    text: string;
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    onend: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
      instances.push(this);
    }
    onerror: (() => void) | null = null;
  }
  const synth = {
    getVoices: vi.fn(() => []),
    speak: vi.fn(() => {}),
    cancel: vi.fn(() => { instances.length = 0; }),
    onvoiceschanged: null as (() => void) | null,
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return synth;
}

describe("pickVoice", () => {
  it("matches by exact voiceURI", () => {
    const voices = [fakeVoice("zh-CN-Huihui", "zh-CN"), fakeVoice("en-US-Aria", "en-US")];
    expect(pickVoice(voices, "zh-CN-Huihui")?.voiceURI).toBe("zh-CN-Huihui");
  });

  it("matches by locale prefix", () => {
    const voices = [fakeVoice("v1", "zh-CN"), fakeVoice("v2", "en-US")];
    expect(pickVoice(voices, undefined, "zh-CN")?.voiceURI).toBe("v1");
    expect(pickVoice(voices, undefined, "zh")?.voiceURI).toBe("v1");
  });

  it("returns undefined when nothing matches", () => {
    expect(pickVoice([], undefined, "ja-JP")).toBeUndefined();
  });
});

describe("speak / stop", () => {
  beforeEach(() => {
    installFakeSpeech();
    useTtsStore.setState({ messageId: null, status: "idle" });
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it("starts speaking and sets store status", () => {
    const synth = globalThis.speechSynthesis as unknown as { speak: ReturnType<typeof vi.fn> };
    speak("m1", "s1", "你好，世界。这是一段话。", {});
    expect(useTtsStore.getState().status).toBe("speaking");
    expect(useTtsStore.getState().messageId).toBe("m1");
    expect(synth.speak).toHaveBeenCalled();
  });

  it("stops and resets store status", () => {
    speak("m1", "s1", "你好。", {});
    stop();
    expect(useTtsStore.getState().status).toBe("idle");
    expect(useTtsStore.getState().messageId).toBeNull();
  });
});
