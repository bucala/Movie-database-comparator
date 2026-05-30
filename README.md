# Filmová databáza - TMDb to ČSFD matcher

Interný Next.js nástroj na načítanie CSV exportu z TMDb, postupné vyhľadanie zodpovedajúcich ČSFD filmov a export obohatených dát.

## Architektúra

```text
app/
  api/
    search-csfd/
      route.ts              # Serverless API route: fetch ČSFD + Cheerio parsing
  globals.css               # Tailwind base štýly
  layout.tsx                # Root layout a metadata
  page.tsx                  # Hlavná obrazovka
components/
  movie-matcher-table.tsx   # Upload CSV, tabuľka, párovanie, manuálne odkazy, export
lib/
  csv.ts                    # Papaparse import/export helpery
  types.ts                  # Zdieľané typy
eslint.config.mjs
next.config.mjs
package.json
postcss.config.mjs
tailwind.config.ts
tsconfig.json
```

## Lokálne spustenie

```powershell
npm install
npm run dev
```

Aplikácia potom beží na:

```text
http://localhost:3000
```

Produkčné overenie:

```powershell
npm run lint
npm run build
```

## Vstupný CSV formát

CSV je bez hlavičky, prípadne môžeš zaškrtnúť ignorovanie prvého riadku.

```text
Poradové číslo, TMDb ID, Rok, Názov filmu, TMDb Link
1715,1567441,2025,Potopa,https://www.themoviedb.org/movie/1567441-potopa
```

## Backend endpoint

Frontend volá:

```http
POST /api/search-csfd
Content-Type: application/json
```

```json
{
  "title": "Potopa",
  "year": "2025"
}
```

Endpoint vyhľadá ČSFD cez:

```text
https://www.csfd.cz/hledat/?q=Potopa%202025
```

Následne cez Cheerio vyberie odkazy obsahujúce `/film/`, vypočíta skóre podľa názvu a roku a vráti najlepšieho kandidáta.

## GitHub push

Tento projekt je pripravený pre repozitár:

```text
https://github.com/bucala/Movie-database-comparator.git
```

Ak remote ešte nie je nastavený:

```powershell
git remote add origin https://github.com/bucala/Movie-database-comparator.git
git branch -M main
git add .
git commit -m "Build Next.js CSFD movie matching app"
git push -u origin main
```

Ak už commit existuje a chceš iba nastaviť remote a pushnúť:

```powershell
git remote add origin https://github.com/bucala/Movie-database-comparator.git
git branch -M main
git push -u origin main
```

## Vercel import

1. Otvor Vercel dashboard.
2. Zvoľ Add New Project.
3. Importuj `bucala/Movie-database-comparator`.
4. Framework nechaj `Next.js`.
5. Build command nechaj `next build`.
6. Install command nechaj `npm install`.
7. Output directory nechaj prázdny.
8. Deploy.

## Zálohovanie podľa pravidla ver ZIP

Pri vytváraní záložných buildov používaj priečinok `ver ZIP` a ZIP archív s verziou v názve.

```powershell
New-Item -ItemType Directory -Force "ver ZIP"
Get-ChildItem -Force -Exclude ".git","node_modules",".next","ver ZIP" | Compress-Archive -DestinationPath "ver ZIP\Movie-database-comparator_v0.1.0.zip" -Force
```

Pre ďalšiu verziu zmeň iba číslo, napríklad:

```text
ver ZIP\Movie-database-comparator_v0.1.1.zip
```
