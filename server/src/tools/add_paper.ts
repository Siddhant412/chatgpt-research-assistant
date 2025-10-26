import { db } from "../db";
import { downloadPdf, extractPages } from "../pdf";
import { resolveToPdf } from "../pdf_resolver";

export async function add_paper({ url }: { url: string }) {
  const resolved = await resolveToPdf(url);
  const { id, file, bytes } = await downloadPdf(resolved.pdfUrl, resolved.fetchHeaders);
  const pages = await extractPages(bytes);

  const fallbackTitle =
    (pages && pages[0] && pages[0].split("\n")[0]?.slice(0, 200)?.trim()) || "Untitled paper";
  const title = (resolved.title || fallbackTitle).trim();

  const src = resolved.sourceUrl || url;
  const dup = db
    .prepare("SELECT id, title FROM papers WHERE source_url = ? LIMIT 1")
    .get(src) as { id: string; title: string } | undefined;
  if (dup) return dup;

  db.prepare(
    "INSERT INTO papers (id, title, source_url, created_at) VALUES (?, ?, ?, datetime('now'))"
  ).run(id, title, src);

  const insert = db.prepare(
    "INSERT INTO sections (id, paper_id, title, page_start, page_end) VALUES (?, ?, ?, ?, ?)"
  );
  for (let i = 0; i < pages.length; i++) {
    insert.run(`${id}-p${i + 1}`, id, `Page ${i + 1}`, i + 1, i + 1);
  }

  return { id, title };
}
