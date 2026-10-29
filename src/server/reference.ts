// Loads the official cantonal instructions (plain text extracted from the PDFs
// in research/) so the AI answers from the actual 2025 rules instead of memory.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Canton } from "../shared/types";

const REFERENCE_DIR = process.env.REFERENCE_DIR ?? path.resolve("research");

const DOCS: Record<Canton, { file: string; title: string }[]> = {
  VD: [
    { file: "21001_2025.txt", title: "INSTRUCTIONS GÉNÉRALES 2025 – impôt cantonal et communal / impôt fédéral direct (ACI Vaud, doc 21001)" },
    { file: "21004_2025.txt", title: "INSTRUCTIONS COMPLÉMENTAIRES 2025 concernant la propriété immobilière (ACI Vaud, doc 21004)" },
  ],
  ZH: [{ file: "zh/wegleitung-2025.flow.txt", title: "Wegleitung zur Steuererklärung 2025 (Kantonales Steueramt Zürich)" }],
};

/** Collapse PDF layout whitespace, dot leaders and the form-field noise (digit-only lines) to save tokens. */
function condense(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/[�.]{6,}/g, " … ").replace(/[ \t]{2,}/g, "  ").trimEnd())
    .filter((l) => !/^[\s\d–\-▸◂▼]*$/.test(l) || l.trim() === "")
    .filter((l, i, arr) => l.trim() !== "" || (i > 0 && arr[i - 1].trim() !== ""))
    .join("\n");
}

const cache = new Map<Canton, string>();

export function referenceText(canton: Canton): string {
  let text = cache.get(canton);
  if (text === undefined) {
    text = DOCS[canton]
      .map(({ file, title }) => `<document title="${title}">\n${condense(readFileSync(path.join(REFERENCE_DIR, file), "utf8"))}\n</document>`)
      .join("\n\n");
    cache.set(canton, text);
  }
  return text;
}
