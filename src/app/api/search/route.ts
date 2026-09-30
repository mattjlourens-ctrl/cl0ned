import { searchRepos } from "@/lib/github";
import { upstashLimiter } from "@/lib/rateLimit";
import { handleSearch } from "@/lib/searchHandler";

const limiter = upstashLimiter();

// GET /api/search?q=Photoshop
export async function GET(request: Request) {
  return handleSearch(request, {
    limiter,
    search: searchRepos,
    production: process.env.NODE_ENV === "production",
  });
}
