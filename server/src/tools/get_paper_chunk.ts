/* eslint-disable @typescript-eslint/no-var-requires */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db";

const pdfjs: any = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

type SectionRow = { page_start: number; page_end: number };

export async function get_paper_chunk(params: { paperId: string; sectionId: string }) {
  const { paperId, sectionId } = params;

  // Read the PDF from server/data/<paperId>.pdf
  const pdfPath = join(__dirname, "..", "data", `${paperId}.pdf`);
  const buffer = readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  // Lookup section page range
  const sec = db
    .prepare("SELECT page_start, page_end FROM sections WHERE id = ? AND paper_id = ?")
    .get(sectionId, paperId) as SectionRow | undefined;

  if (!sec) throw new Error("Section not found");

  const pages: string[] = [];
  for (let p = sec.page_start; p <= sec.page_end; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push((content.items as any[]).map((it: any) => it.str).join(" "));
  }

  return { text: pages.join("\n\n") };
}
