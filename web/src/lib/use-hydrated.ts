import { useSyncExternalStore } from "react";

// Returns false during SSR and on the first client render, then true once
// hydration has committed. This is the lint-clean, setState-free way (no
// effect, no cascading render) to gate output that CANNOT match the server
// HTML — client-only portals, locale/time-dependent text, anything that would
// otherwise throw a React hydration error. `useSyncExternalStore` is built for
// exactly this: it hands back the server snapshot (false) during SSR and the
// first client render, then the client snapshot (true) afterwards.
const emptySubscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
