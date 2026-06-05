import { NextResponse } from "next/server";
import {
  AUTO_MATCH_THRESHOLD,
  buildCsfdSearchUrl,
  extractCandidates,
  getBestCandidate,
  isAmbiguousCandidates
} from "@/lib/csfd-match";
import type { CsfdSearchResponse } from "@/lib/types";

type SearchRequest = {
  title?: string;
  year?: string | number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ITEMS = 500;
const searchCache = new Map<string, { expiresAt: number; payload: CsfdSearchResponse }>();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          found: false,
          url: null,
          error: "API endpoint je chránený. Zadaj interný token."
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as SearchRequest;
    const title = String(body.title ?? "").trim();
    const year = String(body.year ?? "").trim();

    if (!title) {
      return NextResponse.json(
        { found: false, url: null, error: "Chýba názov filmu." },
        { status: 400 }
      );
    }

    const cacheKey = `${title.toLocaleLowerCase("sk-SK")}::${year}`;
    const cached = readCache(cacheKey);

    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const searchUrl = buildCsfdSearchUrl(title, year);

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

    const payload: CsfdSearchResponse = {
      found: true,
      url: bestCandidate.url,
      title: bestCandidate.title,
      year: bestCandidate.year,
      score: bestCandidate.score,
      cached: false,
      ambiguous,
      candidates: candidates.slice(0, 5)
    };

    writeCache(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neznáma chyba.";

    return NextResponse.json(
      { found: false, url: null, error: message },
      { status: 500 }
    );
  }
}

function isAuthorized(request: Request) {
  const expectedToken = process.env.CSFD_API_TOKEN;

  if (!expectedToken) {
    return true;
  }

  const headerToken = request.headers.get("x-api-token");
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return headerToken === expectedToken || bearerToken === expectedToken;
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
