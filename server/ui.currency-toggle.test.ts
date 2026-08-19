import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("préférence d’affichage MGA", () => {
  it("branche la préférence sur le taux, le formulaire et le téléchargement structuré", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const documentsSource = readFileSync(resolve(process.cwd(), "shared/commercialDocuments.ts"), "utf8");

    expect(homeSource).toContain("const [showMGAEquivalent, setShowMGAEquivalent] = useState(true)");
    expect(homeSource).toContain("setShowMGAEquivalent");
    expect(homeSource).toContain('id="show-mga-equivalent"');
    expect(homeSource).toContain("buildCommercialDocumentHtml(kind, documentData, Number(eurToMgaRate) || 0, showMGAEquivalent)");
    expect(homeSource).toContain('value={quoteForm.currency}');
    expect(homeSource).toContain('value={invoiceForm.currency}');
    expect(documentsSource).toContain("showMGAEquivalent");
    expect(documentsSource).toContain('currency === "EUR"');
    expect(documentsSource).toContain("Équivalent indicatif");
  });
});
