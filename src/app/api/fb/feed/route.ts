import { NextRequest, NextResponse } from "next/server";
import { listFbEntries, usingRedis, type FbComment } from "@/lib/fbstore";
import { detectMovement, engagementFrom } from "@/lib/social";
import { umurHari } from "@/lib/fbtime";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Isi halaman /facebook: seluruh kiriman worker, dikelompokkan per kueri.
// Kueri di sini = apa yang disisir worker (mis. "Budi demo"), bukan nama target.
//
// Berbeda dari /api/target, bentuk data di sini mempertahankan judul, isi
// penuh, dan komentar — bukan diringkas jadi SocialPost.

// Komentar dianggap "memicu isu" bila banyak disukai ATAU isinya menyerukan
// gerakan. Ambang like sengaja rendah karena skala tiap post berbeda jauh.
const HOT_LIKES = 30;

function mapComment(c: FbComment) {
  const movement = detectMovement(c.text);
  return {
    ...c,
    movement,
    triggers: movement !== "none" || c.likes >= HOT_LIKES,
  };
}

export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Kesegaran: hanya post dalam rentang H-3 (post lama dari kiriman terdahulu
  // ikut tersaring di sini, bukan cuma saat masuk).
  const MAX_AGE_DAYS = Number(process.env.FB_MAX_AGE_DAYS) || 3;

  const entries = (await listFbEntries()).map((e) => ({
    query: e.query,
    collectedAt: e.collectedAt,
    posts: e.posts
      .filter((p) => !p.publishedAt || umurHari(p.publishedAt) <= MAX_AGE_DAYS)
      .map((p) => {
      const comments = (p.comments || []).map(mapComment);
      return {
        url: p.url,
        account: p.account,
        accountUrl: p.accountUrl,
        published: p.published,
        publishedAt: p.publishedAt || 0,
        shotId: p.shotId || "",
        title: p.title || "",
        content: p.content,
        engagement: engagementFrom(p.engagementText),
        engagementText: p.engagementText,
        movement: detectMovement(`${p.content} ${p.title}`),
        comments,
        hotComments: comments.filter((c) => c.triggers).length,
      };
    }),
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
      comments: all.reduce((s, p) => s + p.comments.length, 0),
      hotComments: all.reduce((s, p) => s + p.hotComments, 0),
      byMovement,
      lastCollectedAt: entries.reduce(
        (m, e) => Math.max(m, e.collectedAt || 0),
        0
      ),
    },
    maxAgeDays: MAX_AGE_DAYS,
    workerConfigured: !!process.env.FB_WORKER_TOKEN,
    storage: usingRedis ? "redis" : "file",
  });
}
