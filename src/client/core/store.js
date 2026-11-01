/**
 * A tiny external store. The confirmation lives here rather than in React
 * state because the menu unmounts its children as soon as it closes, and the
 * modal rendered by `shell.overlay` has to outlive that.
 */
import * as React from "react";

export function createStore(initial = null) {
  let value = initial;
  const listeners = new Set();

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const set = (next) => {
    value = next;
    for (const listener of listeners) listener();
  };

  const use = () => React.useSyncExternalStore(subscribe, () => value);

  return { get: () => value, set, subscribe, use };
}
