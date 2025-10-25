import { fetch } from "undici";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// pdfjs-dist (legacy, node-safe)
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// Always resolve to server/data relative to this file
const DATA_DIR = path.resolve(__dirname, "..", "data");

export async function downloadPdf(url: string, headers?: Record<string, string>) {
  // ensure data dir exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const res = await fetch(url, { headers: headers ?? {} });
  if (!res.ok) throw new Error(`PDF GET failed: ${res.status} ${res.statusText}`);

  const arrayBuf = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf); // Uint8Array (not Buffer)

  const id = crypto.createHash("sha1").update(bytes).digest("hex");
  const file = path.join(DATA_DIR, `${id}.pdf`);

  await fs.writeFile(file, bytes); // fs accepts Uint8Array

  return { id, file, bytes };
}

export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str || "").join(" "));
  }
  await doc.cleanup?.();
  return pages;
}
