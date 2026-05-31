export type MatchStatus = "idle" | "loading" | "matched" | "not_found" | "error";

export type MovieRow = {
  localId: string;
  orderNumber: string;
  tmdbId: string;
  year: string;
  title: string;
  tmdbLink: string;
  csfdLink: string;
  csfdRating: string;
  status: MatchStatus;
  message?: string;
};

export type CsfdSearchResponse = {
  found: boolean;
  url: string | null;
  title?: string;
  year?: string;
  rating?: string;
  candidates?: Array<{
    title: string;
    year: string | null;
    url: string;
    score: number;
  }>;
  error?: string;
};

export type StatusFilter = "all" | MatchStatus;

export type RatingFilter = "all" | "none" | "low" | "mid" | "high";
