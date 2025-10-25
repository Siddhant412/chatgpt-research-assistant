/* eslint-disable @typescript-eslint/no-var-requires */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../db";

// Use legacy Node build of pdfjs
const pdfjs: any = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

type SectionRow = { page_start: number; page_end: number };

export async function get_paper_chunk(params: { paperId: string; sectionId: string }) {
  const { paperId, sectionId } = params;

  const pdfPath = join(process.cwd(), "data", `${paperId}.pdf`);
  const buffer = readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const sec = db
    .prepare("SELECT page_start, page_end FROM sections WHERE id=? AND paper_id=?")
    .get(sectionId, paperId) as SectionRow | undefined;

  if (!sec) throw new Error("Section not found");

  const pages: string[] = [];
  for (let i = sec.page_start; i <= sec.page_end; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str).join(" "));
  }

  return { text: pages.join("\n\n") };
}
