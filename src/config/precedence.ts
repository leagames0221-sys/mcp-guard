// Config-layer merge: CLI flags > env > config file > built-in defaults.
// Each layer contributes a partial shape; the merger returns a
// deep-merged partial that is then parsed (and defaulted) by zod.

import type { PartialConfigInput } from './schema.js';

// Deep partial — every field optional at every nesting depth.
type DeepPartial<T> = T extends object
  ? T extends readonly unknown[]
    ? T
    : { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type ConfigLayer = DeepPartial<PartialConfigInput>;

export interface ConfigLayers {
  cli?: ConfigLayer;
  env?: ConfigLayer;
  file?: ConfigLayer;
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overlay: DeepPartial<T>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    const existing = out[key];
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);
    if (isPlainObject(value) && isPlainObject(existing)) {
      out[key] = deepMerge(existing, value as DeepPartial<typeof existing>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

// Merge in precedence-decreasing order: later layers override earlier
// only where the later layer explicitly sets a value.
export function mergeLayers(layers: ConfigLayers): ConfigLayer {
  const order: (keyof ConfigLayers)[] = ['file', 'env', 'cli'];
  let merged: ConfigLayer = {};
  for (const key of order) {
    const layer = layers[key];
    if (layer) {
      merged = deepMerge(merged as Record<string, unknown>, layer) as ConfigLayer;
    }
  }
  return merged;
}
