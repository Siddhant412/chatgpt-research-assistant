import { db } from "../db";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Deletes a paper and all associated data:
 * - notes
 * - sections
 * - paper row
 * - local PDF file (server/data/<paperId>.pdf)
 */
export async function delete_paper({ paperId }: { paperId: string }) {
  const found = db
    .prepare("SELECT id, title FROM papers WHERE id=?")
    .get(paperId) as { id: string; title: string } | undefined;

  if (!found) {
    return { ok: false as const, title: "", message: "Paper not found" };
  }

  const tx = db.transaction((id: string) => {
    db.prepare("DELETE FROM notes WHERE paper_id=?").run(id);
    db.prepare("DELETE FROM sections WHERE paper_id=?").run(id);
    db.prepare("DELETE FROM papers WHERE id=?").run(id);
  });
  tx(paperId);

  // best-effort: remove local PDF
  const DATA_DIR = path.resolve(__dirname, "..", "data");
  const pdfPath = path.join(DATA_DIR, `${paperId}.pdf`);
  try { await fs.unlink(pdfPath); } catch { /* ignore if missing */ }

  return { ok: true as const, title: found.title };
}
