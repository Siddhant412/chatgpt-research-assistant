import "dotenv/config";
import { fetch } from "undici";
import { parse } from "node-html-parser";
import * as setCookie from "set-cookie-parser";

const DEBUG = process.env.DEBUG === "1";
const log = (...args: any[]) => { if (DEBUG) console.log("[resolver]", ...args); };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/pdf, text/html;q=0.9,application/xhtml+xml;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
};

export type ResolveResult = {
  pdfUrl: string;
  sourceUrl: string;
  doi?: string;
  title?: string;
  obtainedVia:
    | "direct-pdf"
    | "arxiv"
    | "unpaywall"
    | "html-meta"
    | "html-link"
    | "semantic-scholar"
    | "openalex"
    | "ieee";
  fetchHeaders?: Record<string, string>;
};

const isPdfContentType = (v: string | null) => {
  if (!v) return false;
  const t = v.toLowerCase().split(";")[0].trim();
  return t === "application/pdf" || t === "application/octet-stream";
};

const isProbablyDoi = (s: string) =>
  /^10\.\d{4,9}\/\S+$/i.test(s.trim()) || /^https?:\/\/doi\.org\//i.test(s);
const stripDoi = (s: string) => s.replace(/^https?:\/\/doi\.org\//i, "").trim();

const isArxivAbs = (u: string) => /arxiv\.org\/abs\//i.test(u);
const isArxivPdf = (u: string) => /arxiv\.org\/pdf\/.+\.pdf$/i.test(u);
const arxivIdFromAbs = (u: string) => u.match(/arxiv\.org\/abs\/([\w.\-\/]+)/i)?.[1]?.trim();

const isIeee = (u: string) => /ieeexplore\.ieee\.org/i.test(u);
const absolutize = (base: string, href: string) => { try { return new URL(href, base).toString(); } catch { return href; } };

type CookieJar = { map: Map<string, string> };

function serializeCookies(jar?: CookieJar): string | undefined {
  if (!jar) return undefined;
  const parts: string[] = [];
  jar.map.forEach((v, k) => parts.push(`${k}=${v}`));
  return parts.length ? parts.join("; ") : undefined;
}

function mergeCookies(jar: CookieJar, res: Response) {
  const raw: string[] =
    ((res as any).headers?.getSetCookie?.() as string[] | undefined) ??
    ((res.headers.get("set-cookie") as string | null) ? [res.headers.get("set-cookie") as string] : []);
  if (!raw || !raw.length) return;

  const parsed = setCookie.parse(raw, { map: false }) as Array<{ name: string; value: string }>;
  for (const c of parsed) {
    if (!c?.name) continue;
    if (c.value === "_remove_") continue;
    jar.map.set(c.name, c.value);
  }
  if (DEBUG) log("cookie map keys:", Array.from(jar.map.keys()).join(", "));
}

function addFetchHints(headers: Record<string, string>, kind: "document" | "embed") {
  if (kind === "document") {
    headers["Sec-Fetch-Site"] = "same-origin";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Dest"] = "document";
    headers["Upgrade-Insecure-Requests"] = "1";
  } else {
    headers["Sec-Fetch-Site"] = "same-origin";
    headers["Sec-Fetch-Mode"] = "no-cors";
    headers["Sec-Fetch-Dest"] = "embed";
  }
}

async function httpGet(url: string, extra?: Record<string, string>) {
  log("GET", url);
  return fetch(url, { redirect: "follow", headers: { ...BASE_HEADERS, ...(extra ?? {}) } });
}

async function tryDirectPdf(
  url: string,
  opts?: { referer?: string; jar?: CookieJar; fetchKind?: "document" | "embed" }
): Promise<ResolveResult | null> {
  if (!/\.pdf($|\?)/i.test(url)) return null;
  const headers: Record<string, string> = {};
  if (opts?.referer) headers.Referer = opts.referer;
  const cookieHeader = serializeCookies(opts?.jar);
  if (cookieHeader) headers.Cookie = cookieHeader;
  addFetchHints(headers, opts?.fetchKind ?? "embed");

  const res = await httpGet(url, headers);
  log("tryDirectPdf status", res.status, "url", res.url);
  if (!res.ok) return null;
  const ct = res.headers.get("content-type");
  if (isPdfContentType(ct)) {
    const ok: ResolveResult = {
      pdfUrl: res.url,
      sourceUrl: opts?.referer || res.url,
      obtainedVia: "direct-pdf",
      fetchHeaders: Object.keys(headers).length ? headers : undefined,
    };
    if (DEBUG) log("RESOLVED PDF", ok.pdfUrl, "via", "direct-pdf");
    return ok;
  }
  return null;
}

/* arXiv */
async function resolveArxiv(input: string): Promise<ResolveResult | null> {
  if (isArxivPdf(input)) return (await tryDirectPdf(input));
  const id = isArxivAbs(input)
    ? arxivIdFromAbs(input)
    : (/^arxiv:\s*/i.test(input) ? input.replace(/^arxiv:\s*/i, "").trim() : "");
  if (!id) return null;
  const pdf = `https://arxiv.org/pdf/${id}.pdf`;
  const ok = await tryDirectPdf(pdf);
  if (ok) return { ...ok, obtainedVia: "arxiv" };
  return null;
}

/* Unpaywall/S2/OpenAlex */
async function resolveViaUnpaywall(doi: string, refererForIeee?: string, jar?: CookieJar) {
  const email = process.env.UNPAYWALL_EMAIL;
  if (!email) { log("Unpaywall disabled (no email)"); return null; }
  const res = await httpGet(
    `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
    { Accept: "application/json" }
  );
  log("Unpaywall status", res.status);
  if (!res.ok) return null;
  const data = await res.json() as any;
  const best = data?.best_oa_location || data?.oa_location || null;
  const pdfUrl: string | undefined =
    best?.url_for_pdf ||
    best?.url ||
    data?.oa_locations?.find((o: any) => o?.url_for_pdf)?.url_for_pdf;
  if (!pdfUrl) return null;

  const isIeeePdf = /ieeexplore\.ieee\.org/i.test(pdfUrl);
  const ok = await tryDirectPdf(pdfUrl, {
    referer: isIeeePdf ? refererForIeee : undefined,
    jar,
    fetchKind: "embed",
  });
  if (!ok) return null;
  const resolved: ResolveResult = {
    ...ok,
    doi,
    title: data?.title,
    sourceUrl: best?.url ?? ok.sourceUrl,
    obtainedVia: "unpaywall",
  };
  if (DEBUG) log("RESOLVED PDF", resolved.pdfUrl, "via", "unpaywall");
  return resolved;
}

async function resolveViaSemanticScholar(doi: string) {
  const res = await httpGet(
    `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,openAccessPdf,url`,
    { Accept: "application/json" }
  );
  log("S2 status", res.status);
  if (!res.ok) return null;
  const data = await res.json() as any;
  const pdf = data?.openAccessPdf?.url;
  if (!pdf) return null;
  const ok = await tryDirectPdf(pdf);
  return ok ? { ...ok, doi, title: data?.title, sourceUrl: data?.url ?? ok.sourceUrl, obtainedVia: "semantic-scholar" as const } : null;
}

async function resolveViaOpenAlex(doi: string) {
  const res = await httpGet(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`,
    { Accept: "application/json" }
  );
  log("OpenAlex status", res.status);
  if (!res.ok) return null;
  const data = await res.json() as any;
  const best = data?.best_oa_location;
  const pdf = best?.pdf_url || best?.url_for_pdf;
  if (!pdf) return null;
  const ok = await tryDirectPdf(pdf);
  return ok ? { ...ok, doi, title: data?.title, sourceUrl: best?.landing_page_url ?? ok.sourceUrl, obtainedVia: "openalex" as const } : null;
}

/* IEEE helpers */
function arnumberFromUrl(u: string): string | undefined {
  return u.match(/\/document\/(\d+)(?:[/?#]|$)/)?.[1];
}

function isIeeeStampUrl(u: URL) {
  return /ieeexplore\.ieee\.org/i.test(u.host) && /\/stamp\/stamp\.jsp$/i.test(u.pathname);
}
function docUrlFromStamp(u: URL) {
  const ar = u.searchParams.get("arnumber");
  return ar ? `https://ieeexplore.ieee.org/document/${ar}/` : u.toString();
}

function extractIeeePdfFromHtml(html: string, baseUrl: string): string | null {
  const mScript = html.match(/<script[^>]*id=["']global-document-metadata["'][^>]*>([\s\S]*?)<\/script>/i);
  if (mScript) {
    try {
      const json = JSON.parse(mScript[1]);
      const c = json?.pdfPath || json?.pdfUrl;
      if (c) return absolutize(baseUrl, String(c));
    } catch {}
  }
  const mAssign = html.match(/global\.document\.metadata\s*=\s*(\{[\s\S]*?\});/i);
  if (mAssign) {
    try {
      const json = JSON.parse(mAssign[1]);
      const c = json?.pdfPath || json?.pdfUrl;
      if (c) return absolutize(baseUrl, String(c));
    } catch {
      const m = (mAssign[1].match(/"pdfPath"\s*:\s*"([^"]+\.pdf[^"]*)"/i) ||
                 mAssign[1].match(/"pdfUrl"\s*:\s*"([^"]+\.pdf[^"]*)"/i));
      if (m) return absolutize(baseUrl, m[1]);
    }
  }
  const root = parse(html);
  const metaPdf = root.querySelector('meta[name="citation_pdf_url"]')?.getAttribute("content");
  if (metaPdf) return absolutize(baseUrl, metaPdf);
  return null;
}

async function fetchIeeeDocWithCookies(docUrl: string, jar: CookieJar) {
  const headers: Record<string, string> = {
    Referer: "https://ieeexplore.ieee.org/",
    Origin: "https://ieeexplore.ieee.org",
  };
  addFetchHints(headers, "document");
  const res = await httpGet(docUrl, headers);
  log("doc page status", res.status);
  if (!res.ok) return { ok: false as const };
  mergeCookies(jar, res as any);
  const html = await res.text();
  return { ok: true as const, html };
}

async function resolveViaIeeeWithCookies(finalDocUrl: string): Promise<ResolveResult | null> {
  const jar: CookieJar = { map: new Map() };
  const doc = await fetchIeeeDocWithCookies(finalDocUrl, jar);
  if (!doc.ok) return null;

  const ar = arnumberFromUrl(finalDocUrl);
  const stampUrl = ar ? `https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=${ar}` : finalDocUrl;

  if (ar) {
    const getPdfUrl = `https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=${ar}`;
    log("IEEE getPDF", getPdfUrl);
    const viaGetPdf = await tryDirectPdf(getPdfUrl, { referer: stampUrl, jar, fetchKind: "document" });
    if (viaGetPdf) {
      if (DEBUG) log("RESOLVED PDF", viaGetPdf.pdfUrl, "via", "ieee(getPDF)");
      return { ...viaGetPdf, sourceUrl: finalDocUrl, obtainedVia: "ieee" };
    }
  }

  const embedded = extractIeeePdfFromHtml(doc.html!, finalDocUrl);
  if (embedded) {
    log("IEEE embedded pdf", embedded);
    const viaEmbedded = await tryDirectPdf(embedded, { referer: stampUrl, jar, fetchKind: "embed" });
    if (viaEmbedded) {
      if (DEBUG) log("RESOLVED PDF", viaEmbedded.pdfUrl, "via", "ieee(embedded)");
      return { ...viaEmbedded, sourceUrl: finalDocUrl, obtainedVia: "ieee" };
    }
  }

  if (ar) {
    const metaUrl = `https://ieeexplore.ieee.org/rest/document/${ar}/metadata`;
    const headers: Record<string, string> = {
      Referer: finalDocUrl,
      Origin: "https://ieeexplore.ieee.org",
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
    };
    const cookieHeader = serializeCookies(jar);
    if (cookieHeader) headers.Cookie = cookieHeader;

    log("IEEE REST", metaUrl);
    const res = await httpGet(metaUrl, headers);
    log("IEEE REST status", res.status);
    if (res.ok) {
      mergeCookies(jar, res as any);
      const data = await res.json() as any;
      const candidate: string | undefined = data?.pdfPath || data?.pdfUrl;
      if (candidate) {
        const pdfUrl = absolutize(finalDocUrl, candidate);
        log("IEEE REST pdf", pdfUrl);
        const ok = await tryDirectPdf(pdfUrl, { referer: stampUrl, jar, fetchKind: "embed" });
        if (ok) {
          if (DEBUG) log("RESOLVED PDF", ok.pdfUrl, "via", "ieee(rest)");
          return { ...ok, sourceUrl: finalDocUrl, obtainedVia: "ieee" };
        }
      }
    }
  }

  if (ar) {
    log("IEEE stamp", stampUrl);
    const cookieHeader = serializeCookies(jar);
    const res = await httpGet(stampUrl, {
      Referer: finalDocUrl,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    });
    log("IEEE stamp status", res.status);
    if (res.ok) {
      mergeCookies(jar, res as any);
      const ct = res.headers.get("content-type") || "";
      if (isPdfContentType(ct)) {
        const resolved: ResolveResult = {
          pdfUrl: res.url,
          sourceUrl: finalDocUrl,
          obtainedVia: "ieee",
          fetchHeaders: { Referer: finalDocUrl, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
        };
        if (DEBUG) log("RESOLVED PDF", resolved.pdfUrl, "via", "ieee(stamp-pdf)");
        return resolved;
      }
      const html = await res.text();
      const root = parse(html);
      const link = root.querySelectorAll("[href],[src]").find(el => {
        const href = el.getAttribute("href") || el.getAttribute("src") || "";
        return /\.pdf($|\?)/i.test(href);
      });
      if (link) {
        const href = (link.getAttribute("href") || link.getAttribute("src") || "").trim();
        const pdfUrl = absolutize(stampUrl, href);
        const ok = await tryDirectPdf(pdfUrl, { referer: stampUrl, jar, fetchKind: "embed" });
        if (ok) {
          if (DEBUG) log("RESOLVED PDF", ok.pdfUrl, "via", "ieee(stamp-embed)");
          return { ...ok, sourceUrl: finalDocUrl, obtainedVia: "ieee" };
        }
      }
    }
  }

  return null;
}

/* Normal HTML scan */
async function resolveViaHtmlScan(landingUrl: string): Promise<ResolveResult | null> {
  const res = await httpGet(landingUrl);
  log("HTML scan status", res.status, "url", res.url);
  if (!res.ok) return null;
  const finalUrl = res.url;
  const ct = res.headers.get("content-type") || "";
  if (isPdfContentType(ct)) {
    const ok: ResolveResult = { pdfUrl: finalUrl, sourceUrl: finalUrl, obtainedVia: "direct-pdf" };
    if (DEBUG) log("RESOLVED PDF", ok.pdfUrl, "via", "direct-pdf(html-scan)");
    return ok;
  }

  const html = await res.text();
  const root = parse(html);

  if (isIeee(finalUrl)) {
    const viaIeee = await resolveViaIeeeWithCookies(finalUrl);
    if (viaIeee) return viaIeee;
  }

  const metaPdf =
    root.querySelector('meta[name="citation_pdf_url"]')?.getAttribute("content") ||
    root.querySelector('link[rel="alternate"][type="application/pdf"]')?.getAttribute("href");
  if (metaPdf) {
    const url = absolutize(finalUrl, metaPdf);
    const ok = await tryDirectPdf(url, { referer: finalUrl, fetchKind: "embed" });
    if (ok) {
      const title =
        root.querySelector('meta[name="citation_title"]')?.getAttribute("content") ||
        root.querySelector("title")?.text?.trim();
      const resolved: ResolveResult = { ...ok, sourceUrl: finalUrl, title, obtainedVia: "html-meta" };
      if (DEBUG) log("RESOLVED PDF", resolved.pdfUrl, "via", "html-meta");
      return resolved;
    }
  }

  const anchor = root.querySelectorAll("a").find(a => {
    const href = a.getAttribute("href") || "";
    return /pdf/i.test(a.text) || /\.pdf($|\?)/i.test(href);
  });
  if (anchor) {
    const href = anchor.getAttribute("href") || "";
    const url = absolutize(finalUrl, href);
    const ok = await tryDirectPdf(url, { referer: finalUrl, fetchKind: "embed" });
    if (ok) {
      const title =
        root.querySelector('meta[name="citation_title"]')?.getAttribute("content") ||
        root.querySelector("title")?.text?.trim();
      const resolved: ResolveResult = { ...ok, sourceUrl: finalUrl, title, obtainedVia: "html-link" };
      if (DEBUG) log("RESOLVED PDF", resolved.pdfUrl, "via", "html-link");
      return resolved;
    }
  }

  return null;
}

export async function resolveToPdf(inputRaw: string): Promise<ResolveResult> {
  const input = inputRaw.trim();
  log("resolve input:", input);

  try {
    const u = new URL(input);
    if (isIeeeStampUrl(u)) {
      const docUrl = docUrlFromStamp(u);
      const viaIeee = await resolveViaIeeeWithCookies(docUrl);
      if (viaIeee) return viaIeee;
    }
  } catch { /* not a URL */ }

  // direct .pdf
  const direct = await tryDirectPdf(input);
  if (direct) return direct;

  // arXiv
  const arxiv = await resolveArxiv(input);
  if (arxiv) return arxiv;

  // DOI flow
  if (isProbablyDoi(input)) {
    const doi = stripDoi(input);

    const landing = await httpGet(`https://doi.org/${doi}`);
    let docUrl: string | undefined;
    if (landing.ok) {
      docUrl = landing.url;
      log("DOI resolved to", docUrl);
      if (docUrl && isIeee(docUrl)) {
        const viaIeee = await resolveViaIeeeWithCookies(docUrl);
        if (viaIeee) return { ...viaIeee, doi };
      }
    }

    const viaUP = await resolveViaUnpaywall(doi, docUrl, docUrl && isIeee(docUrl) ? { map: new Map() } : undefined);
    if (viaUP) return viaUP;

    if (docUrl) {
      const viaHtml = await resolveViaHtmlScan(docUrl);
      if (viaHtml) return { ...viaHtml, doi };
    }

    const viaS2 = await resolveViaSemanticScholar(doi);
    if (viaS2) return viaS2;

    const viaOA = await resolveViaOpenAlex(doi);
    if (viaOA) return viaOA;
  }

  // Generic landing page
  try {
    const url = new URL(input).toString();
    const viaHtml = await resolveViaHtmlScan(url);
    if (viaHtml) return viaHtml;
  } catch {}

  throw new Error("No openly accessible PDF found. If this paper is paywalled, please upload the PDF directly.");
}
