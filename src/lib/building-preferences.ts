import { useSyncExternalStore } from "react";

export const BUILDING_MODE_KEY = "omb-building-mode";

/** How the Building is shown: its floors as lists of desks, or the live cut-away of the building. */
export type BuildingMode = "floors" | "live";

let sessionChoice: BuildingMode | undefined;
const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function buildingMode(): BuildingMode {
  if (sessionChoice !== undefined) return sessionChoice;
  try {
    return storage()?.getItem(BUILDING_MODE_KEY) === "live" ? "live" : "floors";
  } catch {
    return "floors";
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== BUILDING_MODE_KEY && event.key !== null) return;
  if (event.storageArea && event.storageArea !== storage()) return;
  sessionChoice = undefined;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function setBuildingMode(mode: BuildingMode): void {
  sessionChoice = mode;
  try {
    storage()?.setItem(BUILDING_MODE_KEY, mode);
  } catch {
  }
  notify();
}

export function useBuildingMode(): BuildingMode {
  return useSyncExternalStore(subscribe, buildingMode, () => "floors");
}
