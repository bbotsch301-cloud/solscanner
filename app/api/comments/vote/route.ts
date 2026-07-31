import { NextRequest, NextResponse } from "next/server";
import { commentStore } from "@/lib/comments/store";

/** POST /api/comments/vote  { id, voterId, dir:'up'|'down' } → updated counts. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      voterId?: string;
      dir?: "up" | "down";
    };
    if (!body.id || !body.voterId || (body.dir !== "up" && body.dir !== "down")) {
      return NextResponse.json({ error: "id, voterId, dir required" }, { status: 400 });
    }
    const result = await commentStore.vote(body.id, body.voterId, body.dir);
    if (!result) return NextResponse.json({ error: "comment not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
