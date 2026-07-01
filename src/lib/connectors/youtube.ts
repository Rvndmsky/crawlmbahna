import type { NewsItem } from "../types";

// YouTube Data API v3 — search video by keyword, urut terbaru.
// Key gratis dari Google Cloud Console (aktifkan "YouTube Data API v3").
// Skip otomatis kalau YOUTUBE_API_KEY belum di-set.

export async function searchYouTube(query: string): Promise<NewsItem[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  // 7 hari terakhir biar aktual
  const after = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video` +
    `&order=date&maxResults=10&relevanceLanguage=id&publishedAfter=${encodeURIComponent(after)}` +
    `&q=${encodeURIComponent(query)}&key=${key}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("youtube api:", res.status, await res.text());
      return [];
    }
    const json: any = await res.json();
    const items = Array.isArray(json.items) ? json.items : [];
    return items
      .filter((it: any) => it?.id?.videoId)
      .map((it: any): NewsItem => {
        const s = it.snippet || {};
        return {
          title: s.title || "",
          url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
          source: s.channelTitle || "YouTube",
          platform: "youtube",
          published: s.publishedAt || "",
          snippet: s.description || "",
          summary: s.description || "",
          sentiment: "neutral",
          sentiment_score: 0,
        };
      });
  } catch (e) {
    console.error("youtube connector error:", e);
    return [];
  }
}
