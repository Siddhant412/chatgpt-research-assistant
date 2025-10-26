import { randomUUID } from "node:crypto";
import { db } from "../db";

export async function save_note({ paperId, title, summary }:
  { paperId: string; title: string; summary: string }) {
  db.prepare("INSERT INTO notes (id, paper_id, title, body, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
    .run(randomUUID(), paperId, title, summary);
  return { ok: true };
}
