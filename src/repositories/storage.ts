// Generic persistence primitive. Today: localStorage. Tomorrow: swap the internals for API calls —
// repositories/services keep the same surface, so UI code does not change.

const PREFIX = "movex.v1.";
const listeners = new Map<string, Set<() => void>>();

const hasStorage = () => {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
};

export function readJson<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("localStorage write failed", e);
  }
  listeners.get(key)?.forEach((l) => l());
}

export function subscribeKey(key: string, cb: () => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(cb);
  return () => set.delete(cb);
}

/** Clears every MoveX key so seeds are re-created on next access. */
export function resetAllStorage() {
  if (!hasStorage()) return;
  Object.keys(window.localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => window.localStorage.removeItem(k));
  listeners.forEach((set) => set.forEach((l) => l()));
}

export interface Collection<T extends { id: string }> {
  readonly key: string;
  /** Stable reference until the collection changes (safe for useSyncExternalStore). */
  all(): T[];
  get(id: string): T | undefined;
  insert(rec: T): T;
  insertMany(recs: T[]): void;
  update(id: string, fn: (prev: T) => T): T;
  subscribe(cb: () => void): () => void;
}

export function createCollection<T extends { id: string }>(
  key: string,
  seed: () => T[],
): Collection<T> {
  // The collection is the only writer of its key, so the cache is updated *before* listeners run
  // (listeners call all() synchronously and must see a stable, non-null snapshot).
  let cache: T[] | null = null;

  const load = (): T[] => {
    if (cache) return cache;
    const stored = readJson<T[] | null>(key, null);
    if (stored) {
      cache = stored;
      return stored;
    }
    const rows = seed();
    cache = rows;
    writeJson(key, rows);
    return rows;
  };
  const save = (rows: T[]) => {
    cache = rows;
    writeJson(key, rows);
  };

  return {
    key,
    all: load,
    get: (id) => load().find((r) => r.id === id),
    insert(rec) {
      if (load().some((r) => r.id === rec.id)) throw new Error(`Duplicate id ${rec.id}`);
      save([...load(), rec]);
      return rec;
    },
    insertMany(recs) {
      save([...load(), ...recs]);
    },
    update(id, fn) {
      const rows = load();
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error(`Record ${id} not found`);
      const next = fn(rows[idx]!);
      save(rows.map((r, i) => (i === idx ? next : r)));
      return next;
    },
    subscribe: (cb) => subscribeKey(key, cb),
  };
}

export const uid = (prefix = "") =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
