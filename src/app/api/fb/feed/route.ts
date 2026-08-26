import { NextRequest, NextResponse } from "next/server";
import { listFbEntries } from "@/lib/fbstore";
import { fbToPost } from "@/lib/social";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Isi halaman /facebook: seluruh kiriman worker, dikelompokkan per kueri.
// Kueri di sini = apa yang disisir worker (mis. "Budi demo"), bukan nama target.
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const entries = listFbEntries().map((e) => ({
    query: e.query,
    collectedAt: e.collectedAt,
    posts: e.posts.map(fbToPost),
  }));

  const all = entries.flatMap((e) => e.posts);
  const byMovement: Record<string, number> = {};
  for (const p of all) {
    if (p.movement === "none") continue;
    byMovement[p.movement] = (byMovement[p.movement] || 0) + 1;
  }

  return NextResponse.json({
    entries,
    stats: {
      queries: entries.length,
      posts: all.length,
      withMovement: all.filter((p) => p.movement !== "none").length,
      byMovement,
      lastCollectedAt: entries.reduce(
        (m, e) => Math.max(m, e.collectedAt || 0),
        0
      ),
    },
    workerConfigured: !!process.env.FB_WORKER_TOKEN,
  });
}
