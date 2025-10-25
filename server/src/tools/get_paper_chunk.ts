/* eslint-disable @typescript-eslint/no-var-requires */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../db";

const pdfjs: any = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

type SectionRow = { page_start: number; page_end: number };

export async function get_paper_chunk(params: { paperId: string; sectionId: string }) {
  const { paperId, sectionId } = params;

  // match pdf.ts location: server/data/<id>.pdf
  const pdfPath = resolve(__dirname, "..", "data", `${paperId}.pdf`);

  const buf = readFileSync(pdfPath); // Buffer
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength); // → Uint8Array

  const doc = await pdfjs.getDocument({ data: bytes }).promise;

  const sec = db
    .prepare("SELECT page_start, page_end FROM sections WHERE id=? AND paper_id=?")
    .get(sectionId, paperId) as SectionRow | undefined;

  if (!sec) throw new Error("Section not found");

  const pages: string[] = [];
  for (let i = sec.page_start; i <= sec.page_end; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str || "").join(" "));
  }

  await doc.cleanup?.();
  return { text: pages.join("\n\n") };
}
