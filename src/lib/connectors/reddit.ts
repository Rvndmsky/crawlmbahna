import type { NewsItem } from "../types";

// Reddit search via application-only OAuth (read-only).
// Bikin app "script" di https://www.reddit.com/prefs/apps -> client_id + secret.
// Skip otomatis kalau REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET belum di-set.

const UA = "mbahna-osint/0.1 (by /u/anonymous)";
let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    console.error("reddit token:", res.status, await res.text());
    return null;
  }
  const json: any = await res.json();
  cachedToken = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

export async function searchReddit(query: string): Promise<NewsItem[]> {
  try {
    const token = await getToken();
    if (!token) return [];

    const url =
      `https://oauth.reddit.com/search?limit=10&sort=new&type=link&t=week` +
      `&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
    });
    if (!res.ok) {
      console.error("reddit search:", res.status, await res.text());
      return [];
    }
    const json: any = await res.json();
    const children = json?.data?.children || [];
    return children
      .map((c: any) => c.data)
      .filter((d: any) => d && d.title)
      .map((d: any): NewsItem => {
        const external = d.url && !d.url.includes("reddit.com") ? d.url : null;
        return {
          title: d.title,
          url: external || `https://www.reddit.com${d.permalink}`,
          source: `r/${d.subreddit}`,
          platform: "reddit",
          published: d.created_utc
            ? new Date(d.created_utc * 1000).toISOString()
            : "",
          snippet: (d.selftext || "").slice(0, 300),
          summary: (d.selftext || d.title || "").slice(0, 300),
          sentiment: "neutral",
          sentiment_score: 0,
        };
      });
  } catch (e) {
    console.error("reddit connector error:", e);
    return [];
  }
}
