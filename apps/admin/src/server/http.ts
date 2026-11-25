import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { Actor } from "../audit.ts";
import type { SessionAdmin } from "../auth/auth.ts";
import type { SessionCustomer } from "../customer/auth.ts";
import { DomainError } from "../domain/lifecycle.ts";

export interface Env {
  Variables: { admin: SessionAdmin; customer: SessionCustomer; ip: string };
  Bindings: { incoming?: { socket?: { remoteAddress?: string } } };
}

export type AppHono = Hono<Env>;
export type Ctx = Context<Env>;

export function router(): AppHono {
  return new Hono<Env>();
}

export function actorOf(c: Ctx): Actor & { id: string } {
  const admin = c.get("admin");
  return { type: "admin", id: admin.id, label: admin.email, ip: c.get("ip") };
}

export async function body<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new DomainError("Corpo da requisição precisa ser JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new DomainError(`Dados inválidos${first?.path.length ? ` em ${first.path.join(".")}` : ""}: ${first?.message ?? ""}`);
  }
  return parsed.data;
}

export const uuid = z.uuid();

export function param(c: Ctx, name: string): string {
  const value = c.req.param(name) ?? "";
  if (!uuid.safeParse(value).success) throw new DomainError("Registro não encontrado", 404);
  return value;
}

export const reason = z.string().trim().min(5, "explique o motivo (mínimo 5 caracteres)").max(500);
