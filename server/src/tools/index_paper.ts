// server/src/tools/index_paper.ts
import { db } from "../db";
export async function index_paper({ paperId }: { paperId: string }) {
  const rows = db.prepare("SELECT id, title, page_start, page_end FROM sections WHERE paper_id=? ORDER BY page_start ASC")
    .all(paperId);
  return { sections: rows };
}
