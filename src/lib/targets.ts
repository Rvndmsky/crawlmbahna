import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Daftar NAMA TARGET pemantauan sosial media, disimpan di data/targets.json.
// Di serverless (Vercel) filesystem project read-only -> /tmp (ephemeral); untuk
// daftar tetap di Vercel isi ENV TARGET_NAMES="Nama A, Nama B, Nama C".

export type Target = {
  name: string;
  note: string; // keterangan bebas (jabatan/organisasi/alasan pantau)
  addedAt: number;
};

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mbahna-data")
  : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "targets.json");

export function normName(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

function envTargets(): Target[] {
  const raw = process.env.TARGET_NAMES || "";
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, note: "", addedAt: 0 }));
}

function dedupe(list: Target[]): Target[] {
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const t of list) {
    const name = String(t?.name || "").trim();
    if (!name) continue;
    const k = normName(name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      name,
      note: String(t?.note || ""),
      addedAt: Number(t?.addedAt) || Date.now(),
    });
  }
  return out;
}

export function readTargets(): Target[] {
  try {
    if (fs.existsSync(FILE)) {
      const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
      if (Array.isArray(saved)) return dedupe(saved);
    }
  } catch {
    /* fallback ke ENV */
  }
  return dedupe(envTargets());
}

export function writeTargets(list: Target[]): Target[] {
  const next = dedupe(list);
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* serverless read-only: tidak persist. Pakai ENV TARGET_NAMES. */
  }
  return next;
}

export function addTarget(name: string, note = ""): Target[] {
  const n = name.trim();
  if (!n) return readTargets();
  const list = readTargets();
  const k = normName(n);
  const idx = list.findIndex((t) => normName(t.name) === k);
  if (idx >= 0) {
    // Nama sudah ada -> perbarui catatannya saja.
    list[idx] = { ...list[idx], note: note || list[idx].note };
    return writeTargets(list);
  }
  return writeTargets([{ name: n, note, addedAt: Date.now() }, ...list]);
}

export function removeTarget(name: string): Target[] {
  const k = normName(name);
  return writeTargets(readTargets().filter((t) => normName(t.name) !== k));
}
