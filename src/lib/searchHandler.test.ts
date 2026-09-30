// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Limiter } from "./rateLimit";
import { MAX_QUERY_LENGTH } from "./limits";
import { handleSearch } from "./searchHandler";

// Stand-in for Upstash: a fixed window of 10 per visitor.
function fakeLimiter(): Limiter {
  const counts = new Map<string, number>();
  return async (visitorId) => {
    const count = (counts.get(visitorId) ?? 0) + 1;
    counts.set(visitorId, count);
    return { success: count <= 10, reset: Date.now() + 42_000 };
  };
}

function request(query: string, ip = "1.2.3.4") {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(query)}`, {
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

test("the 11th search in a minute from one IP gets a friendly 429", async () => {
  let searches = 0;
  const deps = {
    limiter: fakeLimiter(),
    search: async () => {
      searches++;
      return [];
    },
    production: true,
  };
  for (let i = 0; i < 10; i++) {
    assert.equal((await handleSearch(request("Notion"), deps)).status, 200);
  }
  const limited = await handleSearch(request("Notion"), deps);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "42");
  assert.deepEqual(await limited.json(), { error: "We're busy right now. Try again in a minute." });
  assert.equal(searches, 10); // the limited request never reached GitHub

  // A different visitor isn't affected.
  assert.equal((await handleSearch(request("Notion", "5.6.7.8"), deps)).status, 200);
});

test("queries over 100 characters are refused before anything else runs", async () => {
  let called = false;
  const deps = {
    limiter: async () => {
      called = true;
      return { success: true, reset: 0 };
    },
    search: async () => {
      called = true;
      return [];
    },
    production: true,
  };
  const tooLong = await handleSearch(request("a".repeat(MAX_QUERY_LENGTH + 1)), deps);
  assert.equal(tooLong.status, 400);
  assert.equal(called, false);
  assert.equal((await handleSearch(request("a".repeat(MAX_QUERY_LENGTH)), deps)).status, 200);
  assert.equal((await handleSearch(request("   "), deps)).status, 400);
});

test("production without a limiter refuses to search", async () => {
  const response = await handleSearch(request("Notion"), {
    limiter: null,
    search: async () => [],
    production: true,
  });
  assert.equal(response.status, 503);
});

test("development without a limiter still works", async () => {
  const response = await handleSearch(request("Notion"), {
    limiter: null,
    search: async () => [],
    production: false,
  });
  assert.equal(response.status, 200);
});

test("a broken limiter (e.g. wrong token) refuses rather than running unlimited", async () => {
  const response = await handleSearch(request("Notion"), {
    limiter: async () => {
      throw new Error("WRONGPASS");
    },
    search: async () => [],
    production: true,
  });
  assert.equal(response.status, 503);
});
