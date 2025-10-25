/* eslint-disable @typescript-eslint/no-var-requires */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fetch } from "undici";

// Use legacy Node build of pdfjs
const pdfjs: any = require("pdfjs-dist/legacy/build/pdf.js");
pdfjs.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

const DATA_DIR = join(process.cwd(), "data");

export async function downloadPdf(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const id = randomUUID();
  const file = join(DATA_DIR, `${id}.pdf`);
  writeFileSync(file, buf);
  return { id, file, buffer: buf };
}

export async function extractPages(buffer: Buffer): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str).join(" "));
  }
  return pages;
}
