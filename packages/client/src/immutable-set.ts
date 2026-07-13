export class ImmutableSet<T> implements ReadonlySet<T> {
  readonly #set: Set<T>;
  constructor(values?: Iterable<T>) { this.#set = new Set(values); }
  get size(): number { return this.#set.size; }
  has(value: T): boolean { return this.#set.has(value); }
  entries(): SetIterator<[T, T]> { return this.#set.entries(); }
  keys(): SetIterator<T> { return this.#set.keys(); }
  values(): SetIterator<T> { return this.#set.values(); }
  forEach(callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown): void { this.#set.forEach((value) => callbackfn.call(thisArg, value, value, this)); }
  union<U>(other: ReadonlySet<U>): Set<T | U> { return new Set([...this.#set, ...other]); }
  intersection<U>(other: ReadonlySet<U>): Set<T & U> { return new Set([...this.#set].filter((item) => other.has(item as unknown as U)) as T[] as (T & U)[]); }
  difference<U>(other: ReadonlySet<U>): Set<T> { return new Set([...this.#set].filter((item) => !other.has(item as unknown as U))); }
  symmetricDifference<U>(other: ReadonlySet<U>): Set<T | U> { const result = new Set<T | U>(); for (const item of this.#set) if (!other.has(item as unknown as U)) result.add(item); for (const item of other) if (!this.#set.has(item as unknown as T)) result.add(item); return result; }
  isSubsetOf<U>(other: ReadonlySet<U>): boolean { return [...this.#set].every((item) => other.has(item as unknown as U)); }
  isSupersetOf<U>(other: ReadonlySet<U>): boolean { return [...other].every((item) => this.#set.has(item as unknown as T)); }
  isDisjointFrom<U>(other: ReadonlySet<U>): boolean { return [...this.#set].every((item) => !other.has(item as unknown as U)); }
  [Symbol.iterator](): SetIterator<T> { return this.#set[Symbol.iterator](); }
}
