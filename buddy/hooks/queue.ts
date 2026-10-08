// A session's queues of unsaved events by buddy seed, mood events and turn facts alike: each
// keeps its newest few until a save takes them. Pure: no $.

// Adds `items` to a queue, keeping the newest `max`.
export function queueNewest<T>(queue: readonly T[] | undefined, items: readonly T[], max: number): T[] {
  return [...(queue ?? []), ...items].slice(-max)
}

// Puts `older` back in front of anything queued since, seed by seed, keeping the newest `max` of each.
export function mergeQueues<T>(
  older: Readonly<Record<string, readonly T[]>>,
  newer: Readonly<Record<string, readonly T[]>>,
  max: number,
): Record<string, T[]> {
  const merged: Record<string, T[]> = {}
  for (const seed of new Set([...Object.keys(older), ...Object.keys(newer)])) {
    merged[seed] = queueNewest(older[seed], newer[seed] ?? [], max)
  }
  return merged
}
