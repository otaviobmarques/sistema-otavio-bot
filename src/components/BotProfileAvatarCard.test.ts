import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { derivedFigurinha, FIGURINHA_ACCESSORIES, FIGURINHA_EYES, FIGURINHA_HEADS } from "../../shared/figurinha";
import { BotProfileAvatarCard } from "./BotProfileAvatarCard";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    threadId: "thread-1",
    name: "Maus",
    title: "Maus",
    description: "",
    notifications: false,
    color: "green",
    unread: false,
    modelSelection: { instanceId: "local", model: "test-model" },
    messages: [],
    ...overrides,
  };
}

function renderCard(bot: Bot) {
  return renderToStaticMarkup(
    createElement(
      StoreProvider,
      null,
      createElement(BotProfileAvatarCard, {
        bot,
        activeState: "idle",
        mascotMotion: null,
        onPatch: vi.fn(),
      }),
    ),
  );
}

describe("BotProfileAvatarCard figurinha picker", () => {
  it("offers every head, eyes and accessory, each drawn on the bot's own figurinha", () => {
    const markup = renderCard(makeBot());

    expect(markup).toContain(">Head<");
    expect(markup).toContain(">Eyes<");
    expect(markup).toContain(">Accessory<");
    for (const id of FIGURINHA_HEADS) expect(markup).toContain(`data-figurinha-option="head.${id}"`);
    for (const id of FIGURINHA_EYES) expect(markup).toContain(`data-figurinha-option="eyes.${id}"`);
    for (const id of FIGURINHA_ACCESSORIES) expect(markup).toContain(`data-figurinha-option="accessory.${id}"`);
    expect(markup).not.toContain(">Halloween<");
  });

  it("marks the parts derived from the bot id when it picked none", () => {
    const derived = derivedFigurinha("bot-1");
    const markup = renderCard(makeBot());

    expect(markup).toMatch(new RegExp(`aria-pressed="true"[^>]*data-figurinha-option="head\\.${derived.head}"`));
    expect(markup).toMatch(new RegExp(`aria-pressed="true"[^>]*data-figurinha-option="eyes\\.${derived.eyes}"`));
  });

  it("reflects explicitly chosen parts, and an old body's nearest head", () => {
    const markup = renderCard(makeBot({ figurinha: { eyes: "visor" }, mascotBody: "capsule" }));

    expect(markup).toMatch(/aria-pressed="true"[^>]*data-figurinha-option="eyes\.visor"/);
    expect(markup).toMatch(/aria-pressed="true"[^>]*data-figurinha-option="head\.tall"/);
  });

  it("offers zoom and drag framing for a custom image", () => {
    const markup = renderCard(makeBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 1.5,
    }));
    expect(markup).toContain('aria-label="Zoom avatar"');
    expect(markup).toContain("Drag the picture to reposition it");
    expect(markup).toContain("150%");
    expect(markup).toContain("Reset framing");
  });

  it("hides zoom controls for the figurinha", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain('aria-label="Zoom avatar"');
  });

  it("hides the figurinha picker for every flat crop", () => {
    for (const crop of ["circle", "rounded", "square"] as const) {
      const markup = renderCard(makeBot({ avatarCrop: crop }));

      expect(markup).not.toContain(">Head<");
      expect(markup).not.toContain("data-figurinha-option");
    }
  });
});
