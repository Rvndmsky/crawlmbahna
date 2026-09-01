import { readSettings } from "./config";

// Pembuat ilustrasi lewat model gambar (OpenRouter).
//
// Dipakai HANYA untuk ilustrasi header infografis — tidak pernah untuk teks,
// angka, atau label. Model gambar menulis huruf dengan cara menggambar
// bentuknya, jadi angka bisa meleset; itu sebabnya semua teks tetap dirakit
// sebagai SVG dan prompt di bawah melarang tulisan muncul di gambar.

const MODEL_BAWAAN = "google/gemini-3.1-flash-image";

export function modelGambar(): string {
  return process.env.AI_IMAGE_MODEL || MODEL_BAWAAN;
}

export function ilustrasiAktif(): boolean {
  return process.env.INFOGRAFIS_ILUSTRASI !== "false";
}

// Kembalikan base64 gambar (tanpa awalan data:), atau "" bila gagal.
// Kegagalan tidak boleh menggagalkan infografis — cukup tanpa ilustrasi.
export async function buatIlustrasi(prompt: string): Promise<string> {
  if (!ilustrasiAktif()) return "";
  const s = readSettings();
  if (!s.apiKey || s.provider !== "openai") return "";

  const base = s.baseURL.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pejatenkeren.vercel.app",
        "X-Title": "mbahna",
      },
      body: JSON.stringify({
        model: modelGambar(),
        modalities: ["image", "text"],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("ilustrasi gagal:", res.status, (await res.text()).slice(0, 200));
      return "";
    }

    const json: any = await res.json();
    const gambar = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url || "";
    const m = String(gambar).match(/^data:image\/[a-z+]+;base64,(.+)$/i);
    if (!m) return "";

    // Batas ukuran: gambar ikut tersimpan di dalam SVG, dan satu permintaan
    // tulis ke Upstash dibatasi ~1 MB.
    return m[1].length > 700000 ? "" : m[1];
  } catch (e: any) {
    console.error("ilustrasi error:", e?.message);
    return "";
  }
}

// Susun perintah gambar dari isi infografis. Sengaja meminta ilustrasi editorial
// tanpa teks: yang boleh membawa makna verbal hanya lapisan SVG.
export function promptIlustrasi(judul: string, kategori: string, ringkasan: string): string {
  return [
    "Intelligence briefing header illustration, wide banner composition.",
    `Topic: ${judul}. Category: ${kategori}. Context: ${ringkasan}`,
    "Style: flat vector / corporate intelligence briefing aesthetic — the visual language of an",
    "executive briefing deck or command-center wall display. Clean geometric shapes, precise",
    "linework, restrained iconography (map outlines, node-link network motifs, timeline rails,",
    "document and location glyphs) rendered as abstract shapes.",
    "Palette: deep blue (#2a78d6), warm orange (#eb6834), teal (#1baf7a) on off-white (#fcfcfb).",
    "Composition: formal, precise, uncluttered, generous negative space, grid-aligned,",
    "readable at a glance, suitable as a header band above dense text.",
    "ABSOLUTELY NO TEXT of any kind: no letters, no numbers, no words, no captions, no labels,",
    "no logos, no watermarks, no fake writing. Typography is handled separately.",
    "No photorealism, no faces of identifiable real people, no gore, no violence, no weapons",
    "pointed at people, no political party symbols or national emblems.",
  ].join(" ");
}
