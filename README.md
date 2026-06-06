# 🎬 Movie Database Comparator

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Version](https://img.shields.io/badge/verzia-0.4.0-brightgreen)](#changelog)

Webová aplikácia na párovanie TMDb exportu s ČSFD odkazmi a hodnoteniami. Nahraj CSV z Excelu, spusti automatické vyhľadávanie a získaj ČSFD linky aj % hodnotenia filmov v jednom exporte.

Odporúčaný deployment model: samostatná interná Vercel aplikácia napojená na tento GitHub repozitár. Hlavná Filmová databáza na ňu môže odkazovať ako na admin nástroj; matcher jadro je oddelené v `lib/csfd-match.ts`, takže sa dá neskôr presunúť do monorepa alebo vložiť ako subaplikácia.

## ✨ Funkcie

| Funkcia | Popis |
|---|---|
| 📤 Upload CSV | Nahratie exportu z TMDb (Excel/CSV) |
| 📥 Import JSON | Obnovenie predchádzajúcej session zo zálohy |
| 🔍 Automatické párovanie | Server-side vyhľadávanie na ČSFD pomocou Levenshtein algoritmu |
| ⭐ ČSFD Hodnotenie | Automatické načítanie % hodnotenia + ručná oprava kliknutím |
| 📊 Filtre | Filter podľa stavu párovania aj podľa % hodnotenia |
| ⏭ Ignorovať hodnotenie | Preškrtnúť scraping hodnotenia (rýchlejšie párovanie) |
| ✏️ Manuálna editácia | Manuálne zadanie ČSFD linku alebo hodnotenia |
| 📁 Export CSV / JSON | Export obohatených dát s ČSFD linkami a hodnoteniami |
| 🌙 Dark / Light režim | Prepínanie témy, uloženie do localStorage |
| 📈 Progress bar | Vizualizácia priebehu párovania |

## 🚀 Spustenie

```bash
npm install
npm run dev
```

Aplikácia beží na [http://localhost:3000](http://localhost:3000).

Produkčné overenie:

```bash
npm run lint
npm run test
npm run build
```

## 🔐 Interný API token

Ak chceš chrániť `/api/search-csfd` na Verceli, nastav environment premennú:

```text
CSFD_API_TOKEN=dlhy-interny-token
```

Používateľ potom zadá rovnaký token do interného token poľa v aplikácii. Bez tejto premennej ostáva endpoint otvorený pre lokálny vývoj.

## 📂 Štruktúra projektu

```
app/
  api/search-csfd/route.ts   # Server API – vyhľadávanie + scraping hodnotenia
  layout.tsx                  # Root layout s anti-flash theme skriptom
  page.tsx                    # Hlavná stránka
components/
  movie-matcher-table.tsx     # Hlavný UI komponent (tabuľka, toolbar)
lib/
  csv.ts                      # CSV/JSON parsing a export
  theme.ts                    # Dark/light mode logika
  types.ts                    # TypeScript typy
```

## 📋 Formát CSV

Očakávaný formát vstupného CSV (bez hlavičky alebo s `Ignorovať prvý riadok`):

```
#, TMDb ID, Rok, Názov, TMDb Link, ČSFD Link (voliteľné), Hodnotenie (voliteľné)
```

## 📝 Changelog

### v0.4.0 — 2026-05-31
- ✨ Filter **Hodnotenie** — dropdown s rozsahmi: Všetky / Bez hodnotenia / ≥70% / 50–69% / <50%
- ✨ **Ručná úprava hodnotenia** — kliknutím na badge sa otvorí inline input (0–100), potvrdenie Enterom alebo kliknutím inam
- ✨ **Ignorovať hodnotenie** — zaškrkávatko v Nastaveniach; keď zapínaté: stĺpec Hodnotenie sa skryje, filter hodnotenia zmizne, API preskakuje scraping (rýchlejšie párovanie)
- 🧹 Refaktor SVG ikon do pomocných komponentov (`UploadIcon`, `GearIcon`, `PencilIcon`, ...)

### v0.3.0 — 2026-05-31
- ✨ Nový stĺpec **ČSFD Hodnotenie** — automaticky načítava % hodnotenie z detailovej stránky každého spárovaného filmu
- 🎨 Farebný `RatingBadge` komponent: zelená ≥70%, oranžová 50–69%, červená <50%
- 💾 Hodnotenie sa ukladá do CSV aj JSON exportu a načítava pri JSON importe

### v0.2.0 — 2026-05-30
- ✨ Import JSON — obnovenie predchádzajúcej session
- ✨ Filter statusov s počítadlom
- ✨ Stĺpec `#` (poradové číslo z importu)
- ✨ Dark / Light mode (⚙ ikona, localStorage)
- ✨ Progress bar počas párovania
- 🐛 Oprava `localId` kolízie
- 🐛 UTF-8 BOM pre Excel
- 🐛 Status `idle` po vymazaní linku
- 🔧 Vylepšený scraper

### v0.1.0 — 2026-05-29
- 🎉 Prvé vydanie
- Základné CSV párovanie TMDb → ČSFD
- Levenshtein fuzzy matching
- Manuálna editácia linkov
- Export CSV a JSON
