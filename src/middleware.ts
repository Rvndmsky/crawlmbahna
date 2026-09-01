import { NextRequest, NextResponse } from "next/server";

// Presence-check ringan di edge (tanpa fs). Validasi token sebenarnya
// dilakukan di tiap API route (lib/auth.validateToken) -> tidak bisa di-bypass.
const COOKIE = "mbahna_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Endpoint auth & halaman login selalu boleh.
  if (pathname.startsWith("/api/auth") || pathname === "/login") {
    return NextResponse.next();
  }

  // Worker Facebook mengirim tanpa cookie sesi — route-nya menjaga diri sendiri
  // dengan header x-worker-token (POST) / validateToken (GET).
  if (pathname === "/api/fb/ingest" || pathname === "/api/social/akun") {
    return NextResponse.next();
  }

  // Pemeriksa sementara ENV (tidak membocorkan nilai). Hapus setelah beres.
  if (pathname === "/api/debug/env") {
    return NextResponse.next();
  }

  const hasSession = !!req.cookies.get(COOKIE)?.value;
  if (!hasSession) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
