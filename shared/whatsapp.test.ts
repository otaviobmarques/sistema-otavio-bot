import { describe, expect, it } from "vitest";

import { displayNumber, parseReply, phoneDigits, pickChoice, sameNumber, validOwnerNumber } from "./whatsapp.ts";

describe("the owner's number", () => {
  it("compares digits only, in any format", () => {
    expect(phoneDigits("+55 (11) 98765-4321")).toBe("5511987654321");
    expect(phoneDigits("0055 11 98765 4321")).toBe("5511987654321");
    expect(sameNumber("+55 11 98765-4321", "5511987654321")).toBe(true);
    expect(sameNumber("5511987654321", "5511987654322")).toBe(false);
    expect(sameNumber("", "")).toBe(false);
  });

  it("takes a Brazilian mobile with or without its ninth digit as the same number, and nothing else", () => {
    expect(sameNumber("5511987654321", "551187654321")).toBe(true);
    expect(sameNumber("551187654321", "5511987654321")).toBe(true);
    expect(sameNumber("5511987654321", "551187654322")).toBe(false);
    expect(sameNumber("14155550123", "1415555012")).toBe(false);
  });

  it("asks for an international number", () => {
    expect(validOwnerNumber("+55 11 98765-4321")).toBe(true);
    expect(validOwnerNumber("5511987654321")).toBe(true);
    expect(validOwnerNumber("11 98765-4321")).toBe(false);
    expect(validOwnerNumber("+1 415 555 0123")).toBe(true);
    expect(validOwnerNumber("98765-4321")).toBe(false);
    expect(validOwnerNumber("+55 11 9876a-4321")).toBe(false);
    expect(validOwnerNumber("0011 98765")).toBe(false);
    expect(displayNumber("5511987654321")).toBe("+55 11 98765-4321");
  });
});

describe("a reply", () => {
  it("splits a reference from the answer", () => {
    expect(parseReply("#A7 1")).toEqual({ reference: "A7", answer: "1" });
    expect(parseReply("a7 sim")).toEqual({ reference: "A7", answer: "sim" });
    expect(parseReply("1 #b12")).toEqual({ reference: "B12", answer: "1" });
    expect(parseReply("Não!")).toEqual({ answer: "nao" });
    expect(parseReply("  2 ")).toEqual({ answer: "2" });
  });

  it("picks a choice by number, words or yes and no", () => {
    const choices = ["Aprovar", "Recusar"];
    const meaning = { yes: 0, no: 1 };
    expect(pickChoice("1", choices, meaning)).toBe(0);
    expect(pickChoice("2", choices, meaning)).toBe(1);
    expect(pickChoice("3", choices, meaning)).toBeNull();
    expect(pickChoice("sim", choices, meaning)).toBe(0);
    expect(pickChoice("nao", choices, meaning)).toBe(1);
    expect(pickChoice("recusar", choices, meaning)).toBe(1);
    expect(pickChoice("Liberar até o fim do mês", ["Liberar até o fim do mês", "Manter pausado"])).toBe(0);
    expect(pickChoice("talvez", choices, meaning)).toBeNull();
    expect(pickChoice("sim", ["Azul", "Verde"])).toBeNull();
  });
});
