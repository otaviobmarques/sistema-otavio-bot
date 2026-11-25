import { describe, expect, it } from "vitest";
import { ResendMailer, type FetchLike } from "../src/mail/mailer.ts";

describe("ResendMailer", () => {
  it("sends the message to Resend with the key and the sender", async () => {
    const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => '{"id":"x"}' };
    };
    const mailer = new ResendMailer({ apiKey: "re_test", from: "ArkoBot <admin@arkobot.com.br>", fetch });
    await mailer.send({ to: "ana@example.com", subject: "Oi", text: "Olá" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.headers.authorization).toBe("Bearer re_test");
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ from: "ArkoBot <admin@arkobot.com.br>", to: ["ana@example.com"], subject: "Oi", text: "Olá" });
  });

  it("fails loudly when Resend refuses, without echoing the key", async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 403, text: async () => '{"message":"domain not verified"}' });
    const mailer = new ResendMailer({ apiKey: "re_secret", from: "a@arkobot.com.br", fetch });
    const error = await mailer.send({ to: "ana@example.com", subject: "Oi", text: "Olá" }).catch((e: Error) => e);
    expect(String(error)).toMatch(/HTTP 403.*domain not verified/);
    expect(String(error)).not.toContain("re_secret");
  });
});
