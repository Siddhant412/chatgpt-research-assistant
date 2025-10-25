import { db } from "../db";
import { downloadPdf, extractPages } from "../pdf";
import { resolveToPdf } from "../pdf_resolver";

export async function add_paper({ url }: { url: string }) {
  const resolved = await resolveToPdf(url);

  // returns { id, file, bytes }
  const { id, file, bytes } = await downloadPdf(resolved.pdfUrl, resolved.fetchHeaders);

  // pass Uint8Array to pdfjs
  const pages = await extractPages(bytes);

  const fallbackTitle = pages[0]?.split("\n")[0]?.slice(0, 200)?.trim() || "Untitled paper";
  const title = (resolved.title || fallbackTitle).trim();

  db.prepare("INSERT INTO papers (id, title, source_url, created_at) VALUES (?, ?, ?, datetime('now'))")
    .run(id, title, resolved.sourceUrl || url);

  const insert = db.prepare("INSERT INTO sections (id, paper_id, title, page_start, page_end) VALUES (?, ?, ?, ?, ?)");
  pages.forEach((_, idx) => insert.run(`${id}-p${idx + 1}`, id, `Page ${idx + 1}`, idx + 1, idx + 1));

  return { id, title };
}
