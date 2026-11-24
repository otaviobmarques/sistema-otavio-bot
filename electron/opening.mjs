// The ArkoBot opening video, once per launch of the desktop app: the first page of the window that asks plays it, a
// reload or a switch to another server does not.

/** An installed app plays it; a development run only with OMB_OPENING=1. Smoke tests and OMB_OPENING=0 never do. */
export function openingAllowed(env = process.env, packaged = false) {
  if (env.OMB_SMOKE_TEST === "1" || env.OMB_OPENING === "0") return false;
  return packaged || env.OMB_OPENING === "1";
}

/** `choice()`: the person's Settings choice, `{ on, sound }`. `allowed()`: openingAllowed for this process. */
export function createOpening({ choice, allowed }) {
  let claimed = false;
  return {
    /** Plays for the first page that asks in this launch, while the person keeps it on; with sound while they keep that. */
    claim() {
      const first = !claimed;
      claimed = true;
      const { on, sound } = choice();
      const play = first && on && allowed();
      return { play, sound: play && sound };
    },
  };
}
