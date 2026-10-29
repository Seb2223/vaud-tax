// Where each item goes in the Zurich return (ZHprivateTax uses the same forms
// and Ziffern as the paper return, StA Form. 303 and its annexes).
import type { TaxLocation } from "./vdLocations";

const P2 = "Steuererklärung, Seite 2 – Einkünfte";
const P3 = "Steuererklärung, Seite 3 – Abzüge";
const P4 = "Steuererklärung, Seite 4 – Vermögen";
const BA = "Formular «Berufsauslagen»";
const VP = "Formular «Versicherungsprämien»";
const WV = "Wertschriften- und Guthabenverzeichnis";
const LV = "Liegenschaftenverzeichnis";
const SV = "Schuldenverzeichnis";

export const ZHTAX: Record<string, TaxLocation> = {
  "1.1": { officialLabel: "Haupterwerb (Lohnausweis)", path: [P2, "Ziffer 1.1 Haupterwerb"] },
  "1.2": { officialLabel: "Nebenerwerb (Lohnausweis)", path: [P2, "Ziffer 1.2 Nebenerwerb"] },
  "2.1": { officialLabel: "Einkünfte aus selbständiger Erwerbstätigkeit – Haupterwerb", path: ["Hilfsblatt A für Selbständigerwerbende", "Ziffer 5 → Steuererklärung Seite 2, Ziffer 2.1"] },
  "2.1-loss": { officialLabel: "Weitere Abzüge (Verrechnung Vorjahresverluste)", path: ["Hilfsblatt A für Selbständigerwerbende", "Weitere Abzüge"] },
  "32": { officialLabel: "Eigenkapital Selbständigerwerbender ohne Geschäftswertschriften", path: ["Hilfsblatt A für Selbständigerwerbende", "→ Steuererklärung Seite 4, Ziffer 32"] },
  "3.1": { officialLabel: "AHV- / IV-Renten (100%)", path: [P2, "Ziffer 3.1"] },
  "3.2": { officialLabel: "Renten / Pensionen", path: [P2, "Ziffer 3.2"] },
  "3.3": { officialLabel: "Erwerbsausfallentschädigungen aus Arbeitslosenversicherung", path: [P2, "Ziffer 3.3"] },
  "3.4": { officialLabel: "Kinder- und Familienzulagen, Mutterschaftsentschädigungen, Taggelder", path: [P2, "Ziffer 3.4"] },
  "4.1": { officialLabel: "Ertrag aus Wertschriften, Guthaben und Lotterien", path: [WV, "Total Bruttoertrag A + B → Ziffer 4.1"] },
  "5.1": { officialLabel: "Unterhaltsbeiträge vom geschiedenen / getrennten Ehegatten", path: [P2, "Ziffer 5.1 / 5.2"] },
  "5.4": { officialLabel: "Weitere Einkünfte", path: [P2, "Ziffer 5.4"] },
  "6": { officialLabel: "Nettoertrag aus Liegenschaften", path: [LV, "Eigenmietwert / Mietertrag − Unterhalt → Ziffer 6"] },
  "11-commute": { officialLabel: "Fahrkosten zwischen Wohn- und Arbeitsstätte", path: [BA, "1. Fahrkosten"] },
  "11-meals": { officialLabel: "Mehrkosten für Verpflegung", path: [BA, "2. Verpflegung"] },
  "11-other": { officialLabel: "Übrige für die Ausübung des Berufes erforderliche Kosten", path: [BA, "3. Übrige Berufskosten (Pauschale)"] },
  "11-secondary": { officialLabel: "Auslagen bei Nebenerwerb", path: [BA, "5. Nebenerwerb (Pauschale)"] },
  "12": { officialLabel: "Schuldzinsen", path: [SV, "Total Schuldzinsen → Ziffer 12"] },
  "13.1": { officialLabel: "Unterhaltsbeiträge an den geschiedenen oder getrennt lebenden Ehegatten", path: [P3, "Ziffer 13.1 / 13.2"] },
  "14": { officialLabel: "Beiträge an anerkannte Formen der gebundenen Selbstvorsorge (3. Säule a)", path: [P3, "Ziffer 14.1 / 14.2"] },
  "15": { officialLabel: "Versicherungsprämien, Zinsen von Sparkapitalien", path: [VP, "→ Ziffer 15"] },
  "16.1": { officialLabel: "Beiträge an die AHV, IV und 2. Säule (Einkäufe)", path: [P3, "Ziffer 16.1"] },
  "16.2": { officialLabel: "Berufsorientierte Aus- und Weiterbildungskosten", path: ["Hilfsblatt «Berufsorientierte Aus- und Weiterbildungskosten»", "→ Ziffer 16.2"] },
  "16.3": { officialLabel: "Kosten für die Verwaltung des beweglichen Privatvermögens", path: [P3, "Ziffer 16.3"] },
  "16.4": { officialLabel: "Behinderungsbedingte Kosten", path: ["Hilfsblatt «Behinderungsbedingte Kosten»", "→ Ziffer 16.4"] },
  "16.5": { officialLabel: "Weitere Abzüge (Beiträge an politische Parteien)", path: [P3, "Ziffer 16.5"] },
  "16.6": { officialLabel: "Abzug für fremdbetreute Kinder", path: [P3, "Ziffer 16.6"] },
  "17": { officialLabel: "Sonderabzug bei Erwerbstätigkeit beider Ehegatten", path: [P3, "Ziffer 17"] },
  "22.1": { officialLabel: "Krankheits- und Unfallkosten", path: ["Hilfsblatt «Krankheits- und Unfallkosten»", "→ Ziffer 22.1"] },
  "22.2": { officialLabel: "Gemeinnützige Zuwendungen", path: [P3, "Ziffer 22.2 (mit Aufstellung)"] },
  "24.1": { officialLabel: "Abzug für Kinder", path: ["Steuererklärung, Seite 1 – Kinder", "→ Ziffer 24.1"] },
  "24.2": { officialLabel: "Abzug für unterstützte Personen", path: ["Steuererklärung, Seite 1 – unterstützte Personen", "→ Ziffer 24.2"] },
  "30.1": { officialLabel: "Wertschriften und Guthaben", path: [WV, "Total Steuerwert → Ziffer 30.1"] },
  "30.2": { officialLabel: "Bargeld, Gold und andere Edelmetalle", path: [P4, "Ziffer 30.2"] },
  "30.3": { officialLabel: "Lebens- und Rentenversicherungen (Steuerwert)", path: [P4, "Ziffer 30.3"] },
  "30.4": { officialLabel: "Motorfahrzeuge", path: [P4, "Ziffer 30.4"] },
  "31.1": { officialLabel: "Liegenschaften, zum Verkehrswert besteuert", path: [LV, "Steuerwert → Ziffer 31.1"] },
  "34": { officialLabel: "Schulden", path: [SV, "Total Schulden → Ziffer 34"] },
};

export const zloc = (key: string): TaxLocation => ZHTAX[key] ?? { officialLabel: `Ziffer ${key}`, path: [] };
