// Links open the app by either scheme: arkobot:// is the product's, openmausbot:// the one phones, QR codes and pages
// already made keep using. The handlers read the latter, so a link is rewritten to it as it arrives.

/** Both registered with the system, the product's first. */
export const DEEP_LINK_SCHEMES = ["arkobot", "openmausbot"];
const ALIAS = /^arkobot:/i;
const CANONICAL = "openmausbot:";

export function canonicalDeepLink(value) {
  return typeof value === "string" && ALIAS.test(value) ? CANONICAL + value.slice("arkobot:".length) : value;
}

/** Rewrites a command line's links in place (relaunch reuses process.argv), and returns it. */
export function canonicalizeArgv(argv) {
  for (let index = 0; index < argv.length; index++) argv[index] = canonicalDeepLink(argv[index]);
  return argv;
}
