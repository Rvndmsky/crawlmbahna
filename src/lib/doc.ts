// Pembaca isi berkas unggahan untuk fitur Infografis.
// Hanya PDF dan DOCX. Format lain ditolak sebelum sampai ke sini.

export type DocText = {
  text: string;
  pages: number; // jumlah halaman (PDF) — 0 bila tidak diketahui
  jenis: "pdf" | "docx";
};

export const JENIS_DIIZINKAN = [".pdf", ".docx"] as const;

export function jenisBerkas(nama: string): "pdf" | "docx" | null {
  const n = (nama || "").toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  return null;
}

function rapikan(t: string): string {
  return t
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function bacaPdf(buf: Buffer): Promise<DocText> {
  // unpdf membungkus pdf.js dalam bentuk yang aman untuk serverless.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return {
    text: rapikan(Array.isArray(text) ? text.join("\n") : text),
    pages: totalPages || 0,
    jenis: "pdf",
  };
}

async function bacaDocx(buf: Buffer): Promise<DocText> {
  const mammoth = await import("mammoth");
  const hasil = await mammoth.extractRawText({ buffer: buf });
  return { text: rapikan(hasil.value || ""), pages: 0, jenis: "docx" };
}

export async function bacaDokumen(buf: Buffer, nama: string): Promise<DocText> {
  const jenis = jenisBerkas(nama);
  if (!jenis) throw new Error("hanya berkas PDF atau DOCX yang diterima");
  return jenis === "pdf" ? bacaPdf(buf) : bacaDocx(buf);
}
