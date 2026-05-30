import * as cheerio from "cheerio";
import { NextResponse } from "next/server";

const CSFD_BASE_URL = "https://www.csfd.cz";

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
    const title = String(body.title ?? "").trim();
    const year = String(body.year ?? "").trim();

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
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "sk-SK,sk;q=0.9,cs;q=0.8,en;q=0.7",
        "user-agent":
          "Mozilla/5.0 (compatible; MovieDatabaseComparator/0.1; +https://vercel.app)"
      },
      next: { revalidate: 0 }
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

  $('a[href*="/film/"]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href");

    if (!href) {
      return;
    }

    const absoluteUrl = normalizeCsfdUrl(href);
    const containerText = anchor.closest("li, article, .box, .search-list, .content").text();
    const rawText = `${anchor.text()} ${containerText}`.replace(/\s+/g, " ").trim();
    const title = cleanCandidateTitle(anchor.text() || rawText);
    const year = rawText.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;

    if (!title || byUrl.has(absoluteUrl)) {
      return;
    }

    byUrl.set(absoluteUrl, {
      title,
      year,
      url: absoluteUrl,
      score: scoreCandidate(title, year, wantedTitle, wantedYear)
    });
  });

  return Array.from(byUrl.values())
    .filter((candidate) => candidate.title.length > 1)
    .sort((a, b) => b.score - a.score);
}

function normalizeCsfdUrl(href: string) {
  const absolute = href.startsWith("http") ? href : `${CSFD_BASE_URL}${href}`;
  const url = new URL(absolute);
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  const detailPath = path.includes("/recenze/") ? path : `${path.replace(/\/(prehled\/)?$/, "/")}recenze/`;

  return `${CSFD_BASE_URL}${detailPath}`;
}

function cleanCandidateTitle(value: string) {
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
) {
  const candidate = normalizeText(candidateTitle);
  const wanted = normalizeText(wantedTitle);

  let score = 0;

  if (candidate === wanted) {
    score += 70;
  } else if (candidate.includes(wanted) || wanted.includes(candidate)) {
    score += 48;
  } else {
    score += similarityScore(candidate, wanted) * 45;
  }

  if (wantedYear && candidateYear === wantedYear) {
    score += 30;
  } else if (wantedYear && candidateYear) {
    score -= 15;
  }

  return Math.round(score);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarityScore(a: string, b: string) {
  if (!a || !b) {
    return 0;
  }

  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshteinDistance(a: string, b: string) {
  const matrix = Array.from({ length: b.length + 1 }, (_, row) => [row]);

  for (let column = 0; column <= a.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= b.length; row += 1) {
    for (let column = 1; column <= a.length; column += 1) {
      const substitutionCost = a[column - 1] === b[row - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[b.length][a.length];
}
