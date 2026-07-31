export interface Comment {
  id: string;
  mint: string;
  parentId: string | null;
  author: string;
  body: string;
  up: number;
  down: number;
  createdAt: number;
}

/** A comment with its computed score and nested replies (for the UI). */
export interface CommentNode extends Comment {
  score: number;
  replies: CommentNode[];
}

export type VoteDir = "up" | "down";
