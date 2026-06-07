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

  function startEditRating(localId: string, currentRating: string) {
    setEditingRatingId(localId);
    setDraftRating(currentRating.replace("%", ""));
  }

  function commitRating(localId: string) {
    const raw = draftRating.replace(/[^0-9]/g, "").slice(0, 3);
    const num = parseInt(raw);
    const val = raw === "" ? "" : (num > 100 ? "100%" : `${num}%`);
    updateRow(localId, { csfdRating: val });
    setEditingRatingId(null);
    setDraftRating("");
  }

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
      {/* Toolbar card */}
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
      >
        {/* Subsection label */}
        <p
          className="mb-4 text-[11px] font-bold uppercase tracking-widest"
          style={{ color: "var(--text-faint)", borderBottom: "1px dashed var(--border-dashed)", paddingBottom: "10px" }}
        >
          {fileName ? `Import — ${fileName}` : "Import súboru"}
        </p>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Upload CSV — golden primary CTA */}
            <label
              className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg px-5 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
              title="Nahrať CSV súbor"
            >
              <UploadIcon />
              Upload CSV
              <input accept=".csv,text/csv" className="sr-only" type="file" onChange={handleFileChange} />
            </label>

            {/* Import JSON — outlined */}
            <label
              className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg border px-5 py-3 text-sm font-semibold uppercase tracking-wide transition hover:brightness-110"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
              title="Importovať uložený JSON súbor"
            >
              <UploadIcon />
              Import JSON
              <input accept=".json,application/json" className="sr-only" type="file" onChange={handleFileChange} />
            </label>

            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
              <input
                checked={skipFirstRow}
                className="h-4 w-4 rounded"
                type="checkbox"
                style={{ accentColor: "var(--accent)" }}
                onChange={(e) => setSkipFirstRow(e.target.checked)}
              />
              Ignorovať prvý riadok
            </label>

            <input
              className="min-w-48 rounded-lg border px-3 py-2.5 text-sm outline-none transition"
              placeholder="Interný API token"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
              type="password"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
            />

            {/* Settings */}
            <div className="relative ml-1" ref={settingsRef}>
              <button
                aria-label="Nastavenia"
                className="flex h-10 w-10 items-center justify-center rounded-lg border transition hover:brightness-110"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                type="button"
                onClick={() => setShowSettings((v) => !v)}
              >
                <GearIcon />
              </button>

              {showSettings && (
                <div
                  className="absolute left-0 top-12 z-50 min-w-56 rounded-xl border p-3 shadow-xl"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
                    Nastavenia
                  </p>

                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition hover:opacity-80"
                    style={{ color: "var(--text)" }}
                    type="button"
                    onClick={toggleTheme}
                  >
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    {theme === "dark" ? "Svetlý režim" : "Tmavý režim"}
                  </button>

                  <div className="my-2" style={{ borderTop: "1px dashed var(--border-dashed)" }} />

                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm hover:opacity-80"
                    style={{ color: "var(--text)" }}
                  >
                    <input
                      checked={ignoreRating}
                      className="h-4 w-4 rounded"
                      type="checkbox"
                      style={{ accentColor: "var(--accent)" }}
                      onChange={(e) => {
                        setIgnoreRating(e.target.checked);
                        if (e.target.checked) setRatingFilter("all");
                      }}
                    />
                    Ignorovať hodnotenie
                  </label>

                  <div className="my-2" style={{ borderTop: "1px dashed var(--border-dashed)" }} />
                  <p className="px-2.5 text-xs" style={{ color: "var(--text-faint)" }}>v0.4.2</p>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm sm:min-w-80">
            <Stat label="Riadky" value={stats.total} />
            <Stat label="Spárované" value={stats.matched} />
            <Stat label="Ručne" value={stats.unmatched} />
          </div>
        </div>

        {/* Progress bar */}
        {matchingProgress !== null && (
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
              <span>Prebieha párovanie…</span>
              <span>{matchingProgress} %</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${matchingProgress}%`, background: "var(--accent)" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action buttons + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg px-5 py-2.5 text-sm font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!rows.length || isMatching}
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          type="button"
          onClick={runMatching}
        >
          Spustiť párovanie
        </button>
        <button
          className="rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!isMatching}
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          type="button"
          onClick={stopMatching}
        >
          Zastaviť
        </button>
        <button
          className="rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!rows.length}
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          type="button"
          onClick={exportCsv}
        >
          Exportovať CSV
        </button>
        <button
          className="rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!rows.length}
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          type="button"
          onClick={exportJson}
        >
          Exportovať JSON
        </button>

        {/* Filters */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Stav:</span>
          <select
            className="rounded-lg border px-3 py-2 text-sm transition"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {!ignoreRating && (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Hodnotenie:</span>
              <select
                className="rounded-lg border px-3 py-2 text-sm transition"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
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
            <span className="text-sm tabular-nums" style={{ color: "var(--text-faint)" }}>
              {filteredRows.length} / {rows.length}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ borderBottom: "1px dashed var(--border-dashed)" }}>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>#</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>TMDb ID</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>Názov</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>Rok</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>Status</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>ČSFD Link</th>
                {showRatingCol && (
                  <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>Hodnotenie</th>
                )}
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)", background: "var(--mist)" }}>Akcia</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row, i) => (
                  <tr
                    key={row.localId}
                    className="align-top"
                    style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums" style={{ color: "var(--text-faint)" }}>{row.orderNumber || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums" style={{ color: "var(--text)" }}>{row.tmdbId}</td>
                    <td className="min-w-64 px-4 py-3.5">
                      <div className="font-medium" style={{ color: "var(--text)" }}>{row.title}</div>
                      {row.tmdbLink ? (
                        <a className="mt-1 inline-block text-xs underline-offset-2 hover:underline" href={row.tmdbLink} rel="noreferrer" style={{ color: "var(--accent)" }} target="_blank">TMDb</a>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums" style={{ color: "var(--text-muted)" }}>{row.year}</td>
                    <td className="min-w-40 px-4 py-3.5">
                      <StatusBadge status={row.status} />
                      {row.message ? <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{row.message}</p> : null}
                    </td>
                    <td className="min-w-80 px-4 py-3.5">
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition"
                        placeholder="https://www.csfd.cz/film/..."
                        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                        type="url"
                        value={row.csfdLink}
                        onChange={(e) => updateRow(row.localId, { csfdLink: e.target.value, status: e.target.value ? "matched" : "idle" })}
                      />
                    </td>
                    {showRatingCol && (
                      <td className="whitespace-nowrap px-4 py-3.5">
                        {editingRatingId === row.localId ? (
                          <input
                            autoFocus
                            className="w-20 rounded-lg border px-2 py-1 text-center text-sm font-bold outline-none transition"
                            placeholder="0-100"
                            style={{ background: "var(--surface-2)", borderColor: "var(--accent)", color: "var(--text)" }}
                            type="text"
                            value={draftRating}
                            onChange={(e) => {
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
                    <td className="whitespace-nowrap px-4 py-3.5">
                      {row.csfdLink ? (
                        <a className="font-semibold underline-offset-2 hover:underline" href={row.csfdLink} rel="noreferrer" style={{ color: "var(--accent)" }} target="_blank">Otvoriť</a>
                      ) : (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-20 text-center" colSpan={colSpanTotal} style={{ color: "var(--text-faint)" }}>
                    {rows.length === 0 ? (
                      <div className="flex flex-col items-center gap-4">
                        <EmptyStateIcon />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Žiadne dáta</p>
                          <p className="mt-1 text-xs">Nahraj CSV alebo JSON súbor vo formáte: poradové číslo, TMDb ID, rok, názov, TMDb link.</p>
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
