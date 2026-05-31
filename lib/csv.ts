import Papa from "papaparse";
import type { MovieRow } from "./types";

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseMovieCsv(file: File, skipFirstRow: boolean): Promise<MovieRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete(results) {
        try {
          const data = skipFirstRow ? results.data.slice(1) : results.data;
          const rows: MovieRow[] = data.map((cols, index) => {
            const rand = Math.random().toString(36).slice(2, 7);
            return {
              localId: `${Date.now()}-${index}-${cols[1] ?? ""}-${rand}`,
              orderNumber: (cols[0] ?? "").trim(),
              tmdbId: (cols[1] ?? "").trim(),
              year: (cols[2] ?? "").trim(),
              title: (cols[3] ?? "").trim(),
              tmdbLink: (cols[4] ?? "").trim(),
              csfdLink: (cols[5] ?? "").trim(),
              csfdRating: (cols[6] ?? "").trim(),
              status: (cols[5] ?? "").trim() ? "matched" : "idle"
            };
          });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      },
      error(err) {
        reject(new Error(err.message));
      }
    });
  });
}

export function parseMovieJson(file: File): Promise<MovieRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string) as Record<string, string>[];
        const rows: MovieRow[] = raw.map((item, index) => {
          const rand = Math.random().toString(36).slice(2, 7);
          return {
            localId: `json-${Date.now()}-${index}-${rand}`,
            orderNumber: String(item.orderNumber ?? ""),
            tmdbId: String(item.tmdbId ?? ""),
            year: String(item.year ?? ""),
            title: String(item.title ?? ""),
            tmdbLink: String(item.tmdbLink ?? ""),
            csfdLink: String(item.csfdLink ?? ""),
            csfdRating: String(item.csfdRating ?? ""),
            status: (item.status as MovieRow["status"]) ?? (item.csfdLink ? "matched" : "idle"),
            message: item.message ? String(item.message) : undefined
          };
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Chyba pri čítaní súboru."));
    reader.readAsText(file);
  });
}

export function movieRowsToCsv(rows: MovieRow[]): string {
  const header = ["#", "TMDb ID", "Rok", "Názov", "TMDb Link", "ČSFD Link", "ČSFD Hodnotenie"];
  const dataRows = rows.map((r) => [
    r.orderNumber,
    r.tmdbId,
    r.year,
    r.title,
    r.tmdbLink,
    r.csfdLink,
    r.csfdRating
  ]);
  const csv = Papa.unparse([header, ...dataRows]);
  return "\uFEFF" + csv; // UTF-8 BOM pre Excel
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
