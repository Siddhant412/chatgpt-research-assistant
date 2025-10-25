// server/src/tools/add_paper.ts
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { downloadPdf, extractPages } from "../pdf";

export async function add_paper({ url }: { url: string }) {
  const { id, file, buffer } = await downloadPdf(url);
  // naive title guess: first line of page 1
  const pages = await extractPages(buffer);
  const guessTitle = pages[0]?.split("\n")[0]?.slice(0, 200) || "Untitled paper";
  const title = guessTitle.trim();
  db.prepare("INSERT INTO papers (id, title, source_url, created_at) VALUES (?, ?, ?, datetime('now'))")
    .run(id, title, url);
  // store simple per-page sections (1..N)
  const insert = db.prepare("INSERT INTO sections (id, paper_id, title, page_start, page_end) VALUES (?, ?, ?, ?, ?)");
  pages.forEach((_, idx) => {
    insert.run(`${id}-p${idx+1}`, id, `Page ${idx+1}`, idx+1, idx+1);
  });
  return { id, title };
}
