// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { BoundedCache } from "./boundedCache";

test("never holds more than maxSize entries, and drops the least recently used", () => {
  const cache = new BoundedCache<number>(3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.get("a"); // "a" is now the most recently used
  cache.set("d", 4);
  assert.equal(cache.size, 3);
  assert.equal(cache.get("b"), undefined); // dropped
  assert.equal(cache.get("a"), 1);
  for (let i = 0; i < 1000; i++) cache.set(`key${i}`, i);
  assert.equal(cache.size, 3);
});
