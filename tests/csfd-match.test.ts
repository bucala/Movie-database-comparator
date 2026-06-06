import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCsfdSearchUrl,
  extractCandidates,
  isAmbiguousCandidates,
  normalizeCsfdUrl,
  normalizeText,
  scoreCandidate
} from "../lib/csfd-match.ts";

describe("csfd matcher", () => {
  it("normalizes Slovak and Czech titles for matching", () => {
    assert.equal(normalizeText("Po nás potopa!"), "po nas potopa");
  });

  it("builds the expected CSFD search URL", () => {
    assert.equal(
      buildCsfdSearchUrl("Potopa", "2025"),
      "https://www.csfd.cz/hledat/?q=Potopa%202025"
    );
  });

  it("normalizes CSFD movie links to review URLs", () => {
    assert.equal(
      normalizeCsfdUrl("/film/1731626-potopa/prehled/"),
      "https://www.csfd.cz/film/1731626-potopa/"
    );
  });

  it("scores exact title and year matches higher than partial matches", () => {
    const exact = scoreCandidate("Potopa", "2025", "Potopa", "2025");
    const partial = scoreCandidate("Po nás potopa", "2025", "Potopa", "2025");

    assert.equal(exact, 100);
    assert.ok(exact > partial);
  });

  it("extracts candidates and sorts them by score", () => {
    const html = `
      <ul>
        <li><a href="/film/1731626-potopa/prehled/">Potopa</a> 2025</li>
        <li><a href="/film/1221893-potopa-sveta/prehled/">Potopa sveta</a> 2025</li>
      </ul>
    `;
    const candidates = extractCandidates(html, "Potopa", "2025");

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].title, "Potopa");
    assert.equal(candidates[0].url, "https://www.csfd.cz/film/1731626-potopa/");
  });

  it("flags candidates with near-equal scores as ambiguous", () => {
    assert.equal(
      isAmbiguousCandidates([
        { title: "Potopa", year: "2025", url: "https://www.csfd.cz/film/1/", score: 100 },
        { title: "Potopa", year: "2025", url: "https://www.csfd.cz/film/2/", score: 100 }
      ]),
      true
    );
  });
});
