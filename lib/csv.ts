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
    localId: `row-${index}-${tmdbId || title}-${Math.random().toString(36).slice(2, 7)}`,
    orderNumber: orderNumber ?? "",
    tmdbId: tmdbId ?? "",
    year: year ?? "",
    title: title ?? "",
    tmdbLink: tmdbLink ?? "",
    csfdLink: "",
    status: "idle"
  };
}

export function parseMovieJson(file: File): Promise<MovieRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (!Array.isArray(parsed)) {
          return reject(new Error("JSON musí obsahovať pole objektov."));
        }
        const rows: MovieRow[] = parsed.map((item, index) => ({
          localId: `row-${index}-${item.tmdbId || item.title}-${Math.random().toString(36).slice(2, 7)}`,
          orderNumber: String(item.orderNumber ?? item["Poradové číslo"] ?? "").trim(),
          tmdbId: String(item.tmdbId ?? item["TMDb ID"] ?? "").trim(),
          year: String(item.year ?? item["Rok"] ?? "").trim(),
          title: String(item.title ?? item["Názov filmu"] ?? "").trim(),
          tmdbLink: String(item.tmdbLink ?? item["TMDb Link"] ?? "").trim(),
          csfdLink: String(item.csfdLink ?? item["ČSFD Link"] ?? "").trim(),
          status: (item.status as MovieRow["status"]) ?? (item.csfdLink ? "matched" : "idle")
        }));
        resolve(rows.filter((r) => r.tmdbId || r.title));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

export function movieRowsToCsv(rows: MovieRow[]) {
  // UTF-8 BOM pre správne zobrazenie diakritiky v Exceli
  const BOM = "\uFEFF";
  const csv = Papa.unparse(
    rows.map((row) => ({
      "Poradové číslo": row.orderNumber,
      "TMDb ID": row.tmdbId,
      Rok: row.year,
      "Názov filmu": row.title,
      "TMDb Link": row.tmdbLink,
      "ČSFD Link": row.csfdLink
    }))
  );
  return BOM + csv;
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

export function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
