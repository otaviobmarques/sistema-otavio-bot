import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PERSONAGEM_CLASSICO,
  PERSONAGEM_TAMANHOS,
  PERSONAGENS,
  derivedPersonagem,
  personagemSchema,
  resolvePersonagem,
} from "./personagens";

const ROOT = new URL("../", import.meta.url);

describe("personagens registry", () => {
  it("has unique neutral ids, crop boxes inside the image and generated files for every size", () => {
    expect(new Set(PERSONAGENS.map((p) => p.id)).size).toBe(PERSONAGENS.length);
    for (const personagem of PERSONAGENS) {
      expect(personagem.id).toMatch(/^[a-z0-9-]+$/);
      expect(personagem).not.toHaveProperty("nome");
      for (const recorte of ["rosto", "corpo"] as const) {
        const box = personagem[recorte];
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.lado).toBeLessThanOrEqual(1);
        expect(box.y + box.lado).toBeLessThanOrEqual(1);
        for (const tamanho of PERSONAGEM_TAMANHOS[recorte]) {
          expect(existsSync(new URL(`src/assets/personagens/${personagem.id}-${recorte}-${tamanho}.webp`, ROOT))).toBe(true);
        }
      }
    }
  });
});

describe("personagemSchema", () => {
  it("accepts every known id and the classic style, and rejects anything else", () => {
    for (const { id } of PERSONAGENS) expect(personagemSchema.safeParse(id).success).toBe(true);
    expect(personagemSchema.safeParse(PERSONAGEM_CLASSICO).success).toBe(true);
    for (const value of ["duque-2", "", 3, null, {}]) expect(personagemSchema.safeParse(value).success).toBe(false);
  });
});

describe("derivedPersonagem", () => {
  it("is stable per seed and spreads seeds across the whole set", () => {
    expect(derivedPersonagem("bot-1")).toBe(derivedPersonagem("bot-1"));
    const picked = new Set(Array.from({ length: 400 }, (_, index) => derivedPersonagem(`bot-${index}`).id));
    expect(picked.size).toBe(PERSONAGENS.length);
  });
});

describe("resolvePersonagem", () => {
  const seed = "bot-1";
  it("derives a character for a bot that never customised its look", () => {
    expect(resolvePersonagem({ seed })).toBe(derivedPersonagem(seed));
    expect(resolvePersonagem({ seed, choice: null, figurinha: null })).toBe(derivedPersonagem(seed));
    expect(resolvePersonagem({ seed, figurinha: {} })).toBe(derivedPersonagem(seed));
  });

  it("keeps the classic figurinha for a bot whose owner picked its parts", () => {
    expect(resolvePersonagem({ seed, figurinha: { head: "tall" } })).toBeNull();
  });

  it("honours an explicit pick, over figurinha parts too", () => {
    const last = PERSONAGENS.at(-1)!;
    expect(resolvePersonagem({ seed, choice: last.id, figurinha: { head: "tall" } })).toBe(last);
    expect(resolvePersonagem({ seed, choice: PERSONAGEM_CLASSICO })).toBeNull();
  });

  it("treats an id this client does not know as absent", () => {
    expect(resolvePersonagem({ seed, choice: "from-the-future" })).toBe(derivedPersonagem(seed));
    expect(resolvePersonagem({ seed, choice: "from-the-future", figurinha: { eyes: "dots" } })).toBeNull();
  });
});
