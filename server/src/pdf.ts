import { fetch } from "undici";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

const DATA_DIR = path.resolve(__dirname, "..", "data");

export async function downloadPdf(url: string, headers?: Record<string, string>) {
  // ensure data dir exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const res = await fetch(url, { headers: headers ?? {} });
  if (!res.ok) throw new Error(`PDF GET failed: ${res.status} ${res.statusText}`);

  const arrayBuf = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);

  const id = crypto.createHash("sha1").update(bytes).digest("hex");
  const file = path.join(DATA_DIR, `${id}.pdf`);

  await fs.writeFile(file, bytes);

  return { id, file, bytes };
}

export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push((content.items as any[]).map((it: any) => it.str || "").join(" "));
  }
  await (doc as any).cleanup?.();
  return pages;
}
