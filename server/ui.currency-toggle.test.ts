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

  it("expose la suppression de lignes dans les deux éditeurs sans supprimer la dernière", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

    expect(homeSource).toContain('quoteLines.length > 1 && <Button type="button" size="icon"');
    expect(homeSource).toContain('invoiceLines.length > 1 && <Button type="button" size="icon"');
    expect(homeSource).toContain('title="Supprimer cette ligne"');
    expect(homeSource).toContain('aria-label={`Supprimer la ligne ${index + 1}`}');
    expect(homeSource).toContain('setQuoteLines(lines => lines.filter((_, row) => row !== index))');
    expect(homeSource).toContain('setInvoiceLines(lines => lines.filter((_, row) => row !== index))');
  });
});
