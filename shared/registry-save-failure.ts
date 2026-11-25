import { PRODUCT_NAME } from "./product-name.ts";
const HELD_OR_READ_ONLY = new Set(["EPERM", "EACCES", "EBUSY", "EROFS"]);

export type RegistryFile = "bots.json" | "groups.json";

export function registrySaveFailure(action: string, file: RegistryFile, code: unknown): string {
  const reason = typeof code === "string" && HELD_OR_READ_ONLY.has(code)
    ? `another program is holding ${PRODUCT_NAME}'s ${file}, or its folder is read-only`
    : `${PRODUCT_NAME} couldn't write ${file}`;
  return `Couldn't save ${action}: ${reason}.`;
}
