import { timingSafeEqual } from "node:crypto";
import * as cheerio from "cheerio";
import { NextResponse } from "next/server";
import {
  AUTO_MATCH_THRESHOLD,
  buildCsfdSearchUrl,
  extractCandidates,
  getBestCandidate,
  isAmbiguousCandidates
} from "@/lib/csfd-match";
import type { CsfdSearchResponse } from "@/lib/types";

const MAX_TITLE_LENGTH = 200;

type SearchRequest = {
  title?: string;
  year?: string | number;
  skipRating?: boolean;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ITEMS = 500;
const searchCache = new Map<string, { expiresAt: number; payload: CsfdSearchResponse }>();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "sk-SK,sk;q=0.9,cs;q=0.8,en;q=0.7",
  "user-agent":
    "Mozilla/5.0 (compatible; MovieDatabaseComparator/0.4; +https://github.com/bucala/Movie-database-comparator)"
};

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { found: false, url: null, error: "API endpoint je chránený. Zadaj interný token." },
        { status: 401 }
      );
    }

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { found: false, url: null, error: "Príliš veľa požiadaviek. Skús neskôr." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as SearchRequest;
    const title = String(body.title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
    const rawYear = String(body.year ?? "").trim();
    const skipRating = body.skipRating === true;
    const year = /^(188[8-9]|18[9-9]\d|19\d{2}|20[0-2]\d|2030)$/.test(rawYear) ? rawYear : "";

    if (!title) {
      return NextResponse.json(
        { found: false, url: null, error: "Chýba názov filmu." },
        { status: 400 }
      );
    }

    const cacheKey = `${title.toLocaleLowerCase("sk-SK")}::${year}::${skipRating ? "skip" : "rating"}`;
    const cached = readCache(cacheKey);

    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const searchUrl = buildCsfdSearchUrl(title, year);

    const response = await fetch(searchUrl, {
      cache: "no-store",
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return NextResponse.json(
        { found: false, url: null, error: `ČSFD vrátilo HTTP ${response.status}.` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const candidates = extractCandidates(html, title, year);
    const bestCandidate = getBestCandidate(candidates);
    const ambiguous = isAmbiguousCandidates(candidates);

    if (!bestCandidate || bestCandidate.score < AUTO_MATCH_THRESHOLD) {
      const payload: CsfdSearchResponse = {
        found: false,
        url: null,
        cached: false,
        ambiguous,
        candidates: candidates.slice(0, 5)
      };

      writeCache(cacheKey, payload);
      return NextResponse.json(payload);
    }

    const rating = skipRating ? null : await fetchCsfdRating(bestCandidate.url);

    const payload: CsfdSearchResponse = {
      found: true,
      url: bestCandidate.url,
      title: bestCandidate.title,
      year: bestCandidate.year,
      score: bestCandidate.score,
      cached: false,
      ambiguous,
      ...(rating ? { rating } : {}),
      candidates: candidates.slice(0, 5)
    };

    writeCache(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neznáma chyba.";
    return NextResponse.json({ found: false, url: null, error: message }, { status: 500 });
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

function isAuthorized(request: Request) {
  const expectedToken = process.env.CSFD_API_TOKEN;

  if (!expectedToken) {
    return true;
  }

  const headerToken = request.headers.get("x-api-token");
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return (headerToken !== null && timingSafeCompare(headerToken, expectedToken))
    || (bearerToken !== undefined && bearerToken !== null && timingSafeCompare(bearerToken, expectedToken));
}

function readCache(cacheKey: string) {
  const cached = searchCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    searchCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function writeCache(cacheKey: string, payload: CsfdSearchResponse) {
  if (searchCache.size >= CACHE_MAX_ITEMS) {
    const firstKey = searchCache.keys().next().value as string | undefined;

    if (firstKey) {
      searchCache.delete(firstKey);
    }
  }

  searchCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload
  });
}

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

async function fetchCsfdRating(filmUrl: string): Promise<string | null> {
  try {
    const res = await fetch(filmUrl, {
      cache: "no-store",
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const selectors = [
      ".film-rating-average",
      ".average",
      "[class*='rating-average']",
      ".film-header-name .rating",
      ".rating-average"
    ];

    for (const sel of selectors) {
      const text = $(sel).first().text().trim();
      const match = text.match(/(\d{1,3})\s*%/);
      if (match) return `${match[1]}%`;
    }

    const headerText = $(".film-header, .box-header-rating, .film-info").first().text();
    const fallbackMatch = headerText.match(/(\d{1,3})\s*%/);
    if (fallbackMatch) {
      const val = parseInt(fallbackMatch[1]);
      if (val >= 1 && val <= 100) return `${val}%`;
    }

    return null;
  } catch {
    return null;
  }
}
