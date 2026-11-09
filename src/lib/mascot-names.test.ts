import { afterEach, describe, expect, it } from "vitest";

import { FIGURINHA_ACCESSORIES, FIGURINHA_EYES, FIGURINHA_HEADS } from "../../shared/figurinha";
import { en, locales } from "@/locales";
import { FIGURINHA_ACCESSORY_LABEL, FIGURINHA_EYES_LABEL, FIGURINHA_HEAD_LABEL } from "./figurinha";
import { setLocale } from "./i18n";
import { MAUS_COLOR_NAMES, PICKABLE_STATES } from "./mascot";
import { colorName, expressionName } from "./mascot-names";

afterEach(() => {
  setLocale("en");
});

describe("look names", () => {
  const keys = [
    ...FIGURINHA_HEADS.map((id) => FIGURINHA_HEAD_LABEL[id]),
    ...FIGURINHA_EYES.map((id) => FIGURINHA_EYES_LABEL[id]),
    ...FIGURINHA_ACCESSORIES.map((id) => FIGURINHA_ACCESSORY_LABEL[id]),
    ...MAUS_COLOR_NAMES.map((color) => `mascot.color.${color}`),
    ...PICKABLE_STATES.map((state) => `mascot.expression.${state}`),
  ];

  it("has an English and a Brazilian Portuguese name for every head, eyes, accessory, colour and face the pickers show", () => {
    for (const key of keys) {
      expect(Object.hasOwn(en, key), key).toBe(true);
      expect(Object.hasOwn(locales["pt-br"]!, key), key).toBe(true);
    }
  });

  it("reads the names in the app language", () => {
    expect([colorName("red"), expressionName("happy")]).toEqual(["red", "happy"]);
    setLocale("pt-br");
    expect([colorName("red"), expressionName("happy")]).toEqual(["vermelha", "feliz"]);
  });

  it("falls back to the id it was given when the catalog has none", () => {
    expect(expressionName("unknown-face")).toBe("unknown-face");
  });
});
