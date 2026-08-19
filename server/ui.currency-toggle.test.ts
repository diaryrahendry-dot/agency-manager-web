import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("préférence d’affichage MGA", () => {
  it("branche la préférence sur les tableaux et le téléchargement", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const columnsSource = readFileSync(resolve(process.cwd(), "client/src/components/CommercialMGAColumns.tsx"), "utf8");
    const documentsSource = readFileSync(resolve(process.cwd(), "shared/commercialDocuments.ts"), "utf8");

    expect(homeSource).toContain("const [showMGAEquivalent, setShowMGAEquivalent] = useState(true)");
    expect(homeSource).toContain("<CommercialMGAColumnHeader show={showMGAEquivalent} />");
    expect(homeSource).toContain("<CommercialMGAColumnCell show={showMGAEquivalent}");
    expect(homeSource).toContain("getCommercialTableColumnCount(showMGAEquivalent)");
    expect(homeSource).toContain("buildCommercialDocumentHtml(kind, documentData, Number(eurToMgaRate) || 0, showMGAEquivalent)");
    expect(homeSource).toContain("<Label htmlFor=\"show-mga-equivalent\"");
    expect(columnsSource).toContain("return show ? <TableHead data-testid=\"mga-column-header\">");
    expect(columnsSource).toContain("return show ? (");
    expect(documentsSource).toContain("showMGAEquivalent");
    expect(documentsSource).toContain("Affichage en devise principale EUR uniquement.");
  });
});
