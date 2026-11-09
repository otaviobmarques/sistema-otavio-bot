import type { Notification } from "../shared/notification.ts";

const taps = new Set<(notification: Notification) => void>();

/** Hears every notification the feed records, after it is recorded; a tap that throws never stops the feed. */
export function tapNotifications(tap: (notification: Notification) => void): () => void {
  taps.add(tap);
  return () => taps.delete(tap);
}

export function notifyTaps(notification: Notification): void {
  for (const tap of taps) {
    try {
      tap(notification);
    } catch (error) {
      console.warn(`[notify] a notification tap failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
