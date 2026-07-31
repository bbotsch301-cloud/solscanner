import { NextRequest, NextResponse } from "next/server";
import { commentStore } from "@/lib/comments/store";

/** GET /api/comments?mint=...  → all comments for a token (client threads + sorts). */
export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get("mint")?.trim();
  if (!mint) {
    return NextResponse.json({ error: "mint is required" }, { status: 400 });
  }
  const comments = await commentStore.list(mint);
  return NextResponse.json({ comments });
}

/** POST /api/comments  { mint, parentId, author, body } → creates a comment. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      mint?: string;
      parentId?: string | null;
      author?: string;
      body?: string;
    };
    const mint = body.mint?.trim();
    const text = body.body?.trim();
    if (!mint) return NextResponse.json({ error: "mint is required" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "comment is empty" }, { status: 400 });
    if (text.length > 2000) {
      return NextResponse.json({ error: "comment too long" }, { status: 400 });
    }

    const comment = await commentStore.add({
      mint,
      parentId: body.parentId ?? null,
      author: (body.author ?? "anon").trim(),
      body: text,
    });
    return NextResponse.json({ comment });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
