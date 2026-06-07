import type { MatchStatus } from "@/lib/types";

const statusLabels: Record<MatchStatus, string> = {
  idle: "Čaká",
  loading: "Načítavam...",
  matched: "Spárované",
  not_found: "Nenašlo sa",
  error: "Chyba"
};

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px dashed var(--border-dashed)" }}>
      <div className="text-lg font-bold tabular-nums" style={{ color: "var(--accent)" }}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: MatchStatus }) {
  const styles: Record<MatchStatus, { bg: string; color: string }> = {
    matched: { bg: "var(--badge-success-bg)", color: "var(--badge-success-text)" },
    not_found: { bg: "var(--badge-danger-bg)", color: "var(--badge-danger-text)" },
    error: { bg: "var(--badge-warning-bg)", color: "var(--badge-warning-text)" },
    loading: { bg: "var(--badge-info-bg)", color: "var(--badge-info-text)" },
    idle: { bg: "var(--surface-2)", color: "var(--text-muted)" }
  };
  const s = styles[status];
  return (
    <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: s.bg, color: s.color }}>
      {statusLabels[status]}
    </span>
  );
}

export function RatingBadge({ rating }: { rating: string }) {
  const num = parseInt(rating);
  let bg = "var(--badge-danger-bg)", color = "var(--badge-danger-text)";
  if (!isNaN(num)) {
    if (num >= 70) { bg = "var(--badge-success-bg)"; color = "var(--badge-success-text)"; }
    else if (num >= 50) { bg = "var(--badge-warning-bg)"; color = "var(--badge-warning-text)"; }
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums" style={{ background: bg, color }}>
      {rating}
    </span>
  );
}
