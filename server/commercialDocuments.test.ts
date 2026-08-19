import { describe, expect, it } from "vitest";
import {
  buildCommercialDocumentHtml,
  getCommercialTableColumnCount,
  shouldRenderMGAEquivalent,
} from "../shared/commercialDocuments";

const documentData = {
  number: "DEV-2026-001",
  clientId: 42,
  issueDate: "2026-08-19",
  validUntil: "2026-09-18",
  totalAmount: 100,
  itemsJson: "Mission de conseil",
  notes: "Merci pour votre confiance",
  termsAndConditions: "Paiement à réception.",
};

describe("documents commerciaux et visibilité MGA", () => {
  it("inclut l’équivalent MGA quand la préférence est activée", () => {
    const html = buildCommercialDocumentHtml("devis", documentData, 5000, true);

    expect(html).toContain("500 000 Ar");
    expect(html).toContain("Taux d’affichage indicatif");
    expect(shouldRenderMGAEquivalent(true)).toBe(true);
    expect(getCommercialTableColumnCount(true)).toBe(8);
  });

  it("exclut toute valeur MGA quand la préférence est désactivée", () => {
    const html = buildCommercialDocumentHtml("facture", { ...documentData, dueDate: "2026-09-18" }, 5000, false);

    expect(html).not.toContain("MGA");
    expect(html).not.toContain("Équivalent");
    expect(html).toContain("Affichage en devise principale EUR uniquement.");
    expect(shouldRenderMGAEquivalent(false)).toBe(false);
    expect(getCommercialTableColumnCount(false)).toBe(7);
  });
});
