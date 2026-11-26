import type { SessionState } from "./session";

/** The profile menu's last row. In the desktop app it quits the whole app (main's app:quit, the tray's Quit path); in a
 * browser signed in to a server or Cloud it ends this browser's session (POST /api/auth/logout) and reloads to the
 * sign-in page. A browser on the server's own computer (loopback) has no session to end, so it has no row. */
export type LeaveApp = { kind: "quit" | "signOut"; run: () => Promise<void> };

export function leaveApp(
  session: SessionState | null,
  {
    desktop = typeof window === "undefined" ? undefined : window.ogb?.app,
    logout = () => fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }),
    reload = () => window.location.reload(),
  }: {
    desktop?: { quit?: () => Promise<unknown> } | null;
    logout?: () => Promise<unknown>;
    reload?: () => void;
  } = {},
): LeaveApp | null {
  const quit = desktop?.quit;
  if (quit) return { kind: "quit", run: async () => { await quit(); } };
  if (session?.kind !== "session") return null;
  return {
    kind: "signOut",
    run: async () => {
      // The session cookie is cleared even when the answer is lost; the reload then shows the sign-in page.
      await logout().catch(() => {});
      reload();
    },
  };
}
