import * as cheerio from "cheerio";
import { NextResponse } from "next/server";

const CSFD_BASE_URL = "https://www.csfd.cz";
// Maximálny počet súbežných requestov – ochrana pred rate-limitom
const MAX_TITLE_LENGTH = 200;

type SearchRequest = {
  title?: string;
  year?: string | number;
};

type Candidate = {
  title: string;
  year: string | null;
  url: string;
  score: number;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchRequest;
    const title = String(body.title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
    const rawYear = String(body.year ?? "").trim();
    // Validácia roku – musí byť 4-ciferné číslo medzi 1888 a 2030
    const year = /^(188[8-9]|18[9-9]\d|19\d{2}|20[0-2]\d|2030)$/.test(rawYear) ? rawYear : "";

    if (!title) {
      return NextResponse.json(
        { found: false, url: null, error: "Chýba názov filmu." },
        { status: 400 }
      );
    }

    const query = [title, year].filter(Boolean).join(" ");
    const searchUrl = `${CSFD_BASE_URL}/hledat/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "sk-SK,sk;q=0.9,cs;q=0.8,en;q=0.7",
        "user-agent":
          "Mozilla/5.0 (compatible; MovieDatabaseComparator/0.2; +https://github.com/bucala/Movie-database-comparator)"
      },
      signal: AbortSignal.timeout(8000) // 8s timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          found: false,
          url: null,
          error: `ČSFD vrátilo HTTP ${response.status}. Skús to neskôr alebo vlož link manuálne.`
        },
        { status: 502 }
      );
    }

    const html = await response.text();
    const candidates = extractCandidates(html, title, year);
    const bestCandidate = candidates[0];

    if (!bestCandidate || bestCandidate.score < 45) {
      return NextResponse.json({
        found: false,
        url: null,
        candidates: candidates.slice(0, 5)
      });
    }

    return NextResponse.json({
      found: true,
      url: bestCandidate.url,
      title: bestCandidate.title,
      year: bestCandidate.year,
      candidates: candidates.slice(0, 5)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neznáma chyba.";
    return NextResponse.json(
      { found: false, url: null, error: message },
      { status: 500 }
    );
  }
}

function extractCandidates(html: string, wantedTitle: string, wantedYear: string): Candidate[] {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, Candidate>();

  // Hľadáme VÝLUČNE v sekciách výsledkov hľadania filmov (.search-list-result)
  // aby sme vylúčili navigačné a iné odseky
  const searchSections = $(".search-list-result, #snippet-search-films, .box-films, section.box");
  const container = searchSections.length ? searchSections : $("body");

  container.find('a[href*="/film/"]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href");
    if (!href) return;

    // Preskočiť linky na recenzie, galériu, news, fórum atď.
    if (/\/(recenze|komentare|galerie|zpravy|forum|zive)\//.test(href)) return;

    const absoluteUrl = normalizeCsfdUrl(href);
    if (byUrl.has(absoluteUrl)) return;

    // Nadradený kontajner pre rok
    const parentText = anchor
      .closest("li, article, .film, .search-list-item")
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const rawTitle = anchor.text().trim();
    const title = cleanCandidateTitle(rawTitle);
    if (!title || title.length < 2) return;

    // Rok z nadrádeného textu – preferujeme rok čo najskôr
    const yearMatch = parentText.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : null;

    byUrl.set(absoluteUrl, {
      title,
      year,
      url: absoluteUrl,
      score: scoreCandidate(title, year, wantedTitle, wantedYear)
    });
  });

  return Array.from(byUrl.values())
    .filter((c) => c.title.length > 1)
    .sort((a, b) => b.score - a.score);
}

function normalizeCsfdUrl(href: string): string {
  const absolute = href.startsWith("http") ? href : `${CSFD_BASE_URL}${href}`;
  try {
    const url = new URL(absolute);
    // Normalizácia: ponecháme len /film/{id}-{slug}/ bez ďalších podstránok
    const pathParts = url.pathname.split("/").filter(Boolean);
    const filmIndex = pathParts.indexOf("film");
    if (filmIndex === -1) return absolute;
    const cleanPath = "/" + pathParts.slice(0, filmIndex + 2).join("/") + "/";
    return `${CSFD_BASE_URL}${cleanPath}`;
  } catch {
    return absolute;
  }
}

function cleanCandidateTitle(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\(\d{4}\)/g, "")
    .replace(/^\s*Film\s*/i, "")
    .trim();
}

function scoreCandidate(
  candidateTitle: string,
  candidateYear: string | null,
  wantedTitle: string,
  wantedYear: string
): number {
  const candidate = normalizeText(candidateTitle);
  const wanted = normalizeText(wantedTitle);

  let score = 0;

  if (candidate === wanted) {
    score += 70; // presná zhoda
  } else if (candidate.includes(wanted) || wanted.includes(candidate)) {
    score += 48; // čiastočná zhoda
  } else {
    score += similarityScore(candidate, wanted) * 45; // fuzzy
  }

  if (wantedYear && candidateYear === wantedYear) {
    score += 30; // rok sedí
  } else if (wantedYear && candidateYear) {
    score -= 15; // rok nesedí
  }

  return Math.round(score);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, row) => [row]);
  for (let col = 0; col <= a.length; col++) matrix[0][col] = col;
  for (let row = 1; row <= b.length; row++) {
    for (let col = 1; col <= a.length; col++) {
      const cost = a[col - 1] === b[row - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}
