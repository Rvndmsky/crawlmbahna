import type { NewsItem } from "../types";

// Telegram global search via MTProto user client (GramJS).
// api_id/api_hash dari https://my.telegram.org, session dari `npm run tg-login`.
// Skip otomatis kalau TG_API_ID / TG_API_HASH / TG_SESSION belum di-set.
//
// Import GramJS secara dinamis supaya paket berat ini hanya dimuat saat dipakai.

export async function searchTelegram(query: string): Promise<NewsItem[]> {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  const session = process.env.TG_SESSION;
  if (!apiId || !apiHash || !session) return [];

  try {
    const { TelegramClient, Api } = await import("telegram");
    const { StringSession } = await import("telegram/sessions/index.js");

    const client = new TelegramClient(
      new StringSession(session),
      apiId,
      apiHash,
      { connectionRetries: 2, baseLogger: undefined as any }
    );
    await client.connect();

    const res: any = await client.invoke(
      new Api.messages.SearchGlobal({
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
        limit: 20,
      })
    );

    // Peta channelId -> {username, title}
    const chans = new Map<string, { username?: string; title: string }>();
    for (const c of res.chats || []) {
      if (c.id != null) {
        chans.set(String(c.id), {
          username: c.username,
          title: c.title || "Telegram",
        });
      }
    }

    const out: NewsItem[] = [];
    for (const m of res.messages || []) {
      const text: string = m.message || "";
      if (!text.trim()) continue;
      const channelId = m.peerId?.channelId
        ? String(m.peerId.channelId)
        : null;
      const chan = channelId ? chans.get(channelId) : undefined;
      if (!chan?.username) continue; // hanya channel publik yang bisa dilink
      out.push({
        title: text.slice(0, 90) + (text.length > 90 ? "…" : ""),
        url: `https://t.me/${chan.username}/${m.id}`,
        source: `@${chan.username}`,
        platform: "telegram",
        published: m.date ? new Date(m.date * 1000).toISOString() : "",
        snippet: text.slice(0, 300),
        summary: text.slice(0, 300),
        sentiment: "neutral",
        sentiment_score: 0,
      });
    }

    await client.disconnect();
    return out;
  } catch (e) {
    console.error("telegram connector error:", e);
    return [];
  }
}
