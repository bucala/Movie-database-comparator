export type MatchStatus =
  | "idle"
  | "loading"
  | "matched"
  | "review"
  | "not_found"
  | "invalid"
  | "error";

export type MatchSource = "none" | "auto" | "manual" | "candidate";

export type CsfdCandidate = {
  title: string;
  year: string | null;
  url: string;
  score: number;
};

export type MovieRow = {
  localId: string;
  rowNumber: number;
  orderNumber: string;
  tmdbId: string;
  year: string;
  title: string;
  tmdbLink: string;
  csfdLink: string;
  status: MatchStatus;
  matchedBy: MatchSource;
  matchScore?: number;
  matchedTitle?: string;
  matchedYear?: string | null;
  candidates: CsfdCandidate[];
  message?: string;
};

export type CsfdSearchResponse = {
  found: boolean;
  url: string | null;
  title?: string;
  year?: string | null;
  score?: number;
  cached?: boolean;
  ambiguous?: boolean;
  candidates?: CsfdCandidate[];
  error?: string;
};
