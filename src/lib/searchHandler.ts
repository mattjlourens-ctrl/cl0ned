// The logic behind GET /api/search, kept out of the route file so it can be tested with a fake
// limiter and a fake search.

import { MAX_QUERY_LENGTH } from "./limits";
import { visitorIp, type Limiter } from "./rateLimit";

const BUSY_MESSAGE = "We're busy right now. Try again in a minute.";

export async function handleSearch(
  request: Request,
  deps: {
    limiter: Limiter | null;
    search: (query: string) => Promise<unknown[]>;
    production: boolean;
  },
): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query === "") {
    return Response.json({ error: "Missing search term" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { error: `Search term is too long (${MAX_QUERY_LENGTH} characters max).` },
      { status: 400 },
    );
  }

  if (deps.limiter === null) {
    // Never run a public deployment without the limit: anyone could use up the GitHub quota.
    if (deps.production) {
      console.error("Rate limiter not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
      return Response.json({ error: "Search is temporarily unavailable." }, { status: 503 });
    }
    console.warn("Rate limiter not configured; searches are unlimited in development.");
  } else {
    let allowed: { success: boolean; reset: number };
    try {
      allowed = await deps.limiter(visitorIp(request));
    } catch (error) {
      // An error here usually means a wrong URL or token. Refuse rather than silently run unlimited.
      console.error("Rate limiter failed:", error);
      return Response.json({ error: "Search is temporarily unavailable." }, { status: 503 });
    }
    if (!allowed.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((allowed.reset - Date.now()) / 1000));
      return Response.json(
        { error: BUSY_MESSAGE },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
  }

  try {
    const results = await deps.search(query);
    return Response.json({ results });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Search failed. Try again in a minute." }, { status: 502 });
  }
}
