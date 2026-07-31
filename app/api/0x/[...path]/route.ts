import { NextRequest, NextResponse } from "next/server";

// Always run per-request (quotes are live); never statically cache.
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for the 0x Swap API. The mobile app calls
 * `${EXPO_PUBLIC_ZEROX_PROXY}/swap/allowance-holder/quote?...`; this route forwards to
 * api.0x.org with the API key injected here, so the key never ships in the app.
 *
 * Only `swap/*` paths are forwarded — this is a scoped proxy, not an open relay.
 * Set ZEROX_API_KEY (server-side only) in the environment; get one free at
 * https://dashboard.0x.org.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const sub = path.join("/");
  if (!sub.startsWith("swap/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = process.env.ZEROX_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "0x proxy is not configured (set ZEROX_API_KEY)." },
      { status: 500 }
    );
  }

  const url = `https://api.0x.org/${sub}${req.nextUrl.search}`;
  try {
    const res = await fetch(url, {
      headers: { "0x-api-key": key, "0x-version": "v2" },
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Upstream 0x request failed." }, { status: 502 });
  }
}
