import Papa from "papaparse";
import type { MovieRow } from "@/lib/types";

export function parseMovieCsv(file: File, skipFirstRow: boolean): Promise<MovieRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data
          .slice(skipFirstRow ? 1 : 0)
          .map((columns, index) => toMovieRow(columns, index))
          .filter((row): row is MovieRow => Boolean(row));

        resolve(rows);
      },
      error: (error) => reject(error)
    });
  });
}

function toMovieRow(columns: string[], index: number): MovieRow | null {
  const [orderNumber, tmdbId, year, title, tmdbLink] = columns.map((value) =>
    String(value ?? "").trim()
  );

  if (!tmdbId && !year && !title) {
    return null;
  }

  return {
    localId: `${Date.now()}-${index}-${tmdbId || title}`,
    orderNumber: orderNumber ?? "",
    tmdbId: tmdbId ?? "",
    year: year ?? "",
    title: title ?? "",
    tmdbLink: tmdbLink ?? "",
    csfdLink: "",
    status: "idle"
  };
}

export function movieRowsToCsv(rows: MovieRow[]) {
  return Papa.unparse(
    rows.map((row) => ({
      "Poradové číslo": row.orderNumber,
      "TMDb ID": row.tmdbId,
      Rok: row.year,
      "Názov filmu": row.title,
      "TMDb Link": row.tmdbLink,
      "ČSFD Link": row.csfdLink
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
