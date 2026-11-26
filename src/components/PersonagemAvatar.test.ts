import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BotAvatar, type BotAvatarProps } from "./Avatar";
import { PersonagemAvatar } from "./PersonagemAvatar";
import { PERSONAGEM_CLASSICO, PERSONAGENS, derivedPersonagem } from "../../shared/personagens";

const renderBot = (bot: Partial<BotAvatarProps["bot"]>, props: Partial<BotAvatarProps> = {}) =>
  renderToStaticMarkup(createElement(BotAvatar, { bot: { color: "green", id: "bot-1", name: "Ana", ...bot }, animated: false, ...props }));

const attr = (markup: string, name: string) => markup.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe("BotAvatar personagem", () => {
  it("draws the derived character for a bot that never customised its look", () => {
    const markup = renderBot({});
    expect(attr(markup, "data-personagem")).toBe(derivedPersonagem("bot-1").id);
    expect(markup).not.toContain("data-figurinha=");
    expect(markup).toContain('aria-label="Ana"');
  });

  it.each([[24, "rosto"], [32, "rosto"], [40, "rosto"], [55, "rosto"], [56, "corpo"], [64, "corpo"], [112, "corpo"]])(
    "at %ipx uses the %s crop", (size, recorte) => {
      const markup = renderBot({}, { size });
      expect(attr(markup, "data-personagem-recorte")).toBe(recorte);
      const id = derivedPersonagem("bot-1").id;
      expect(attr(markup, "srcSet")?.split(", ").every((entry) => entry.includes(`${id}-${recorte}-`))).toBe(true);
      expect(attr(markup, "sizes")).toBe(`${size}px`);
    },
  );

  it("draws the picked character", () => {
    const last = PERSONAGENS.at(-1)!;
    expect(attr(renderBot({ personagem: last.id, figurinha: { head: "tall" } }), "data-personagem")).toBe(last.id);
  });

  it("lets an uploaded photo win", () => {
    const markup = renderBot({ personagem: PERSONAGENS[0].id, avatarUrl: "/api/attachments/photo.png", avatarCrop: "circle" });
    expect(markup).toContain('src="/api/attachments/photo.png"');
    expect(markup).not.toContain("data-personagem=");
  });

  it("keeps the classic figurinha when opted in, or when the owner picked figurinha parts", () => {
    expect(renderBot({ personagem: PERSONAGEM_CLASSICO })).toContain("data-figurinha=");
    expect(renderBot({ figurinha: { head: "tall" } })).toContain('data-figurinha="tall.');
  });

  it("falls back from an unknown id", () => {
    expect(attr(renderBot({ personagem: "from-the-future" }), "data-personagem")).toBe(derivedPersonagem("bot-1").id);
  });
});

describe("PersonagemAvatar states", () => {
  const personagem = PERSONAGENS[0];
  it("bobs while working only when animated, and dims while sleeping either way", () => {
    expect(renderToStaticMarkup(createElement(PersonagemAvatar, { personagem, state: "working" }))).toContain("personagem-bob");
    expect(renderToStaticMarkup(createElement(PersonagemAvatar, { personagem, state: "working", animated: false }))).not.toContain("personagem-bob");
    expect(renderToStaticMarkup(createElement(PersonagemAvatar, { personagem, state: "sleeping", animated: false }))).toContain("personagem-dim");
  });

  it("paints the character's tile and hides itself from assistive tech without a label", () => {
    const markup = renderToStaticMarkup(createElement(PersonagemAvatar, { personagem }));
    expect(markup).toContain(`background:${personagem.tile}`);
    expect(markup).toContain('aria-hidden="true"');
  });
});
