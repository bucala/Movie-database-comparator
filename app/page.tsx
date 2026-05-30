import { MovieMatcherTable } from "@/components/movie-matcher-table";

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-spruce">
            Filmová databáza
          </p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold text-ink sm:text-4xl">
                Párovanie TMDb exportu s ČSFD odkazmi
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Nahraj CSV z Excelu, spusti postupné vyhľadávanie na serverovej
                API route a vyexportuj obohatený súbor s novým stĺpcom ČSFD Link.
              </p>
            </div>
          </div>
        </header>

        <MovieMatcherTable />
      </section>
    </main>
  );
}
