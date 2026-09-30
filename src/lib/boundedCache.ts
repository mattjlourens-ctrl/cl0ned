// A Map that keeps at most `maxSize` entries. When full, it drops the entry used least recently,
// so memory can't keep growing on a long-running server.
export class BoundedCache<V> {
  private entries = new Map<string, V>();

  constructor(private maxSize: number) {}

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      // Move to the end: a Map remembers insertion order, so the first key is the least recent.
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
