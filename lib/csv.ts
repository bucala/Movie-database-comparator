import Papa from "papaparse";
import type { MovieRow } from "@/lib/types";

export type CsvParseSummary = {
  rows: MovieRow[];
  warnings: string[];
  invalidRows: number;
  skippedHeader: boolean;
};

export function parseMovieCsv(
  file: File,
  skipFirstRow: boolean
): Promise<CsvParseSummary> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data;
        const skippedHeader = skipFirstRow || looksLikeHeader(data[0] ?? []);
        const warnings: string[] = [];
        const rows = data
          .slice(skippedHeader ? 1 : 0)
          .map((columns, index) =>
            toMovieRow(columns, index, index + 1 + (skippedHeader ? 1 : 0), warnings)
          )
          .filter((row): row is MovieRow => Boolean(row));
        const invalidRows = rows.filter((row) => row.status === "invalid").length;

        resolve({ rows, warnings, invalidRows, skippedHeader });
      },
      error: (error) => reject(error)
    });
  });
}

function toMovieRow(
  columns: string[],
  index: number,
  rowNumber: number,
  warnings: string[]
): MovieRow | null {
  const [orderNumber, tmdbId, year, title, tmdbLink] = columns.map((value) =>
    String(value ?? "").trim()
  );

  if (!tmdbId && !year && !title) {
    return null;
  }

  const row: MovieRow = {
    localId: `${Date.now()}-${index}-${tmdbId || title}`,
    rowNumber,
    orderNumber: orderNumber ?? "",
    tmdbId: tmdbId ?? "",
    year: year ?? "",
    title: title ?? "",
    tmdbLink: tmdbLink ?? "",
    csfdLink: "",
    status: "idle",
    matchedBy: "none",
    candidates: []
  };

  const rowWarnings = validateMovieRow(row);

  if (rowWarnings.length) {
    row.status = "invalid";
    row.message = rowWarnings.join(" ");
    warnings.push(`Riadok ${rowNumber}: ${row.message}`);
  }

  return row;
}

export function movieRowsToCsv(rows: MovieRow[]) {
  return Papa.unparse(
    rows.map((row) => ({
      "Poradové číslo": row.orderNumber,
      "TMDb ID": row.tmdbId,
      Rok: row.year,
      "Názov filmu": row.title,
      "TMDb Link": row.tmdbLink,
      "ČSFD Link": row.csfdLink,
      Status: row.status,
      "Párované cez": row.matchedBy,
      "Skóre zhody": row.matchScore ?? "",
      "Nájdený názov": row.matchedTitle ?? "",
      "Nájdený rok": row.matchedYear ?? "",
      "Počet kandidátov": row.candidates.length,
      Poznámka: row.message ?? ""
    }))
  );
}

export function downloadTextFile(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function looksLikeHeader(columns: string[]) {
  const joined = columns.join(" ").toLowerCase();

  return (
    joined.includes("tmdb") ||
    joined.includes("názov") ||
    joined.includes("nazov") ||
    joined.includes("rok")
  );
}

function validateMovieRow(row: MovieRow) {
  const warnings: string[] = [];

  if (!row.title) {
    warnings.push("Chýba názov filmu.");
  }

  if (!row.year || !/^(19|20)\d{2}$/.test(row.year)) {
    warnings.push("Rok musí byť vo formáte YYYY.");
  }

  if (!row.tmdbId) {
    warnings.push("Chýba TMDb ID.");
  }

  return warnings;
}
