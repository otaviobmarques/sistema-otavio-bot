import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BotAvatar,
  MausAvatar,
  resolveBotAvatarOutcome,
  type BotAvatarProps,
  type MausAvatarProps,
} from "./Avatar";
import { derivedFigurinha } from "../../shared/figurinha";

const render = (props: Partial<MausAvatarProps>) =>
  renderToStaticMarkup(createElement(MausAvatar, { color: "green", animated: false, ...props }));

const renderBot = (bot: Partial<BotAvatarProps["bot"]>) =>
  renderToStaticMarkup(
    createElement(BotAvatar, { bot: { color: "green", ...bot }, animated: false }),
  );

const lookOf = (markup: string) => markup.match(/data-figurinha="([^"]+)"/)?.[1];

describe("MausAvatar figurinha", () => {
  it("derives the same character from the same seed, and another from another seed", () => {
    const one = derivedFigurinha("bot-1");
    expect(lookOf(render({ seed: "bot-1" }))).toBe(`${one.head}.${one.eyes}.${one.accessory}`);
    expect(lookOf(render({ seed: "bot-1" }))).toBe(lookOf(render({ seed: "bot-1" })));
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => lookOf(render({ seed })));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("wears the parts the bot picked over the derived ones", () => {
    expect(lookOf(render({ seed: "bot-1", figurinha: { head: "tall", eyes: "glasses", accessory: "headset" } }))).toBe("tall.glasses.headset");
  });

  it("keeps an old body's nearest head and dresses a festival costume as its accessory", () => {
    expect(lookOf(render({ seed: "bot-1", bodyId: "circle" }))?.split(".")[0]).toBe("round");
    expect(lookOf(render({ seed: "bot-1", bodyId: "pumpkin" }))?.split(".")[2]).toBe("horns");
    expect(lookOf(render({ seed: "bot-1", bodyId: "laddu" }))?.split(".")[2]).toBe("star");
  });

  it("ignores an unknown body and an invalid stored choice", () => {
    // SAFETY: "hexagram" and "cone" are deliberately invalid, to exercise the runtime fallback for persisted data.
    const markup = render({ seed: "bot-1", bodyId: "hexagram" as MausAvatarProps["bodyId"], figurinha: { head: "cone" } as never });
    const derived = derivedFigurinha("bot-1");
    expect(lookOf(markup)).toBe(`${derived.head}.${derived.eyes}.${derived.accessory}`);
  });

  it("paints the tile and face from the bot's colour", () => {
    expect(render({ color: "blue" })).not.toBe(render({ color: "red" }));
    expect(render({ color: "green" })).toContain('fill="#');
  });

  it("derives a bot's character from its id, so a rename keeps its look", () => {
    expect(lookOf(renderBot({ id: "bot-7", name: "Ana" }))).toBe(lookOf(renderBot({ id: "bot-7", name: "Bia" })));
  });

  it("does not draw a figurinha over an uploaded image", () => {
    const markup = renderBot({ mascotFaceColor: "black", avatarUrl: "/api/attachments/photo.png", avatarCrop: "circle" });
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<svg");
  });
});

describe("BotAvatar's two avatar outcomes", () => {
  it("zooms and positions a custom image inside its crop", () => {
    const markup = renderBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 2,
      avatarFocusX: 0.25,
      avatarFocusY: 0.75,
    });
    expect(markup).toContain("scale(2)");
    expect(markup).toContain("25% 75%");
    expect(markup).toContain("border-radius:50%");
  });

  it("renders a flat cropped image for circle/rounded/square, with no figurinha at all", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle" });
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<svg");
  });

  it("shows the image as it is, with no figurinha painted on it", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "square" });
    expect(markup).toContain("border-radius:0");
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<image");
    expect(markup).not.toContain("radialGradient");
  });

  it("renders the figurinha when the crop is mascot, image or not", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "mascot" });
    expect(markup).not.toContain("<img");
    expect(markup).toContain("<svg");
  });

  it("falls back to the figurinha when a flat crop has no valid image", () => {
    const markup = renderBot({ avatarUrl: undefined, avatarCrop: "circle" });
    expect(markup).not.toContain("<img");
    expect(markup).toContain("<svg");
  });
});

describe("resolveBotAvatarOutcome", () => {
  // imageFailed is set by the <img>'s onError, which renderToStaticMarkup never fires, so the decision is a pure
  // function.
  it("falls back to the figurinha for an image that failed to load", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "circle", hasUrl: true, imageFailed: true }),
    ).toBe("figurinha");
  });

  it("renders a good flat image flat", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "rounded", hasUrl: true, imageFailed: false }),
    ).toBe("flatImage");
  });

  it("keeps the mascot crop on the figurinha even with a loaded image", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "mascot", hasUrl: true, imageFailed: false }),
    ).toBe("figurinha");
  });

  it("falls back to the figurinha when there is no image at all", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "square", hasUrl: false, imageFailed: false }),
    ).toBe("figurinha");
  });
});
