import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { t } from "@/lib/i18n";
import {
  createOpeningRun, fadedVolume, OPENING_FADE_MS, OPENING_POSTER, OPENING_SKIP_SOUND_MS, OPENING_VIDEO, OPENING_VOLUME,
  openingPlan, openingWithSound, type OpeningLeave, type OpeningPlan, type OpeningRun,
} from "@/lib/opening";

function fadeOut(video: HTMLVideoElement, ms: number): void {
  const from = video.volume, start = performance.now();
  const step = () => {
    const elapsed = performance.now() - start;
    video.volume = fadedVolume(from, elapsed, ms);
    if (elapsed < ms) requestAnimationFrame(step);
    else video.pause();
  };
  requestAnimationFrame(step);
}

/** Starts with sound when it may; where the browser refuses sound, plays muted rather than not at all. */
function start(video: HTMLVideoElement, sound: boolean, run: OpeningRun): void {
  video.volume = OPENING_VOLUME;
  video.muted = !sound;
  void video.play().catch(() => {
    if (video.muted) return run.fail();
    video.muted = true;
    void video.play().catch(() => run.fail());
  });
}

function OpeningIntro({ plan, sound, onGone }: { plan: Exclude<OpeningPlan, "none">; sound: boolean; onGone(): void }) {
  const [leaving, setLeaving] = useState(false);
  const run = useRef<OpeningRun | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const fade = (why: OpeningLeave) => {
      setLeaving(true);
      if (video.current) fadeOut(video.current, why === "skip" ? OPENING_SKIP_SOUND_MS : OPENING_FADE_MS);
    };
    const current = createOpeningRun(plan, { fade, done: onGone });
    run.current = current;
    if (video.current) start(video.current, sound, current);
    const skip = () => current.finish("skip");
    window.addEventListener("keydown", skip, true);
    return () => {
      window.removeEventListener("keydown", skip, true);
      current.dispose();
    };
  }, [plan, sound, onGone]);
  return (
    <div
      data-opening={plan}
      role="presentation"
      onClick={() => run.current?.finish("skip")}
      className="fixed inset-0 z-[2147483647] flex cursor-pointer items-center justify-center bg-[#050817] transition-opacity ease-out"
      style={{ opacity: leaving ? 0 : 1, transitionDuration: `${OPENING_FADE_MS}ms` }}
    >
      {plan === "video" ? (
        <video
          ref={video}
          src={OPENING_VIDEO}
          poster={OPENING_POSTER}
          muted
          playsInline
          preload="auto"
          aria-label={t("opening.label")}
          className="size-full object-contain"
          onTimeUpdate={(event) => run.current?.progress(event.currentTarget.currentTime)}
          onEnded={() => run.current?.finish("end")}
          onError={() => run.current?.fail()}
        />
      ) : (
        <img src={OPENING_POSTER} alt={t("opening.label")} className="size-full object-contain" onError={() => run.current?.fail()} />
      )}
      <span className="sr-only">{t("opening.skip")}</span>
    </div>
  );
}

/** Asks the desktop app once, before anything else of the page loads, whether this launch opens with the video. */
export function mountOpening(): void {
  const claim = window.ogb?.opening?.claim;
  if (!claim) return;
  void claim().then((claimed) => {
    const plan = openingPlan(claimed?.play === true, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    if (plan === "none") return;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gone = () => { root.unmount(); host.remove(); };
    root.render(<OpeningIntro plan={plan} sound={openingWithSound(plan, claimed.sound === true)} onGone={gone} />);
  }).catch(() => {});
}
