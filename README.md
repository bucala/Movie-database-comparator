# 🎬 TMDb → ČSFD Matcher

> Interný Next.js nástroj na párovanie exportu z TMDb s ČSFD odkazmi. Nahraj CSV alebo JSON, spusti automatické vyhľadávanie a exportuj obohatený dataset.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss) ![License](https://img.shields.io/badge/license-private-lightgrey)

---

## ✨ Funkcie

| Funkcia | Popis |
|---|---|
| 📥 Import CSV | Nahratie TMDb exportu vo formáte `.csv` |
| 📥 Import JSON | Obnovenie predchádzajúcej session z exportovaného `.json` |
| 🔍 Auto-párovanie | Postupné vyhľadávanie ČSFD odkazov cez server-side scraping |
| ✏️ Manuálna oprava | Každý ČSFD link je editovateľný priamo v tabuľke |
| 🔎 Filter statusov | Filtrovanie riadkov podľa stavu (Spárované / Nenašlo sa / Chyba…) |
| 📊 Progress bar | Vizuálny priebeh párovacieho procesu |
| 📤 Export CSV | Export s UTF-8 BOM (správna diakritika v Exceli) |
| 📤 Export JSON | Export pre zálohu a ďalší import |
| 🌙 Dark / Light mode | Prepínanie témy cez ikonu nastavení, uložené v localStorage |
| # Stĺpec poradia | Zobrazenie pôvodného poradového čísla z importu |

---

## 🗂️ Štruktúra projektu

```text
app/
  api/
    search-csfd/
      route.ts              # Serverless API: fetch ČSFD + Cheerio scraping
  globals.css               # Tailwind + CSS premenné pre light/dark mode
  layout.tsx                # Root layout, metadata, anti-flash theme script
  page.tsx                  # Hlavná stránka
components/
  movie-matcher-table.tsx   # Hlavný UI komponent (tabuľka, import, export, filter, settings)
lib/
  csv.ts                    # CSV + JSON import/export helpery, wait()
  theme.ts                  # Logika dark/light mode
  types.ts                  # Zdieľané TypeScript typy
```

---

## 🚀 Lokálne spustenie

```powershell
npm install
npm run dev
```

Aplikácia beží na: **http://localhost:3000**

Pred pushom:
```powershell
npm run lint
npm run build
```

---

## 📋 Vstupný CSV formát

CSV je bez hlavičky (alebo zaškrtni *Ignorovať prvý riadok*):

```text
Poradové číslo, TMDb ID, Rok, Názov filmu, TMDb Link
1715,1567441,2025,Potopa,https://www.themoviedb.org/movie/1567441-potopa
```

---

## 🔌 Backend API

```http
POST /api/search-csfd
Content-Type: application/json

{ "title": "Potopa", "year": "2025" }
```

Endpoint vyhľadá `https://www.csfd.cz/hledat/?q=Potopa+2025`, sparsuje výsledky cez Cheerio, vypočíta Levenshtein skóre a vráti najlepšieho kandidáta. Rok je validovaný (1888–2030). Request má 8s timeout.

**Response:**
```json
{
  "found": true,
  "url": "https://www.csfd.cz/film/123456-potopa/",
  "title": "Potopa",
  "year": "2025",
  "candidates": [...]
}
```

---

## ☁️ Vercel deploy

1. Otvor **Vercel Dashboard → Add New Project**
2. Importuj `bucala/Movie-database-comparator`
3. Framework: `Next.js` | Build: `next build` | Install: `npm install`
4. Deploy ✓

---

## 💾 Zálohovanie (ver ZIP)

```powershell
New-Item -ItemType Directory -Force "ver ZIP"
Get-ChildItem -Force -Exclude ".git","node_modules",".next","ver ZIP" |
  Compress-Archive -DestinationPath "ver ZIP\Movie-database-comparator_v0.2.0.zip" -Force
```

---

## 📝 Changelog

### v0.2.0 — 2026-05-30
- ✨ **Import JSON** — obnova session z predchádzajúceho exportu
- ✨ **Filter statusov** — filtrovanie tabuľky podľa stavu párovanie
- ✨ **Stĺpec poradového čísla** — zobrazenie `#` z importu v tabuľke
- ✨ **Dark / Light mode** — prepínač v ikone nastavení, persistent v localStorage
- ✨ **Progress bar** — vizuálny priebeh párovacieho procesu
- 🐛 **Fix: localId kolízia** — náhodný suffix zabraňuje duplikátom pri rovnakom súbore
- 🐛 **Fix: CSV export diakritika** — pridaný UTF-8 BOM pre správne zobrazenie v Exceli
- 🐛 **Fix: status po zmazaní linku** — nastavuje sa `idle` namiesto `not_found`
- 🔧 **Scraper: selektory** — hľadanie obmedzené na sekcie výsledkov, nie celú stránku
- 🔧 **Scraper: URL normalizácia** — čistejší path bez `/recenze/` suffix
- 🔧 **Scraper: validácia roku** — rok musí byť 1888–2030
- 🔧 **Scraper: timeout** — 8s `AbortSignal.timeout` pre stabilitu
- 🔧 **`wait()` helper** — presunutý do `lib/csv.ts`
- 🔧 **OG/SEO metadata** — doplnené do `layout.tsx`
- 🔧 **Empty state** — ikonka + popis namiesto holého textu

### v0.1.0 — 2026-05-01
- 🎉 Prvé vydanie
- Import CSV (PapaParse)
- Auto-párovanie TMDb → ČSFD (Cheerio + Levenshtein scoring)
- Manuálna editácia ČSFD linkov
- Export CSV a JSON
- Štatistiky (Riadky / Spárované / Ručne)
