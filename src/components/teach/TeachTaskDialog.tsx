import { Circle, Mic, MicOff, Monitor, AppWindow, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDesktopCapabilities } from "@/components/DesktopCapabilities";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { activeLocale, t } from "@/lib/i18n";
import { fishListeningReady, speechBridge } from "@/lib/speech";
import type { SpeechBridge } from "@/lib/fish-speech";
import { deviceNarration, localAudioNarration, narrationMode, type Narration } from "@/lib/teach-narration";
import { createFrameCollector, framesForDraft, teachClock } from "@/lib/teach-recorder";
import { api, ApiError } from "@/state/api";
import { useStore } from "@/state/store";
import {
  TEACH_FRAME_INTERVAL_MS, TEACH_MAX_MS, teachDraftProblem,
  type TeachDraftResponse, type TeachSaveResponse, type TeachSkillDraft,
} from "../../../shared/teach-task";
import { TeachBotPicker } from "./TeachBotPicker";

type Source = { id: string; name: string; kind: "screen" | "window"; thumbnail: string | null };
type Phase =
  | { kind: "pick" }
  | { kind: "recording"; startedAt: number }
  | { kind: "recorded"; durationMs: number }
  | { kind: "drafting" }
  | { kind: "review"; engine: string; sawFrames: boolean }
  | { kind: "saved"; name: string; count: number };

const PROBLEM_KEY = {
  name: "teach.problem.name",
  description: "teach.problem.description",
  body: "teach.problem.body",
} as const;

const UNAVAILABLE_KEY = {
  desktop: "teach.unavailable.desktop",
  platform: "teach.unavailable.platform",
  permission: "teach.unavailable.permission",
} as const;

const fieldCls = "w-full rounded-lg border border-hairline bg-inset px-3 py-2 text-[13px] text-ink outline-none focus:border-accent";

export function TeachTaskDialog({ initialBotIds = [], onClose, onSaved }: {
  initialBotIds?: string[];
  onClose: () => void;
  onSaved?: (name: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { state } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const capture = globalThis.window?.ogb?.teachCapture;
  const micMode = narrationMode(capabilities.dictation.engine, capabilities.dictation.available, fishListeningReady(state.config));

  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [sources, setSources] = useState<Source[] | null>(null);
  const [unavailable, setUnavailable] = useState<"platform" | "permission" | "desktop" | null>(capture ? null : "desktop");
  const [sourceId, setSourceId] = useState("");
  const [micOn, setMicOn] = useState(micMode !== "none");
  const [now, setNow] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [draft, setDraft] = useState<TeachSkillDraft>({ name: "", description: "", body: "" });
  const [botIds, setBotIds] = useState<string[]>(initialBotIds);
  const [error, setError] = useState("");

  const collector = useRef(createFrameCollector());
  const narration = useRef<Narration | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcript = useRef("");
  const grabbing = useRef(false);

  const forget = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    collector.current.clear();
    narration.current?.discard();
    narration.current = null;
    transcript.current = "";
    setFrameCount(0);
  }, []);

  useEffect(() => forget, [forget]);

  const close = () => {
    forget();
    onClose();
  };
  useModalDialog(dialogRef, close);

  useEffect(() => {
    if (!capture) return;
    let cancelled = false;
    void capture.sources().then((answer) => {
      if (cancelled) return;
      setUnavailable(answer.unavailable);
      setSources(answer.sources);
      setSourceId((current) => current || answer.sources.find((source) => source.kind === "screen")?.id || answer.sources[0]?.id || "");
    }).catch(() => !cancelled && setUnavailable("platform"));
    return () => {
      cancelled = true;
    };
  }, [capture]);

  const stop = useCallback(async (startedAt: number) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const durationMs = Math.min(TEACH_MAX_MS, Date.now() - startedAt);
    await narration.current?.stop();
    setPhase({ kind: "recorded", durationMs });
  }, []);

  const start = async () => {
    if (!capture || !sourceId) return;
    setError("");
    forget();
    if (micOn && micMode === "device") {
      const bridge = speechBridge();
      if (bridge) narration.current = deviceNarration(bridge as SpeechBridge);
    } else if (micOn && micMode === "on-generate") {
      try {
        narration.current = await localAudioNarration();
      } catch {
        setError(t("teach.error.mic"));
      }
    }
    const startedAt = Date.now();
    const tick = async () => {
      const at = Date.now() - startedAt;
      setNow(at);
      if (at >= TEACH_MAX_MS) return void stop(startedAt);
      if (grabbing.current) return;
      grabbing.current = true;
      try {
        const frame = await capture.frame(sourceId);
        if (frame && collector.current.offer(at, frame)) setFrameCount(collector.current.frames().length);
      } catch {}
      finally {
        grabbing.current = false;
      }
    };
    setNow(0);
    setPhase({ kind: "recording", startedAt });
    void tick();
    timer.current = setInterval(() => void tick(), TEACH_FRAME_INTERVAL_MS);
  };

  const generate = async (durationMs: number) => {
    setError("");
    setPhase({ kind: "drafting" });
    try {
      if (narration.current) {
        transcript.current = await narration.current.transcript();
        narration.current.discard();
        narration.current = null;
      }
      const source = sources?.find((candidate) => candidate.id === sourceId);
      const answer = await api<TeachDraftResponse>("/api/teach/draft", {
        method: "POST",
        body: JSON.stringify({
          frames: framesForDraft(collector.current.frames()),
          transcript: transcript.current,
          durationMs,
          sourceName: source?.name,
          language: activeLocale(),
          ...(initialBotIds[0] ? { botId: initialBotIds[0] } : {}),
        }),
        timeoutMs: 4 * 60_000,
      });
      setDraft(answer.draft);
      setPhase({ kind: "review", engine: answer.engine, sawFrames: answer.sawFrames });
    } catch (cause) {
      setError(cause instanceof ApiError && cause.body?.code === "no-engine" ? t("teach.error.noEngine") : cause instanceof Error ? cause.message : t("teach.error.draft"));
      setPhase({ kind: "recorded", durationMs });
    }
  };

  const save = async () => {
    const problem = teachDraftProblem(draft);
    if (problem) return setError(t(PROBLEM_KEY[problem]));
    if (!botIds.length) return setError(t("teach.error.noBots"));
    setError("");
    try {
      const result = await api<TeachSaveResponse>("/api/teach/save", { method: "POST", body: JSON.stringify({ draft, botIds }) });
      forget();
      if (result.failed.length) setError(result.failed.map((failure) => failure.error).join(" · "));
      setPhase({ kind: "saved", name: result.name, count: result.saved.length });
      onSaved?.(result.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("teach.error.save"));
    }
  };

  const discard = () => {
    forget();
    setDraft({ name: "", description: "", body: "" });
    setError("");
    setPhase({ kind: "pick" });
  };

  const privacy = <p className="text-[12px] leading-relaxed text-ink-secondary" data-teach="privacy">{t("teach.privacy")}</p>;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teach-title"
        className="flex max-h-[min(820px,92vh)] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-2xl bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div id="teach-title" className="text-[16px] font-semibold text-ink">{t("teach.title")}</div>
            <div className="mt-0.5 text-[12px] text-ink-secondary">{t("teach.subtitle")}</div>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={close} className="rounded-md p-1.5 text-ink-secondary hover:bg-control hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {phase.kind === "pick" && (
            <div className="flex flex-col gap-3">
              {privacy}
              {unavailable ? (
                <div role="status" className="rounded-lg bg-inset px-3 py-2 text-[13px] text-ink-secondary">{t(UNAVAILABLE_KEY[unavailable])}</div>
              ) : sources === null ? (
                <div className="text-[12px] text-ink-secondary">{t("teach.loadingSources")}</div>
              ) : (
                <div role="radiogroup" aria-label={t("teach.pickSource")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      role="radio"
                      aria-checked={source.id === sourceId}
                      onClick={() => setSourceId(source.id)}
                      className={`flex flex-col gap-1.5 rounded-xl border p-2 text-left ${source.id === sourceId ? "border-accent bg-accent/10" : "border-hairline hover:bg-raised"}`}
                    >
                      <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-md bg-inset">
                        {source.thumbnail ? <img src={source.thumbnail} alt="" className="size-full object-cover" /> : source.kind === "screen" ? <Monitor size={22} className="text-ink-secondary" /> : <AppWindow size={22} className="text-ink-secondary" />}
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-ink">
                        {source.kind === "screen" ? <Monitor size={12} /> : <AppWindow size={12} />}
                        <span className="truncate">{source.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <label className={`flex items-center gap-2 text-[13px] ${micMode === "none" ? "text-ink-secondary" : "text-ink"}`}>
                <input type="checkbox" checked={micOn && micMode !== "none"} disabled={micMode === "none"} onChange={(event) => setMicOn(event.target.checked)} />
                {micOn && micMode !== "none" ? <Mic size={14} /> : <MicOff size={14} />}
                {t("teach.mic")}
              </label>
              <div className="text-[12px] text-ink-secondary">
                {t(micMode === "device" ? "teach.mic.device" : micMode === "on-generate" ? "teach.mic.onGenerate" : "teach.mic.none")}
              </div>
            </div>
          )}

          {phase.kind === "recording" && (
            <div className="flex flex-col items-center gap-3 py-6" data-teach="recording">
              <div className="flex items-center gap-2 text-[13px] font-medium text-danger">
                <Circle size={12} className="fill-current" />{t("teach.recording")}
              </div>
              <div className="font-mono text-[40px] tabular-nums text-ink" aria-live="off">
                {teachClock(now)} <span className="text-[18px] text-ink-secondary">/ {teachClock(TEACH_MAX_MS)}</span>
              </div>
              <div className="text-[12px] text-ink-secondary">{t("teach.framesKept", { count: frameCount })}</div>
              <button type="button" onClick={() => void stop(phase.startedAt)} className="flex items-center gap-2 rounded-lg bg-danger px-5 py-2 text-[13px] font-semibold text-white">
                <Square size={13} className="fill-current" />{t("teach.stop")}
              </button>
              {privacy}
            </div>
          )}

          {phase.kind === "recorded" && (
            <div className="flex flex-col gap-2 py-2">
              <div className="text-[14px] text-ink">{t("teach.recorded", { time: teachClock(phase.durationMs), count: frameCount })}</div>
              {privacy}
            </div>
          )}

          {phase.kind === "drafting" && (
            <div role="status" className="py-8 text-center text-[13px] text-ink-secondary">{t("teach.drafting")}</div>
          )}

          {phase.kind === "review" && (
            <div className="flex flex-col gap-3" data-teach="review">
              <div className="text-[12px] text-ink-secondary">
                {t(phase.sawFrames ? "teach.review.hint" : "teach.review.noFrames", { engine: phase.engine })}
              </div>
              <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
                {t("teach.field.name")}
                <input className={`${fieldCls} font-mono`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
                {t("teach.field.description")}
                <input className={fieldCls} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-secondary">
                {t("teach.field.body")}
                <textarea rows={14} className={`${fieldCls} font-mono text-[12px] leading-relaxed`} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
              </label>
              <TeachBotPicker bots={state.bots.filter((bot) => !bot.hidden)} selected={botIds} onChange={setBotIds} />
            </div>
          )}

          {phase.kind === "saved" && (
            <div role="status" className="py-6 text-center text-[14px] text-ink">{t("teach.saved", { name: phase.name, count: phase.count })}</div>
          )}
        </div>

        {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          {phase.kind === "pick" && (
            <button type="button" disabled={Boolean(unavailable) || !sourceId} onClick={() => void start()} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
              <Circle size={11} className="fill-current" />{t("teach.start")}
            </button>
          )}
          {phase.kind === "recorded" && (
            <>
              <button type="button" onClick={discard} className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-secondary hover:bg-raised">{t("teach.discard")}</button>
              <button type="button" onClick={() => void generate(phase.durationMs)} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">{t("teach.generate")}</button>
            </>
          )}
          {phase.kind === "review" && (
            <>
              <button type="button" onClick={discard} className="rounded-lg px-4 py-2 text-[13px] font-medium text-ink-secondary hover:bg-raised">{t("teach.discard")}</button>
              <button type="button" onClick={() => void save()} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">{t("teach.save")}</button>
            </>
          )}
          {phase.kind === "saved" && (
            <button type="button" autoFocus onClick={close} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">{t("common.close")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
