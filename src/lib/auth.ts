import crypto from "node:crypto";

// Auth stateless (JWT-style HMAC) — TIDAK pakai filesystem, jadi jalan di
// serverless (Vercel) yang read-only. Token ditandatangani secret server;
// tidak bisa dipalsu tanpa secret. Logout menghapus cookie di sisi klien.
//
// Catatan: karena stateless, "single active session" ketat butuh store (DB/KV).
// Di sini token berlaku sampai expired (12 jam) atau cookie dihapus (logout).

export const COOKIE = "mbahna_session";
const TTL_SEC = 12 * 60 * 60;

const EMAIL = process.env.AUTH_EMAIL || "pejaten@mbahrazu.com";
const PASSWORD = process.env.AUTH_PASSWORD || "pejatenkeren";
// WAJIB set AUTH_SECRET di production untuk keamanan.
const SECRET = process.env.AUTH_SECRET || `mbahna::${EMAIL}::${PASSWORD}::v1`;

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function sign(data: string): string {
  return b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
}
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyCredentials(email: string, password: string): boolean {
  const okEmail = safeEqual(String(email || "").toLowerCase(), EMAIL.toLowerCase());
  const okPass = safeEqual(String(password || ""), PASSWORD);
  return okEmail && okPass;
}

// Buat token bertanda-tangan (payload.signature).
export function createSession(): string {
  const payloadObj = {
    exp: Math.floor(Date.now() / 1000) + TTL_SEC,
    r: crypto.randomBytes(8).toString("hex"),
  };
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj)));
  return `${payload}.${sign(payload)}`;
}

export function validateToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(payload))) return false;
  try {
    const p = JSON.parse(b64urlDecode(payload).toString("utf8"));
    return typeof p.exp === "number" && p.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// Identitas pengguna yang sedang login. Akun tunggal, jadi diambil dari ENV.
// Nama tampil = bagian sebelum @ pada email, huruf depan dibesarkan.
export function sessionUser(): { email: string; nama: string } {
  const nama = EMAIL.split("@")[0].replace(/[._-]+/g, " ").trim();
  return {
    email: EMAIL,
    nama: nama.charAt(0).toUpperCase() + nama.slice(1),
  };
}

// Stateless: logout cukup hapus cookie (dilakukan di route).
export function destroySession() {}
