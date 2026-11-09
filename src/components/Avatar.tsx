import { memo, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { MausColor, MausMotion, MausState } from "@/lib/mascot";
import { avatarCropRadius, botAvatarProfile, clampAvatarFocus, clampAvatarZoom, type BotAvatarCrop, type MascotFaceColor } from "../../shared/bot-avatar";
import type { BotBodyId } from "../../shared/bot-body";
import { resolveFigurinha, type FigurinhaChoice } from "../../shared/figurinha";
import { useFestivalDress, wornBody } from "@/lib/festival-dress";
import { t } from "@/lib/i18n";
import { Figurinha } from "./Figurinha";

const MOTION_STATE: Partial<Record<Exclude<MausMotion, "none">, MausState>> = {
  arrive: "spawning",
  switch: "waking",
  customize: "proud",
  alert: "alerting",
  thinking: "thinking",
  working: "working",
  launch: "loading",
  success: "happy",
  celebrate: "celebrate",
  surprise: "surprised",
  failure: "sad",
};

const MOTION_STATE_MS = 1400;

/** The product's own figurinha, for places that show no particular bot. */
export const PRODUCT_FIGURINHA_SEED = "otavio-bot";

export type MausAvatarProps = {
  color: MausColor;
  state?: MausState;
  size?: number;
  label?: string;
  motion?: MausMotion;
  motionKey?: number;
  trackPointer?: boolean;
  animated?: boolean;
  /** A stored body id from before figurinhas: steers the head, or dresses a festival costume. */
  bodyId?: BotBodyId;
  /** Accepted for stored looks; figurinhas keep their own ink. */
  faceColor?: MascotFaceColor | null;
  /** What derives the parts the bot did not pick: its id, so it looks the same everywhere. */
  seed?: string;
  figurinha?: FigurinhaChoice | null;
};

function MausAvatarComponent({ color, state = "idle", size = 44, label, motion = "none", motionKey = 0, animated = true, bodyId, seed, figurinha }: MausAvatarProps) {
  const [motionState, setMotionState] = useState<MausState | null>(null);
  useEffect(() => {
    if (motion === "none" || !animated) return;
    const beat = MOTION_STATE[motion];
    if (!beat) return;
    setMotionState(beat);
    const timer = setTimeout(() => setMotionState(null), MOTION_STATE_MS);
    return () => clearTimeout(timer);
  }, [motion, motionKey, animated]);
  const look = resolveFigurinha({ seed: seed ?? PRODUCT_FIGURINHA_SEED, choice: figurinha, body: bodyId });
  return <Figurinha look={look} color={color} size={size} state={motionState ?? state} animated={animated} label={label ?? null} />;
}

export const MausAvatar = memo(MausAvatarComponent);

export type BotAvatarProps = Omit<MausAvatarProps, "color" | "seed" | "figurinha"> & {
  bot: {
    id?: string;
    name?: string;
    color: MausColor;
    avatarUrl?: string | null;
    avatarCrop?: BotAvatarCrop;
    avatarZoom?: number;
    avatarFocusX?: number;
    avatarFocusY?: number;
    mascotBody?: BotBodyId | null;
    mascotFaceColor?: MascotFaceColor | null;
    figurinha?: FigurinhaChoice | null;
  };
};

export type BotAvatarOutcome = "flatImage" | "figurinha";

/** Mirrored name for name by resolveBotAvatarOutcome in ios/Sources/CompanionCore/BotAvatarRendering.swift. */
export function resolveBotAvatarOutcome(params: {
  avatarCrop: BotAvatarCrop;
  hasUrl: boolean;
  imageFailed: boolean;
}): BotAvatarOutcome {
  const { avatarCrop, hasUrl, imageFailed } = params;
  if (!hasUrl) return "figurinha";
  if (avatarCrop === "mascot") return "figurinha";
  if (imageFailed) return "figurinha";
  return "flatImage";
}

export function BotAvatar({ bot, size = 44, label, ...mascotProps }: BotAvatarProps) {
  const profile = botAvatarProfile(bot);
  const festival = useFestivalDress();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [profile.avatarUrl]);

  const outcome = resolveBotAvatarOutcome({
    avatarCrop: profile.avatarCrop,
    hasUrl: Boolean(profile.avatarUrl),
    imageFailed,
  });

  if (outcome !== "flatImage") {
    return (
      <MausAvatar
        bodyId={wornBody(bot.mascotBody, bot.color, festival)}
        {...mascotProps}
        color={bot.color}
        seed={bot.id ?? bot.name}
        figurinha={bot.figurinha}
        size={size}
        label={label ?? bot.name}
      />
    );
  }

  const radius = avatarCropRadius(profile.avatarCrop);
  const zoom = clampAvatarZoom(bot.avatarZoom ?? 1);
  const focusX = clampAvatarFocus(bot.avatarFocusX ?? 0.5);
  const focusY = clampAvatarFocus(bot.avatarFocusY ?? 0.5);
  const origin = `${focusX * 100}% ${focusY * 100}%`;
  return (
    <span
      className="relative block shrink-0 overflow-hidden bg-raised"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={profile.avatarUrl}
        alt={label ?? (bot.name ? t("avatar.alt", { name: bot.name }) : t("avatar.altFallback"))}
        width={size}
        height={size}
        draggable={false}
        onError={() => setImageFailed(true)}
        className="block size-full max-w-none object-cover"
        style={{
          width: size,
          height: size,
          objectPosition: origin,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: origin,
        }}
      />
    </span>
  );
}

export function InitialsAvatar({
  initials,
  avatarUrl,
  size = 32,
  fallback,
  fontSize,
  className,
}: {
  initials: string;
  avatarUrl?: string;
  size?: number;
  className?: string;
  /** drawn instead of the initials, for a person with no name or email to take them from */
  fallback?: ReactNode;
  fontSize?: number;
}) {
  // A picture that is gone (a restored backup carries the address, not the file) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  if (avatarUrl && failed !== avatarUrl) {
    return <img src={avatarUrl} alt="" onError={() => setFailed(avatarUrl)} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-raised text-ink-secondary font-medium", className)}
      style={{ width: size, height: size, fontSize: fontSize ?? size * 0.38 }}
    >
      {fallback ?? initials}
    </div>
  );
}
