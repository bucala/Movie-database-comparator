"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  downloadTextFile,
  movieRowsToCsv,
  parseMovieCsv,
  parseMovieJson,
  wait
} from "@/lib/csv";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";
import type { CsfdSearchResponse, MatchStatus, MovieRow, StatusFilter } from "@/lib/types";

const MATCH_DELAY_MS = 950;

const statusLabels: Record<MatchStatus, string> = {
  idle: "Čaká",
  loading: "Načítavam...",
  matched: "Spárované",
  not_found: "Nenašlo sa",
  error: "Chyba"
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Všetky" },
  { value: "matched", label: "Spárované" },
  { value: "not_found", label: "Nenašlo sa" },
  { value: "idle", label: "Čaká" },
  { value: "error", label: "Chyba" },
  { value: "loading", label: "Načítavam" }
];

export function MovieMatcherTable() {
  const [rows, setRows] = useState<MovieRow[]>([]);
  const [skipFirstRow, setSkipFirstRow] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const shouldStopRef = useRef(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Inicializácia témy bez flash
  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  // Zatvoriť settings pri kliku mimo
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

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

  const progress = useMemo(() => {
    if (!rows.length) return 0;
    const done = rows.filter((r) => r.status !== "idle" && r.status !== "loading").length;
    return Math.round((done / rows.length) * 100);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      if (ext === "json") {
        const parsedRows = await parseMovieJson(file);
        setRows(parsedRows);
      } else {
        const parsedRows = await parseMovieCsv(file, skipFirstRow);
        setRows(parsedRows);
      }
      setFileName(file.name);
      setStatusFilter("all");
    } catch (err) {
      alert(`Chyba pri načítaní súboru: ${err instanceof Error ? err.message : "Neznáma chyba"}`);
    }
  }

  async function runMatching() {
    shouldStopRef.current = false;
    setIsMatching(true);

    for (const row of rows) {
      if (shouldStopRef.current) break;

      const current = getRow(row.localId);
      if (!current || current.csfdLink || !current.title) continue;

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
            message: payload.title
              ? `${payload.title}${payload.year ? ` (${payload.year})` : ""}`
              : undefined
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

  const matchingProgress = isMatching ? progress : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div
        className="rounded-lg border p-4"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow)"
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Ľavá strana – import + nastavenia */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Upload CSV */}
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition"
              style={{ background: "var(--ink)" }}
              title="Nahrať CSV súbor"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload CSV
              <input accept=".csv,text/csv" className="sr-only" type="file" onChange={handleFileChange} />
            </label>

            {/* Import JSON */}
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold transition"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text)"
              }}
              title="Importovať uložený JSON súbor"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import JSON
              <input accept=".json,application/json" className="sr-only" type="file" onChange={handleFileChange} />
            </label>

            {/* Ignorovať prvý riadok */}
            <label
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              <input
                checked={skipFirstRow}
                className="h-4 w-4 rounded border-slate-300"
                type="checkbox"
                onChange={(e) => setSkipFirstRow(e.target.checked)}
              />
              Ignorovať prvý riadok
            </label>

            {fileName ? (
              <span className="text-sm" style={{ color: "var(--text-faint)" }}>
                {fileName}
              </span>
            ) : null}

            {/* Ikona nastavení */}
            <div className="relative ml-1" ref={settingsRef}>
              <button
                aria-label="Nastavenia"
                className="flex h-9 w-9 items-center justify-center rounded-md border transition"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-muted)"
                }}
                type="button"
                onClick={() => setShowSettings((v) => !v)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>

              {showSettings && (
                <div
                  className="absolute left-0 top-11 z-50 min-w-52 rounded-lg border p-3 shadow-lg"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)"
                  }}
                >
                  <p
                    className="mb-2 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Nastavenia
                  </p>

                  {/* Dark / Light mode */}
                  <button
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition hover:opacity-80"
                    style={{ color: "var(--text)" }}
                    type="button"
                    onClick={toggleTheme}
                  >
                    {theme === "dark" ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    )}
                    {theme === "dark" ? "Svetlý režim" : "Tmavý režim"}
                  </button>

                  <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />
                  <p className="px-2 text-xs" style={{ color: "var(--text-faint)" }}>v0.2.0</p>
                </div>
              )}
            </div>
          </div>

          {/* Pravá strana – štatistiky */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm sm:min-w-80">
            <Stat label="Riadky" value={stats.total} />
            <Stat label="Spárované" value={stats.matched} />
            <Stat label="Ručne" value={stats.unmatched} />
          </div>
        </div>

        {/* Progress bar */}
        {matchingProgress !== null && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
              <span>Prebieha párovanie…</span>
              <span>{matchingProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${matchingProgress}%`, background: "var(--spruce)" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Akčné tlačidlá + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed"
          disabled={!rows.length || isMatching}
          style={{
            background: rows.length && !isMatching ? "var(--spruce)" : "var(--text-faint)"
          }}
          type="button"
          onClick={runMatching}
        >
          Spustiť párovanie
        </button>
        <button
          className="rounded-md border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          disabled={!isMatching}
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: isMatching ? "var(--text)" : "var(--text-faint)"
          }}
          type="button"
          onClick={stopMatching}
        >
          Zastaviť
        </button>
        <button
          className="rounded-md border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          disabled={!rows.length}
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: rows.length ? "var(--text)" : "var(--text-faint)"
          }}
          type="button"
          onClick={exportCsv}
        >
          Exportovať CSV
        </button>
        <button
          className="rounded-md border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          disabled={!rows.length}
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: rows.length ? "var(--text)" : "var(--text-faint)"
          }}
          type="button"
          onClick={exportJson}
        >
          Exportovať JSON
        </button>

        {/* Filter STATUS */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Filter:</span>
          <select
            className="rounded-md border px-3 py-2 text-sm transition"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text)"
            }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {statusFilter !== "all" && (
            <span className="text-sm" style={{ color: "var(--text-faint)" }}>
              {filteredRows.length} / {rows.length}
            </span>
          )}
        </div>
      </div>

      {/* Tabuľka */}
      <div
        className="overflow-hidden rounded-lg border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow)"
        }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y text-sm" style={{ borderColor: "var(--border)" }}>
            <thead style={{ background: "var(--mist)" }}>
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  #
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  TMDb ID
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Názov
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Rok
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Status
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  ČSFD Link
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Akcia
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr
                    key={row.localId}
                    className="align-top border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {/* Poradové číslo */}
                    <td
                      className="whitespace-nowrap px-4 py-3 text-sm tabular-nums"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {row.orderNumber || "—"}
                    </td>
                    {/* TMDb ID */}
                    <td
                      className="whitespace-nowrap px-4 py-3 font-medium tabular-nums"
                      style={{ color: "var(--text)" }}
                    >
                      {row.tmdbId}
                    </td>
                    {/* Názov */}
                    <td className="min-w-64 px-4 py-3">
                      <div className="font-medium" style={{ color: "var(--text)" }}>
                        {row.title}
                      </div>
                      {row.tmdbLink ? (
                        <a
                          className="mt-1 inline-block text-xs underline-offset-2 hover:underline"
                          href={row.tmdbLink}
                          rel="noreferrer"
                          style={{ color: "var(--text-faint)" }}
                          target="_blank"
                        >
                          TMDb
                        </a>
                      ) : null}
                    </td>
                    {/* Rok */}
                    <td
                      className="whitespace-nowrap px-4 py-3"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.year}
                    </td>
                    {/* Status */}
                    <td className="min-w-40 px-4 py-3">
                      <StatusBadge status={row.status} />
                      {row.message ? (
                        <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                          {row.message}
                        </p>
                      ) : null}
                    </td>
                    {/* ČSFD Link input */}
                    <td className="min-w-80 px-4 py-3">
                      <input
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none transition"
                        placeholder="https://www.csfd.cz/film/..."
                        style={{
                          background: "var(--surface)",
                          borderColor: "var(--border)",
                          color: "var(--text)"
                        }}
                        type="url"
                        value={row.csfdLink}
                        onChange={(e) =>
                          updateRow(row.localId, {
                            csfdLink: e.target.value,
                            status: e.target.value ? "matched" : "idle"
                          })
                        }
                      />
                    </td>
                    {/* Akcia */}
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.csfdLink ? (
                        <a
                          className="font-semibold underline-offset-2 hover:underline"
                          href={row.csfdLink}
                          rel="noreferrer"
                          style={{ color: "var(--spruce)" }}
                          target="_blank"
                        >
                          Otvoriť
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-16 text-center"
                    colSpan={7}
                    style={{ color: "var(--text-faint)" }}
                  >
                    {rows.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-faint)" }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                        </svg>
                        <div>
                          <p className="font-medium text-sm" style={{ color: "var(--text-muted)" }}>Žiadne dáta</p>
                          <p className="text-xs mt-1">Nahraj CSV alebo JSON súbor vo formáte: poradové číslo, TMDb ID, rok, názov, TMDb link.</p>
                        </div>
                      </div>
                    ) : (
                      <span>Žiadne záznamy pre zvolený filter.</span>
                    )}
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
    <div className="rounded-md px-3 py-2" style={{ background: "var(--mist)" }}>
      <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const styles: Record<MatchStatus, { bg: string; color: string }> = {
    matched: { bg: "#d1fae5", color: "#065f46" },
    not_found: { bg: "#fee2e2", color: "#991b1b" },
    error: { bg: "#fef3c7", color: "#92400e" },
    loading: { bg: "#e0f2fe", color: "#0c4a6e" },
    idle: { bg: "var(--surface-2)", color: "var(--text-muted)" }
  };
  const s = styles[status];
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {statusLabels[status]}
    </span>
  );
}
