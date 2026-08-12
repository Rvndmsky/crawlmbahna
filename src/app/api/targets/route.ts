import { NextRequest, NextResponse } from "next/server";
import { readTargets, writeTargets, addTarget, removeTarget } from "@/lib/targets";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(req: NextRequest) {
  return validateToken(req.cookies.get(COOKIE)?.value);
}

// GET  /api/targets            -> daftar nama target
// POST /api/targets {name,note}       -> tambah satu
// POST /api/targets {names:"a\nb"}    -> tambah banyak (pisah baris/koma)
// POST /api/targets {list:[...]}      -> ganti seluruh daftar
// DELETE /api/targets?name=...        -> hapus satu
export async function GET(req: NextRequest) {
  if (!guard(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ targets: readTargets() });
}

export async function POST(req: NextRequest) {
  if (!guard(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();

    if (Array.isArray(body?.list)) {
      return NextResponse.json({ targets: writeTargets(body.list) });
    }

    if (typeof body?.names === "string" && body.names.trim()) {
      // Tempel banyak nama sekaligus (pisah baris / koma / titik koma).
      const names = body.names
        .split(/[,;\n]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      let targets = readTargets();
      for (const n of names) targets = addTarget(n);
      return NextResponse.json({ targets });
    }

    const name = String(body?.name || "").trim();
    if (!name)
      return NextResponse.json({ error: "nama kosong" }, { status: 400 });
    return NextResponse.json({
      targets: addTarget(name, String(body?.note || "")),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "gagal menyimpan" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!guard(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name") || "";
  if (!name.trim())
    return NextResponse.json({ error: "nama kosong" }, { status: 400 });
  return NextResponse.json({ targets: removeTarget(name) });
}
