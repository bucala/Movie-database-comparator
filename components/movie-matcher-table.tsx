"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  downloadTextFile,
  movieRowsToCsv,
  parseMovieCsv,
  parseMovieJson,
  wait
} from "@/lib/csv";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";
import type { CsfdSearchResponse, MovieRow, RatingFilter, StatusFilter } from "@/lib/types";
import { RatingBadge, Stat, StatusBadge } from "@/components/badges";
import { EmptyStateIcon, GearIcon, MoonIcon, PencilIcon, SunIcon, UploadIcon } from "@/components/icons";

const MATCH_DELAY_MS = 950;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Všetky" },
  { value: "matched", label: "Spárované" },
  { value: "not_found", label: "Nenašlo sa" },
  { value: "idle", label: "Čaká" },
  { value: "error", label: "Chyba" },
  { value: "loading", label: "Načítavam" }
];

const RATING_FILTER_OPTIONS: { value: RatingFilter; label: string }[] = [
  { value: "all", label: "Všetky" },
  { value: "none", label: "Bez hodnotenia" },
  { value: "high", label: "≥ 70 %" },
  { value: "mid", label: "50 – 69 %" },
  { value: "low", label: "< 50 %" }
];

function parseRatingNum(r: string): number | null {
  const n = parseInt(r);
  return isNaN(n) ? null : n;
}

function matchesRatingFilter(row: MovieRow, filter: RatingFilter): boolean {
  if (filter === "all") return true;
  const n = parseRatingNum(row.csfdRating);
  if (filter === "none") return n === null;
  if (n === null) return false;
  if (filter === "high") return n >= 70;
  if (filter === "mid") return n >= 50 && n < 70;
  if (filter === "low") return n < 50;
  return true;
}

export function MovieMatcherTable() {
  const [rows, setRows] = useState<MovieRow[]>([]);
  const [skipFirstRow, setSkipFirstRow] = useState(false);
  const [ignoreRating, setIgnoreRating] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [apiToken, setApiToken] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  // Oddelený lokálny draft — rows sa nemenia počas písania
  const [editingRatingId, setEditingRatingId] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState<string>("");

  const shouldStopRef = useRef(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTheme(getInitialTheme()); }, []);

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

  // Otvorí edit pre daný riadok, nastaví draft na aktuálnu hodnotu (bez %)
  function startEditRating(localId: string, currentRating: string) {
    setEditingRatingId(localId);
    setDraftRating(currentRating.replace("%", ""));
  }

  // Zapíše draft do rows a zatvorí edit
  function commitRating(localId: string) {
    const raw = draftRating.replace(/[^0-9]/g, "").slice(0, 3);
    const num = parseInt(raw);
    const val = raw === "" ? "" : (num > 100 ? "100%" : `${num}%`);
    updateRow(localId, { csfdRating: val });
    setEditingRatingId(null);
    setDraftRating("");
  }

  // Zruší edit bez zmeny (Escape)
  function cancelEditRating() {
    setEditingRatingId(null);
    setDraftRating("");
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
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!ignoreRating && ratingFilter !== "all" && !matchesRatingFilter(r, ratingFilter)) return false;
      return true;
    });
  }, [rows, statusFilter, ratingFilter, ignoreRating]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      const parsedRows = ext === "json"
        ? await parseMovieJson(file)
        : await parseMovieCsv(file, skipFirstRow);
      setRows(parsedRows);
      setFileName(file.name);
      setStatusFilter("all");
      setRatingFilter("all");
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
        const headers: Record<string, string> = { "content-type": "application/json" };

        if (apiToken.trim()) {
          headers["x-api-token"] = apiToken.trim();
        }

        const response = await fetch("/api/search-csfd", {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: current.title,
            year: current.year,
            skipRating: ignoreRating
          })
        });
        const payload = (await response.json()) as CsfdSearchResponse;

        if (payload.found && payload.url) {
          updateRow(row.localId, {
            csfdLink: payload.url,
            csfdRating: ignoreRating ? "" : (payload.rating ?? ""),
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
    setRows((curr) => curr.map((row) => row.localId === localId ? { ...row, ...patch } : row));
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
      csfdRating: row.csfdRating,
      status: row.status
    }));
    downloadTextFile(
      "filmy-s-csfd-linkami.json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }

  const matchingProgress = isMatching ? progress : null;
  const showRatingCol = !ignoreRating;
  const colSpanTotal = showRatingCol ? 8 : 7;

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="rounded-lg border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Ľavá strana */}
          <div className="flex flex-wrap items-center gap-3">

            {/* Upload CSV */}
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition"
              style={{ background: "var(--ink)" }}
              title="Nahrať CSV súbor"
            >
              <UploadIcon />
              Upload CSV
              <input accept=".csv,text/csv" className="sr-only" type="file" onChange={handleFileChange} />
            </label>

            {/* Import JSON */}
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold transition"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              title="Importovať uložený JSON súbor"
            >
              <UploadIcon />
              Import JSON
              <input accept=".json,application/json" className="sr-only" type="file" onChange={handleFileChange} />
            </label>

            {/* Ignorovať prvý riadok */}
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
              <input
                checked={skipFirstRow}
                className="h-4 w-4 rounded border-slate-300"
                type="checkbox"
                onChange={(e) => setSkipFirstRow(e.target.checked)}
              />
              Ignorovať prvý riadok
            </label>

            {fileName ? <span className="text-sm" style={{ color: "var(--text-faint)" }}>{fileName}</span> : null}

            <input
              className="min-w-56 rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder="Interný API token"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              type="password"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
            />

            {/* Ikona nastavení */}
            <div className="relative ml-1" ref={settingsRef}>
              <button
                aria-label="Nastavenia"
                className="flex h-9 w-9 items-center justify-center rounded-md border transition"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                type="button"
                onClick={() => setShowSettings((v) => !v)}
              >
                <GearIcon />
              </button>

              {showSettings && (
                <div
                  className="absolute left-0 top-11 z-50 min-w-56 rounded-lg border p-3 shadow-lg"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                    Nastavenia
                  </p>

                  {/* Dark / Light mode */}
                  <button
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition hover:opacity-80"
                    style={{ color: "var(--text)" }}
                    type="button"
                    onClick={toggleTheme}
                  >
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    {theme === "dark" ? "Svetlý režim" : "Tmavý režim"}
                  </button>

                  <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />

                  {/* Ignorovať hodnotenie */}
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:opacity-80"
                    style={{ color: "var(--text)" }}
                  >
                    <input
                      checked={ignoreRating}
                      className="h-4 w-4 rounded border-slate-300"
                      type="checkbox"
                      onChange={(e) => {
                        setIgnoreRating(e.target.checked);
                        if (e.target.checked) setRatingFilter("all");
                      }}
                    />
                    Ignorovať hodnotenie
                  </label>

                  <div className="my-2 border-t" style={{ borderColor: "var(--border)" }} />
                  <p className="px-2 text-xs" style={{ color: "var(--text-faint)" }}>v0.4.2</p>
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

      {/* Akčné tlačidlá + filtre */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed"
          disabled={!rows.length || isMatching}
          style={{ background: rows.length && !isMatching ? "var(--spruce)" : "var(--text-faint)" }}
          type="button"
          onClick={runMatching}
        >
          Spustiť párovanie
        </button>
        <button
          className="rounded-md border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          disabled={!isMatching}
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: isMatching ? "var(--text)" : "var(--text-faint)" }}
          type="button"
          onClick={stopMatching}
        >
          Zastaviť
        </button>
        <button
          className="rounded-md border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          disabled={!rows.length}
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: rows.length ? "var(--text)" : "var(--text-faint)" }}
          type="button"
          onClick={exportCsv}
        >
          Exportovať CSV
        </button>
        <button
          className="rounded-md border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          disabled={!rows.length}
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: rows.length ? "var(--text)" : "var(--text-faint)" }}
          type="button"
          onClick={exportJson}
        >
          Exportovať JSON
        </button>

        {/* Filtre – vpravo */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>Stav:</span>
          <select
            className="rounded-md border px-3 py-2 text-sm transition"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {!ignoreRating && (
            <>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Hodnotenie:</span>
              <select
                className="rounded-md border px-3 py-2 text-sm transition"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
              >
                {RATING_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </>
          )}

          {(statusFilter !== "all" || ratingFilter !== "all") && (
            <span className="text-sm" style={{ color: "var(--text-faint)" }}>
              {filteredRows.length} / {rows.length}
            </span>
          )}
        </div>
      </div>

      {/* Tabuľka */}
      <div
        className="overflow-hidden rounded-lg border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y text-sm" style={{ borderColor: "var(--border)" }}>
            <thead style={{ background: "var(--mist)" }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>TMDb ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Názov</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Rok</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>ČSFD Link</th>
                {showRatingCol && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Hodnotenie</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Akcia</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={row.localId} className="align-top border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums" style={{ color: "var(--text-faint)" }}>{row.orderNumber || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums" style={{ color: "var(--text)" }}>{row.tmdbId}</td>
                    <td className="min-w-64 px-4 py-3">
                      <div className="font-medium" style={{ color: "var(--text)" }}>{row.title}</div>
                      {row.tmdbLink ? (
                        <a className="mt-1 inline-block text-xs underline-offset-2 hover:underline" href={row.tmdbLink} rel="noreferrer" style={{ color: "var(--text-faint)" }} target="_blank">TMDb</a>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3" style={{ color: "var(--text-muted)" }}>{row.year}</td>
                    <td className="min-w-40 px-4 py-3">
                      <StatusBadge status={row.status} />
                      {row.message ? <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{row.message}</p> : null}
                    </td>
                    <td className="min-w-80 px-4 py-3">
                      <input
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none transition"
                        placeholder="https://www.csfd.cz/film/..."
                        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                        type="url"
                        value={row.csfdLink}
                        onChange={(e) => updateRow(row.localId, { csfdLink: e.target.value, status: e.target.value ? "matched" : "idle" })}
                      />
                    </td>
                    {showRatingCol && (
                      <td className="whitespace-nowrap px-4 py-3">
                        {editingRatingId === row.localId ? (
                          <input
                            autoFocus
                            className="w-20 rounded-md border px-2 py-1 text-center text-sm font-bold outline-none transition"
                            placeholder="0-100"
                            style={{ background: "var(--surface)", borderColor: "var(--spruce)", color: "var(--text)" }}
                            type="text"
                            value={draftRating}
                            onChange={(e) => {
                              // Len číslice, max 3 znaky — ukladá sa do draftRating, NIE do rows
                              setDraftRating(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                            }}
                            onBlur={() => commitRating(row.localId)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRating(row.localId);
                              if (e.key === "Escape") cancelEditRating();
                            }}
                          />
                        ) : (
                          <button
                            className="group flex items-center gap-1.5 rounded px-1 py-0.5 transition hover:opacity-80"
                            title="Klikni pre úpravu hodnotenia"
                            type="button"
                            onClick={() => startEditRating(row.localId, row.csfdRating)}
                          >
                            {row.csfdRating ? (
                              <RatingBadge rating={row.csfdRating} />
                            ) : (
                              <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>
                            )}
                            <PencilIcon />
                          </button>
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.csfdLink ? (
                        <a className="font-semibold underline-offset-2 hover:underline" href={row.csfdLink} rel="noreferrer" style={{ color: "var(--spruce)" }} target="_blank">Otvoriť</a>
                      ) : (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-16 text-center" colSpan={colSpanTotal} style={{ color: "var(--text-faint)" }}>
                    {rows.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <EmptyStateIcon />
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

