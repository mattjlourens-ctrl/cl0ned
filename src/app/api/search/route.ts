import { searchRepos } from "@/lib/github";

// GET /api/search?q=Photoshop
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query === "") {
    return Response.json({ error: "Missing search term" }, { status: 400 });
  }

  try {
    const results = await searchRepos(query);
    return Response.json({ results });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Search failed. Try again in a minute." }, { status: 502 });
  }
}
