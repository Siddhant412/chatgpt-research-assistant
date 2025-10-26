import { db } from "../db";
import { downloadPdf, extractPages } from "../pdf";
import { resolveToPdf } from "../pdf_resolver";

function normalizeTitle(candidate: string | undefined, firstPage?: string): string {
  const bad = (s?: string) => {
    if (!s) return true;
    const t = s.trim();
    if (!t) return true;
    const lo = t.toLowerCase();
    if (lo.startsWith("received ")) return true;
    if (lo.startsWith("accepted ")) return true;
    if (lo.includes("digital object identifier")) return true;
    if (lo.includes("ieee access")) return true;
    return false;
  };

  let title = candidate?.trim() ?? "";

  if (bad(title)) {
    const fp = (firstPage ?? "").replace(/\s{2,}/g, " ").trim();
    const seg = fp.split(/\.\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
    if (!bad(seg) && seg.length >= 10) title = seg;
  }

  if (!title) title = "Untitled paper";
  return title.replace(/\s{2,}/g, " ").slice(0, 200);
}

export async function add_paper({ url }: { url: string }) {
  const resolved = await resolveToPdf(url);
  const { id, file, bytes } = await downloadPdf(resolved.pdfUrl, resolved.fetchHeaders);
  const pages = await extractPages(bytes);

  const title = normalizeTitle(resolved.title, pages[0]);

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
