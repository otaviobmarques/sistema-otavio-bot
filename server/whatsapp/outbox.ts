// Messages to the owner go out one at a time, a few seconds apart and a bounded number an hour: a linked account that
// bursts reads as spam to WhatsApp, which is how numbers get banned.

export interface OutboxLimits {
  /** The least time between two messages. */
  gapMs: number;
  /** At most this many messages in any hour; more wait their turn. */
  perHour: number;
}

export const OUTBOX_LIMITS: OutboxLimits = { gapMs: 4_000, perHour: 30 };
const HOUR_MS = 60 * 60_000;

interface Clock {
  now(): number;
  later(run: () => void, ms: number): void;
}

const realClock: Clock = {
  now: () => Date.now(),
  later: (run, ms) => { setTimeout(run, ms).unref?.(); },
};

export function createOutbox(deliver: (text: string) => Promise<string | null>, limits: OutboxLimits = OUTBOX_LIMITS, clock: Clock = realClock) {
  const queue: Array<{ text: string; done: (id: string | null) => void }> = [];
  const sentAt: number[] = [];
  let pumping = false;

  const wait = (): number => {
    const now = clock.now();
    while (sentAt.length && now - sentAt[0]! >= HOUR_MS) sentAt.shift();
    const last = sentAt.at(-1);
    const gap = last === undefined ? 0 : Math.max(0, last + limits.gapMs - now);
    const hourly = sentAt.length >= limits.perHour ? sentAt[0]! + HOUR_MS - now : 0;
    return Math.max(gap, hourly);
  };

  const pump = () => {
    if (pumping) return;
    const next = queue[0];
    if (!next) return;
    const delay = wait();
    if (delay > 0) {
      pumping = true;
      clock.later(() => { pumping = false; pump(); }, delay);
      return;
    }
    queue.shift();
    pumping = true;
    sentAt.push(clock.now());
    deliver(next.text).catch(() => null).then((id) => {
      pumping = false;
      next.done(id);
      pump();
    });
  };

  return {
    /** Resolves with the sent message's id once it went out, or null when it could not. */
    send(text: string): Promise<string | null> {
      return new Promise((done) => {
        queue.push({ text, done });
        pump();
      });
    },
    /** Drops what has not gone out yet, as when the owner disconnects. */
    clear(): void {
      for (const item of queue.splice(0)) item.done(null);
    },
    get waiting(): number {
      return queue.length;
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
