import { createContext, useContext } from "react";
import type { InstanceInfo } from "./store";

/** The store's engine list on its own, so an avatar redraws when an engine changes but not on every message. */
export const InstancesContext = createContext<readonly InstanceInfo[]>([]);

export function useInstances(): readonly InstanceInfo[] {
  return useContext(InstancesContext);
}
