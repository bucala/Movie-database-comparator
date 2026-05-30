"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { downloadTextFile, movieRowsToCsv, parseMovieCsv } from "@/lib/csv";
import type { CsfdSearchResponse, MatchStatus, MovieRow } from "@/lib/types";

const MATCH_DELAY_MS = 950;

const statusLabels: Record<MatchStatus, string> = {
  idle: "Čaká",
  loading: "Načítavam...",
  matched: "Spárované",
  not_found: "Nenašlo sa",
  error: "Chyba"
};

export function MovieMatcherTable() {
  const [rows, setRows] = useState<MovieRow[]>([]);
  const [skipFirstRow, setSkipFirstRow] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const shouldStopRef = useRef(false);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "matched") acc.matched += 1;
        if (row.status === "not_found" || row.status === "error") acc.unmatched += 1;
        return acc;
      },
      { total: 0, matched: 0, unmatched: 0 }
    );
  }, [rows]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const parsedRows = await parseMovieCsv(file, skipFirstRow);
    setRows(parsedRows);
    setFileName(file.name);
  }

  async function runMatching() {
    shouldStopRef.current = false;
    setIsMatching(true);

    for (const row of rows) {
      if (shouldStopRef.current) {
        break;
      }

      const current = getRow(row.localId);

      if (!current || current.csfdLink || !current.title) {
        continue;
      }

      updateRow(row.localId, { status: "loading", message: undefined });

      try {
        const response = await fetch("/api/search-csfd", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: current.title, year: current.year })
        });
        const payload = (await response.json()) as CsfdSearchResponse;

        if (payload.found && payload.url) {
          updateRow(row.localId, {
            csfdLink: payload.url,
            status: "matched",
            message: payload.title ? `${payload.title}${payload.year ? ` (${payload.year})` : ""}` : undefined
          });
        } else {
          updateRow(row.localId, {
            status: "not_found",
            message: payload.error ?? "Zadaj ČSFD link manuálne."
          });
        }
      } catch (error) {
        updateRow(row.localId, {
          status: "error",
          message: error instanceof Error ? error.message : "Vyhľadávanie zlyhalo."
        });
      }

      await wait(MATCH_DELAY_MS);
    }

    setIsMatching(false);
  }

  function stopMatching() {
    shouldStopRef.current = true;
    setIsMatching(false);
  }

  function getRow(localId: string) {
    return rows.find((row) => row.localId === localId);
  }

  function updateRow(localId: string, patch: Partial<MovieRow>) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function exportCsv() {
    downloadTextFile("filmy-s-csfd-linkami.csv", movieRowsToCsv(rows), "text/csv;charset=utf-8");
  }

  function exportJson() {
    const payload = rows.map((row) => ({
      orderNumber: row.orderNumber,
      tmdbId: row.tmdbId,
      year: row.year,
      title: row.title,
      tmdbLink: row.tmdbLink,
      csfdLink: row.csfdLink,
      status: row.status
    }));

    downloadTextFile(
      "filmy-s-csfd-linkami.json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">
              Upload CSV
              <input accept=".csv,text/csv" className="sr-only" type="file" onChange={handleFileChange} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                checked={skipFirstRow}
                className="h-4 w-4 rounded border-slate-300 text-spruce focus:ring-spruce"
                type="checkbox"
                onChange={(event) => setSkipFirstRow(event.target.checked)}
              />
              Ignorovať prvý riadok
            </label>
            {fileName ? <span className="text-sm text-slate-500">{fileName}</span> : null}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-sm sm:min-w-80">
            <Stat label="Riadky" value={stats.total} />
            <Stat label="Spárované" value={stats.matched} />
            <Stat label="Ručne" value={stats.unmatched} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-md bg-spruce px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!rows.length || isMatching}
          type="button"
          onClick={runMatching}
        >
          Spustiť párovanie
        </button>
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={!isMatching}
          type="button"
          onClick={stopMatching}
        >
          Zastaviť
        </button>
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={!rows.length}
          type="button"
          onClick={exportCsv}
        >
          Exportovať CSV
        </button>
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={!rows.length}
          type="button"
          onClick={exportJson}
        >
          Exportovať JSON
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-mist text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">TMDb ID</th>
                <th className="px-4 py-3">Názov</th>
                <th className="px-4 py-3">Rok</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">ČSFD Link</th>
                <th className="px-4 py-3">Akcia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.localId} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                      {row.tmdbId}
                    </td>
                    <td className="min-w-64 px-4 py-3">
                      <div className="font-medium text-slate-900">{row.title}</div>
                      {row.tmdbLink ? (
                        <a
                          className="mt-1 inline-block text-xs text-slate-500 underline-offset-2 hover:underline"
                          href={row.tmdbLink}
                          rel="noreferrer"
                          target="_blank"
                        >
                          TMDb
                        </a>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.year}</td>
                    <td className="min-w-40 px-4 py-3">
                      <StatusBadge status={row.status} />
                      {row.message ? <p className="mt-1 text-xs text-slate-500">{row.message}</p> : null}
                    </td>
                    <td className="min-w-80 px-4 py-3">
                      <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-teal-100"
                        placeholder="https://www.csfd.cz/film/..."
                        type="url"
                        value={row.csfdLink}
                        onChange={(event) =>
                          updateRow(row.localId, {
                            csfdLink: event.target.value,
                            status: event.target.value ? "matched" : "not_found"
                          })
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.csfdLink ? (
                        <a
                          className="font-semibold text-spruce underline-offset-2 hover:underline"
                          href={row.csfdLink}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Otvoriť
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={6}>
                    Nahraj CSV súbor vo formáte: poradové číslo, TMDb ID, rok, názov, TMDb link.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-mist px-3 py-2">
      <div className="text-lg font-semibold text-ink">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "matched" && "bg-emerald-50 text-emerald-700",
        status === "not_found" && "bg-red-50 text-ember",
        status === "error" && "bg-amber-50 text-amber-700",
        status === "loading" && "bg-sky-50 text-sky-700",
        status === "idle" && "bg-slate-100 text-slate-600"
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
