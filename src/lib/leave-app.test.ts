import { expect, it, vi } from "vitest";
import { leaveApp } from "./leave-app";
import type { SessionState } from "./session";

const session: SessionState = { kind: "session", id: "s1", label: "Chrome", scopes: [], expiresAt: 1 };

it("quits the whole desktop app, whatever page the window shows", async () => {
  const quit = vi.fn(async () => true);
  const logout = vi.fn(async () => {});
  const leave = leaveApp(session, { desktop: { quit }, logout });
  expect(leave?.kind).toBe("quit");
  await leave!.run();
  expect(quit).toHaveBeenCalledOnce();
  expect(logout).not.toHaveBeenCalled();
});

it("signs a browser out of its session and reloads to the sign-in page, even when the answer is lost", async () => {
  const reload = vi.fn();
  const logout = vi.fn(async () => { throw new Error("offline"); });
  const leave = leaveApp(session, { desktop: null, logout, reload });
  expect(leave?.kind).toBe("signOut");
  await leave!.run();
  expect(logout).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});

it("offers nothing where there is nothing to end: a browser on the server's own computer, or no session yet", () => {
  expect(leaveApp({ kind: "loopback" }, { desktop: null })).toBeNull();
  expect(leaveApp(null, { desktop: null })).toBeNull();
  expect(leaveApp({ kind: "unauthenticated", error: "401" }, { desktop: undefined })).toBeNull();
  expect(leaveApp(null, { desktop: { quit: undefined } })).toBeNull();
});
