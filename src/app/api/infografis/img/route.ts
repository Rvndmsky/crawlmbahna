import { NextRequest, NextResponse } from "next/server";
import { ambilSvg } from "@/lib/infostore";
import { validateToken, COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sajikan gambar infografis (SVG) berdasarkan id.
export async function GET(req: NextRequest) {
  if (!validateToken(req.cookies.get(COOKIE)?.value)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[a-z0-9]{6,40}$/i.test(id)) {
    return new NextResponse("id tidak sah", { status: 400 });
  }

  const svg = await ambilSvg(id);
  if (!svg) return new NextResponse("tidak ada", { status: 404 });

  // ?format=png -> dirasterkan di server. Berguna untuk ditempel ke dokumen
  // atau aplikasi yang tidak bisa membaca SVG.
  if ((req.nextUrl.searchParams.get("format") || "").toLowerCase() === "png") {
    try {
      const sharp = (await import("sharp")).default;
      // Lebar dipatok 1080; tingginya mengikuti SVG supaya isi tidak terjepit.
      const png = await sharp(Buffer.from(svg), { density: 144 })
        .resize({ width: 1080 })
        .png({ compressionLevel: 9 })
        .toBuffer();
      return new NextResponse(new Uint8Array(png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="infografis-${id}.png"`,
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch (e: any) {
      console.error("raster png gagal:", e?.message);
      return new NextResponse("gagal membuat PNG", { status: 500 });
    }
  }

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
