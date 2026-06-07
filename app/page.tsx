import { MovieMatcherTable } from "@/components/movie-matcher-table";

function FilmIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/>
      <line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/>
      <line x1="2" y1="17" x2="7" y2="17"/>
      <line x1="17" y1="7" x2="22" y2="7"/>
      <line x1="17" y1="17" x2="22" y2="17"/>
    </svg>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ color: "var(--spruce)" }}>{icon}</span>
      <span
        className="whitespace-nowrap text-xs font-bold uppercase tracking-widest"
        style={{ color: "var(--spruce)", letterSpacing: "0.15em" }}
      >
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <SectionHeader icon={<FilmIcon />} label="Párovanie TMDb s ČSFD" />

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold sm:text-3xl" style={{ color: "var(--ink)" }}>
            Filmová databáza
          </h1>
          <p className="max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Nahraj CSV alebo JSON, spusti postupné vyhľadávanie a vyexportuj
            obohatený súbor s ČSFD odkazmi a hodnoteniami.
          </p>
        </header>

        <MovieMatcherTable />
      </section>
    </main>
  );
}
