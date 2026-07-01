// Slug util untuk URL detail yang bersih & ter-generate.
// Contoh: makeDetailSlug("OPM Intan Jaya", "20260701") -> "opm-intan-jaya-20260701"

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function makeDetailSlug(subject: string, dateYYYYMMDD?: string): string {
  const base = slugify(subject) || "isu";
  return dateYYYYMMDD ? `${base}-${dateYYYYMMDD}` : base;
}

// Balikin subjek dari slug (buang suffix tanggal 8 digit, ganti - jadi spasi).
export function parseDetailSlug(slug: string): { subject: string; date: string } {
  const s = decodeURIComponent(slug || "");
  const m = s.match(/-(\d{8})$/);
  const date = m ? m[1] : "";
  const base = m ? s.slice(0, m.index) : s;
  const subject = base.replace(/-/g, " ").trim();
  return { subject, date };
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function todayYYYYMMDD(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
