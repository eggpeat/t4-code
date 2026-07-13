export class ImmutableMap<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>;
  constructor(entries?: Iterable<readonly [K, V]>) { this.#map = new Map(entries); }
  get size(): number { return this.#map.size; }
  get(key: K): V | undefined { return this.#map.get(key); }
  has(key: K): boolean { return this.#map.has(key); }
  entries(): MapIterator<[K, V]> { return this.#map.entries(); }
  keys(): MapIterator<K> { return this.#map.keys(); }
  values(): MapIterator<V> { return this.#map.values(); }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void { this.#map.forEach((value, key) => callbackfn.call(thisArg, value, key, this)); }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#map[Symbol.iterator](); }
}
