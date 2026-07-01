export type NewsItem = {
  title: string;
  url: string;
  source: string;
  platform: string; // news | x | facebook | instagram | tiktok | youtube | telegram | reddit | web
  published: string;
  snippet: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  sentiment_score: number;
  breaking: boolean;
};

// Bungkus promise konektor dengan timeout supaya satu sumber lambat/gagal
// tidak menahan seluruh pencarian.
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
