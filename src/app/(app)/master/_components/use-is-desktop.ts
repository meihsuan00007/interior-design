"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)"; // Tailwind md

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/** 桌機（md 以上）為 true；伺服器端渲染時預設為 true。 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
