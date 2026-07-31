/**
 * Comment persistence. This is the seam: the app talks only to `CommentStore`,
 * so a production DB (Supabase/Postgres) can replace the dev JSON-file store with
 * no changes to the API routes or UI.
 *
 * Dev store: a JSON file under data/. Works locally and persists across restarts,
 * but serverless hosts have a read-only filesystem — swap in a DB before deploying.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Comment, VoteDir } from "./types";

export interface CommentStore {
  list(mint: string): Promise<Comment[]>;
  add(input: {
    mint: string;
    parentId: string | null;
    author: string;
    body: string;
  }): Promise<Comment>;
  vote(id: string, voterId: string, dir: VoteDir): Promise<{ up: number; down: number } | null>;
}

interface DbShape {
  comments: Comment[];
  /** Vote per `${commentId}:${voterId}` → direction. */
  votes: Record<string, VoteDir>;
}

const FILE = join(process.cwd(), "data", "comments.json");

async function read(): Promise<DbShape> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const db = JSON.parse(raw) as Partial<DbShape>;
    return { comments: db.comments ?? [], votes: db.votes ?? {} };
  } catch {
    return { comments: [], votes: {} };
  }
}

async function write(db: DbShape): Promise<void> {
  await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2));
}

class FileCommentStore implements CommentStore {
  async list(mint: string): Promise<Comment[]> {
    const db = await read();
    return db.comments.filter((c) => c.mint === mint);
  }

  async add(input: {
    mint: string;
    parentId: string | null;
    author: string;
    body: string;
  }): Promise<Comment> {
    const db = await read();
    const comment: Comment = {
      id: randomUUID(),
      mint: input.mint,
      parentId: input.parentId,
      author: input.author.slice(0, 40) || "anon",
      body: input.body.slice(0, 2000),
      up: 0,
      down: 0,
      createdAt: Date.now(),
    };
    db.comments.push(comment);
    await write(db);
    return comment;
  }

  async vote(
    id: string,
    voterId: string,
    dir: VoteDir
  ): Promise<{ up: number; down: number } | null> {
    const db = await read();
    const comment = db.comments.find((c) => c.id === id);
    if (!comment) return null;

    const key = `${id}:${voterId}`;
    const prev = db.votes[key];

    if (prev === dir) {
      // Toggle the same vote off.
      if (dir === "up") comment.up = Math.max(0, comment.up - 1);
      else comment.down = Math.max(0, comment.down - 1);
      delete db.votes[key];
    } else {
      if (prev === "up") comment.up = Math.max(0, comment.up - 1);
      if (prev === "down") comment.down = Math.max(0, comment.down - 1);
      if (dir === "up") comment.up += 1;
      else comment.down += 1;
      db.votes[key] = dir;
    }

    await write(db);
    return { up: comment.up, down: comment.down };
  }
}

export const commentStore: CommentStore = new FileCommentStore();
