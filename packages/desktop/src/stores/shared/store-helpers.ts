/**
 * Immutable Set helpers for Zustand state updates.
 */
export function addToSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  next.add(item);
  return next;
}

export function removeFromSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  next.delete(item);
  return next;
}

/**
 * Prepend an item to an array and cap at max length.
 */
export function prependCapped<T>(arr: T[], item: T, max: number): T[] {
  return [item, ...arr].slice(0, max);
}
