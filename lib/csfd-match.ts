import * as cheerio from "cheerio";
import type { CsfdCandidate } from "@/lib/types";

export const CSFD_BASE_URL = "https://www.csfd.cz";
export const AUTO_MATCH_THRESHOLD = 45;
export const AMBIGUOUS_SCORE_GAP = 5;

export function buildCsfdSearchUrl(title: string, year: string) {
  const query = [title, year].filter(Boolean).join(" ");
  return `${CSFD_BASE_URL}/hledat/?q=${encodeURIComponent(query)}`;
}

export function extractCandidates(
  html: string,
  wantedTitle: string,
  wantedYear: string
): CsfdCandidate[] {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, CsfdCandidate>();

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

export function getBestCandidate(candidates: CsfdCandidate[]) {
  return candidates[0] ?? null;
}

export function isAmbiguousCandidates(candidates: CsfdCandidate[]) {
  const best = candidates[0];
  const second = candidates[1];

  if (!best || !second) {
    return false;
  }

  return best.score - second.score <= AMBIGUOUS_SCORE_GAP;
}

export function normalizeCsfdUrl(href: string) {
  const absolute = href.startsWith("http") ? href : `${CSFD_BASE_URL}${href}`;
  const url = new URL(absolute);
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  const detailPath = path.includes("/recenze/")
    ? path
    : `${path.replace(/\/(prehled\/)?$/, "/")}recenze/`;

  return `${CSFD_BASE_URL}${detailPath}`;
}

export function scoreCandidate(
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

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanCandidateTitle(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\(\d{4}\)/g, "")
    .replace(/^\s*Film\s*/i, "")
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
