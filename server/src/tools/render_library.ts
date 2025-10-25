import { db } from "../db";

type PaperRow = { id: string; title: string; source_url?: string };
type NoteRow = { id: string; paper_id: string; title: string; body: string; created_at: string };

export async function render_library() {
  const papers = db
    .prepare("SELECT id, title, source_url FROM papers ORDER BY created_at DESC")
    .all() as PaperRow[];

  const stmt = db.prepare(
    "SELECT id, paper_id, title, body, created_at FROM notes WHERE paper_id=? ORDER BY created_at DESC"
  );

  const notesByPaper: Record<string, NoteRow[]> = {};
  for (const p of papers) {
    notesByPaper[p.id] = stmt.all(p.id) as NoteRow[];
  }

  return { papers, notesByPaper };
}
