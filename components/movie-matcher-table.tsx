"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { downloadTextFile, movieRowsToCsv, parseMovieCsv } from "@/lib/csv";
import type { CsfdCandidate, CsfdSearchResponse, MatchStatus, MovieRow } from "@/lib/types";

const MATCH_DELAY_MS = 950;

type StatusFilter = "all" | MatchStatus | "open";

const statusLabels: Record<MatchStatus, string> = {
  idle: "Čaká",
  loading: "Načítavam...",
  matched: "Spárované",
  review: "Na kontrolu",
  not_found: "Nenašlo sa",
  invalid: "Nevalidné",
  error: "Chyba"
};

const filterLabels: Array<{ label: string; value: StatusFilter }> = [
  { label: "Všetko", value: "all" },
  { label: "Otvorené", value: "open" },
  { label: "Spárované", value: "matched" },
  { label: "Na kontrolu", value: "review" },
  { label: "Nenašlo sa", value: "not_found" },
  { label: "Chyby", value: "error" },
  { label: "Nevalidné", value: "invalid" }
];

export function MovieMatcherTable() {
  const [rows, setRows] = useState<MovieRow[]>([]);
  const [skipFirstRow, setSkipFirstRow] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [apiToken, setApiToken] = useState("");
  const shouldStopRef = useRef(false);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "matched") acc.matched += 1;
        if (row.status === "review") acc.review += 1;
        if (row.status === "not_found" || row.status === "error") acc.unmatched += 1;
        if (row.status === "invalid") acc.invalid += 1;
        if (row.status !== "idle" && row.status !== "invalid") acc.processed += 1;
        return acc;
      },
      { total: 0, matched: 0, review: 0, unmatched: 0, invalid: 0, processed: 0 }
    );
  }, [rows]);

  const matchableRows = useMemo(
    () => rows.filter((row) => row.status !== "invalid").length,
    [rows]
  );
  const progress = matchableRows ? Math.round((stats.processed / matchableRows) * 100) : 0;
  const visibleRows = useMemo(() => rows.filter((row) => matchesFilter(row, filter)), [rows, filter]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const result = await parseMovieCsv(file, skipFirstRow);
    setRows(result.rows);
    setWarnings([
      ...(result.skippedHeader ? ["Prvý riadok bol rozpoznaný alebo označený ako hlavička."] : []),
      ...result.warnings
    ]);
    setFileName(file.name);
    setFilter("all");
  }

  async function runMatching(onlyOpen = false) {
    shouldStopRef.current = false;
    setIsMatching(true);

    const targetRows = onlyOpen ? rows.filter(shouldMatchRow) : rows.filter((row) => row.status !== "invalid");

    for (const row of targetRows) {
      if (shouldStopRef.current) {
        break;
      }

      await matchRow(row.localId);
      await wait(MATCH_DELAY_MS);
    }

    setIsMatching(false);
  }

  async function matchRow(localId: string) {
    const current = getRow(localId);

    if (!current || current.status === "invalid" || !current.title) {
      return;
    }

    updateRow(localId, {
      status: "loading",
      message: undefined,
      candidates: [],
      matchScore: undefined,
      matchedTitle: undefined,
      matchedYear: undefined
    });

    try {
      const headers: Record<string, string> = { "content-type": "application/json" };

      if (apiToken.trim()) {
        headers["x-api-token"] = apiToken.trim();
      }

      const response = await fetch("/api/search-csfd", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: current.title, year: current.year })
      });
      const payload = (await response.json()) as CsfdSearchResponse;

      if (!response.ok) {
        updateRow(localId, {
          status: response.status === 401 ? "error" : "not_found",
          message: payload.error ?? "Vyhľadávanie zlyhalo."
        });
        return;
      }

      applySearchPayload(localId, payload);
    } catch (error) {
      updateRow(localId, {
        status: "error",
        message: error instanceof Error ? error.message : "Vyhľadávanie zlyhalo."
      });
    }
  }

  function applySearchPayload(localId: string, payload: CsfdSearchResponse) {
    const candidates = payload.candidates ?? [];

    if (payload.found && payload.url && !payload.ambiguous) {
      updateRow(localId, {
        csfdLink: payload.url,
        status: "matched",
        matchedBy: "auto",
        matchScore: payload.score,
        matchedTitle: payload.title,
        matchedYear: payload.year ?? null,
        candidates,
        message: payload.cached ? "Nájdené z cache." : "Automaticky spárované."
      });
      return;
    }

    if (payload.found && payload.url && payload.ambiguous) {
      updateRow(localId, {
        csfdLink: "",
        status: "review",
        matchedBy: "none",
        matchScore: payload.score,
        matchedTitle: payload.title,
        matchedYear: payload.year ?? null,
        candidates,
        message: "Viac podobných kandidátov. Vyber správny ČSFD link."
      });
      return;
    }

    updateRow(localId, {
      status: candidates.length ? "review" : "not_found",
      matchedBy: "none",
      candidates,
      message: payload.error ?? (candidates.length ? "Skontroluj kandidátov." : "Zadaj ČSFD link manuálne.")
    });
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

  function applyManualLink(localId: string, value: string) {
    updateRow(localId, {
      csfdLink: value,
      status: value ? "matched" : "not_found",
      matchedBy: value ? "manual" : "none",
      message: value ? "Ručne doplnené." : "Zadaj ČSFD link manuálne."
    });
  }

  function applyCandidate(localId: string, candidate: CsfdCandidate) {
    updateRow(localId, {
      csfdLink: candidate.url,
      status: "matched",
      matchedBy: "candidate",
      matchScore: candidate.score,
      matchedTitle: candidate.title,
      matchedYear: candidate.year,
      message: "Potvrdené z kandidátov."
    });
  }

  function exportCsv() {
    downloadTextFile("filmy-s-csfd-linkami.csv", movieRowsToCsv(rows), "text/csv;charset=utf-8");
  }

  function exportJson() {
    const payload = rows.map((row) => ({
      rowNumber: row.rowNumber,
      orderNumber: row.orderNumber,
      tmdbId: row.tmdbId,
      year: row.year,
      title: row.title,
      tmdbLink: row.tmdbLink,
      csfdLink: row.csfdLink,
      status: row.status,
      matchedBy: row.matchedBy,
      matchScore: row.matchScore,
      matchedTitle: row.matchedTitle,
      matchedYear: row.matchedYear,
      candidates: row.candidates,
      message: row.message
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-3">
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

            <label className="flex max-w-xl flex-col gap-1 text-sm text-slate-600">
              Interný API token
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-teal-100"
                placeholder="Vyplň iba ak je na Verceli nastavený CSFD_API_TOKEN"
                type="password"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5 xl:min-w-[520px]">
            <Stat label="Riadky" value={stats.total} />
            <Stat label="Spárované" value={stats.matched} />
            <Stat label="Kontrola" value={stats.review} />
            <Stat label="Ručne" value={stats.unmatched} />
            <Stat label="Nevalidné" value={stats.invalid} />
          </div>
        </div>

        {rows.length ? (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
              <span>Progress párovania</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-spruce transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {warnings.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Kontrola CSV</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.slice(0, 8).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {warnings.length > 8 ? <p className="mt-2">A ďalších {warnings.length - 8} upozornení.</p> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterLabels.map((item) => (
            <button
              key={item.value}
              className={clsx(
                "rounded-md border px-3 py-2 text-sm font-semibold transition",
                filter === item.value
                  ? "border-spruce bg-spruce text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              )}
              type="button"
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-md bg-spruce px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!rows.length || isMatching}
            type="button"
            onClick={() => runMatching(false)}
          >
            Spustiť párovanie
          </button>
          <button
            className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!rows.some(shouldMatchRow) || isMatching}
            type="button"
            onClick={() => runMatching(true)}
          >
            Spustiť otvorené
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
            Export CSV
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            disabled={!rows.length}
            type="button"
            onClick={exportJson}
          >
            Export JSON
          </button>
        </div>
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
                <th className="px-4 py-3">Kandidáti</th>
                <th className="px-4 py-3">Akcia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <tr key={row.localId} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                      {row.tmdbId || "-"}
                    </td>
                    <td className="min-w-64 px-4 py-3">
                      <div className="font-medium text-slate-900">{row.title || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">Riadok {row.rowNumber}</div>
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
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.year || "-"}</td>
                    <td className="min-w-44 px-4 py-3">
                      <StatusBadge status={row.status} />
                      {row.matchScore ? (
                        <p className="mt-1 text-xs text-slate-500">Skóre {row.matchScore}</p>
                      ) : null}
                      {row.message ? <p className="mt-1 text-xs text-slate-500">{row.message}</p> : null}
                    </td>
                    <td className="min-w-80 px-4 py-3">
                      <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-spruce focus:ring-2 focus:ring-teal-100"
                        placeholder="https://www.csfd.cz/film/..."
                        type="url"
                        value={row.csfdLink}
                        onChange={(event) => applyManualLink(row.localId, event.target.value)}
                      />
                    </td>
                    <td className="min-w-80 px-4 py-3">
                      <CandidateList
                        candidates={row.candidates}
                        selectedUrl={row.csfdLink}
                        onPick={(candidate) => applyCandidate(row.localId, candidate)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                          disabled={isMatching || row.status === "invalid"}
                          type="button"
                          onClick={() => matchRow(row.localId)}
                        >
                          Overiť znova
                        </button>
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
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={7}>
                    {rows.length
                      ? "Filter nemá žiadne riadky."
                      : "Nahraj CSV súbor vo formáte: poradové číslo, TMDb ID, rok, názov, TMDb link."}
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

function CandidateList({
  candidates,
  selectedUrl,
  onPick
}: {
  candidates: CsfdCandidate[];
  selectedUrl: string;
  onPick: (candidate: CsfdCandidate) => void;
}) {
  if (!candidates.length) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {candidates.slice(0, 5).map((candidate) => (
        <div key={candidate.url} className="rounded-md border border-slate-200 p-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-slate-900">
                {candidate.title}
                {candidate.year ? ` (${candidate.year})` : ""}
              </div>
              <a
                className="text-xs text-slate-500 underline-offset-2 hover:underline"
                href={candidate.url}
                rel="noreferrer"
                target="_blank"
              >
                {candidate.url}
              </a>
            </div>
            <button
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                selectedUrl === candidate.url
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
              type="button"
              onClick={() => onPick(candidate)}
            >
              {selectedUrl === candidate.url ? "Vybrané" : "Použiť"}
            </button>
          </div>
          <div className="mt-1 text-xs text-slate-500">Skóre {candidate.score}</div>
        </div>
      ))}
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
        status === "review" && "bg-violet-50 text-violet-700",
        status === "not_found" && "bg-red-50 text-ember",
        status === "invalid" && "bg-rose-50 text-rose-700",
        status === "error" && "bg-amber-50 text-amber-700",
        status === "loading" && "bg-sky-50 text-sky-700",
        status === "idle" && "bg-slate-100 text-slate-600"
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

function shouldMatchRow(row: MovieRow) {
  return (
    row.status !== "invalid" &&
    row.status !== "loading" &&
    (!row.csfdLink || row.status === "review" || row.status === "not_found" || row.status === "error")
  );
}

function matchesFilter(row: MovieRow, filter: StatusFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return shouldMatchRow(row);
  }

  return row.status === filter;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
