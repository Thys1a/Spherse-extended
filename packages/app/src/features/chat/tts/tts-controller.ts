import { splitSentences } from "./speech-text";
import { useTtsStore } from "./tts-store";

let voicesCache: SpeechSynthesisVoice[] = [];

export function loadVoices(): SpeechSynthesisVoice[] {
  const synth = getSynth();
  if (synth) {
    const voices = synth.getVoices();
    if (voices.length) voicesCache = voices;
  }
  return voicesCache;
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI?: string,
  locale?: string,
): SpeechSynthesisVoice | undefined {
  if (voiceURI) {
    const match = voices.find((v) => v.voiceURI === voiceURI);
    if (match) return match;
  }
  if (!locale) return undefined;
  const lang = locale.replace("_", "-").toLowerCase();
  const candidates = [lang, lang.split("-")[0]];
  for (const candidate of candidates) {
    const exact = voices.find((v) => v.lang.toLowerCase() === candidate);
    if (exact) return exact;
    const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(candidate));
    if (prefix) return prefix;
  }
  return undefined;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  return window.speechSynthesis;
}

let currentSessionId: string | null = null;
let queue: SpeechSynthesisUtterance[] = [];

function initVoicesListener(): void {
  const synth = getSynth();
  if (!synth) return;
  if (synth.getVoices().length) voicesCache = synth.getVoices();
  synth.onvoiceschanged = () => {
    voicesCache = synth.getVoices();
  };
}

function cancelPlayback(): void {
  const synth = getSynth();
  if (synth) synth.cancel();
  queue = [];
}

export function speak(
  messageId: string,
  sessionId: string,
  text: string,
  options: { voiceURI?: string; rate?: number; locale?: string },
): void {
  const synth = getSynth();
  if (!synth) return;
  cancelPlayback();
  currentSessionId = sessionId;
  queue = splitSentences(text).map((sentence) => {
    const utterance = new SpeechSynthesisUtterance(sentence);
    const voice = pickVoice(loadVoices(), options.voiceURI, options.locale);
    if (voice) utterance.voice = voice;
    if (options.rate != null) utterance.rate = options.rate;
    utterance.onend = () => {
      queue.shift();
      if (queue.length > 0) {
        synth.speak(queue[0]);
      } else {
        reset();
      }
    };
    return utterance;
  });
  useTtsStore.getState().start(messageId);
  if (queue.length > 0) synth.speak(queue[0]);
}

export function stop(): void {
  const synth = getSynth();
  if (synth) synth.cancel();
  reset();
}

export function stopIfSession(sessionId: string): void {
  if (currentSessionId != null && currentSessionId !== sessionId) {
    stop();
  }
}

function reset(): void {
  queue = [];
  currentSessionId = null;
  useTtsStore.getState().stop();
}

initVoicesListener();
