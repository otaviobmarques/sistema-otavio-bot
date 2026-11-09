// Narration for Teach-a-task, through what dictation already uses here. On the Mac the speech helper transcribes on the
// device as the person speaks. Elsewhere the audio stays in this page's memory until "Generate skill", and only then
// goes to Fish Audio through /api/tts/transcribe, in clips under that route's size limit.
import { api } from "@/state/api";
import { encodeWav, rms, SAMPLE_RATE, type SpeechBridge } from "./fish-speech";

export type NarrationMode = "device" | "on-generate" | "none";

export function narrationMode(engine: DesktopCapabilities["dictation"]["engine"], available: boolean, fishReady: boolean): NarrationMode {
  if (!available) return "none";
  if (engine === "apple-speech") return "device";
  if (engine === "fish-audio" && fishReady) return "on-generate";
  return "none";
}

export interface Narration {
  stop(): Promise<void>;
  /** The words, transcribing first when the audio is still waiting. */
  transcript(): Promise<string>;
  /** Drops any audio and words held in memory. */
  discard(): void;
}

const CLIP_SECONDS = 4 * 60;
const SILENT_CLIP_RMS = 0.01;
const FRAME_SAMPLES = 4096;

/** Restarts the helper whenever it ends a session by itself, so a long recording keeps its words. */
export function deviceNarration(bridge: SpeechBridge): Narration {
  let done: string[] = [];
  let current = "";
  let active = true;
  let ended: (() => void) | null = null;
  const offLine = bridge.onSpeechTranscript((line) => {
    if (typeof line.text === "string") current = line.text;
  });
  const offEnd = bridge.onSpeechEnd(({ code }) => {
    if (current.trim()) done.push(current.trim());
    current = "";
    if (ended) {
      ended();
      ended = null;
      return;
    }
    if (active && code === 0) void bridge.speechStart().catch(() => {});
  });
  void bridge.speechStart().catch(() => {});
  const cleanup = () => {
    offLine();
    offEnd();
  };
  return {
    async stop() {
      if (!active) return;
      active = false;
      await Promise.race([
        new Promise<void>((resolve) => {
          ended = resolve;
          void (bridge.speechFinish ?? bridge.speechStop)().catch(() => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 4_000)),
      ]);
      if (current.trim()) done.push(current.trim());
      current = "";
      cleanup();
      void bridge.speechStop().catch(() => {});
    },
    async transcript() {
      return done.join(" ");
    },
    discard() {
      active = false;
      done = [];
      current = "";
      cleanup();
      void bridge.speechStop().catch(() => {});
    },
  };
}

/** Splits samples into clips of at most `seconds`, dropping clips nobody spoke in. */
export function narrationClips(frames: readonly Float32Array[], seconds = CLIP_SECONDS, rate = SAMPLE_RATE): Float32Array[][] {
  const clips: Float32Array[][] = [];
  let clip: Float32Array[] = [];
  let samples = 0;
  let loud = false;
  const close = () => {
    if (clip.length && loud) clips.push(clip);
    clip = [];
    samples = 0;
    loud = false;
  };
  for (const frame of frames) {
    clip.push(frame);
    samples += frame.length;
    if (rms(frame) > SILENT_CLIP_RMS) loud = true;
    if (samples >= seconds * rate) close();
  }
  close();
  return clips;
}

export async function localAudioNarration(): Promise<Narration> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(FRAME_SAMPLES, 1, 1);
  let frames: Float32Array[] = [];
  let open = true;
  processor.onaudioprocess = (event) => {
    if (open) frames.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(context.destination);
  void context.resume().catch(() => {});
  const release = () => {
    if (!open) return;
    open = false;
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void context.close().catch(() => {});
  };
  return {
    async stop() {
      release();
    },
    async transcript() {
      release();
      const texts: string[] = [];
      for (const clip of narrationClips(frames)) {
        const { text } = await api<{ text?: string }>("/api/tts/transcribe", {
          method: "POST",
          body: encodeWav(clip),
          headers: { "content-type": "audio/wav" },
          timeoutMs: 120_000,
        });
        if (text?.trim()) texts.push(text.trim());
      }
      frames = [];
      return texts.join(" ");
    },
    discard() {
      release();
      frames = [];
    },
  };
}
