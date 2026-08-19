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
  totalAmount: 1092,
  subtotalAmount: 1000,
  discountType: "percent" as const,
  discountValue: 100,
  taxRate: 20,
  taxAmount: 198.4,
  currency: "EUR" as const,
  documentProfile: "fr" as const,
  itemsJson: JSON.stringify([
    {
      label: "Audit stratégique",
      description: "Diagnostic et recommandations",
      quantity: 2,
      unit: "jour",
      unitPrice: 500,
      taxRate: 20,
      discountType: "none",
      discountValue: 0,
    },
  ]),
  notes: "Merci pour votre confiance",
  termsAndConditions: "Paiement à réception.",
};

describe("documents commerciaux et visibilité MGA", () => {
  it("inclut l’équivalent MGA quand la préférence est activée sur un document EUR", () => {
    const html = buildCommercialDocumentHtml("devis", documentData, 5000, true);

    expect(html).toContain("5 460 000 Ar");
    expect(html).toContain("Taux 1 EUR = 5000 MGA");
    expect(shouldRenderMGAEquivalent(true)).toBe(true);
    expect(getCommercialTableColumnCount(true)).toBe(10);
  });

  it("exclut toute valeur MGA quand la préférence est désactivée", () => {
    const html = buildCommercialDocumentHtml("facture", { ...documentData, dueDate: "2026-09-18" }, 5000, false);

    expect(html).not.toContain("Équivalent indicatif");
    expect(html).not.toContain("Taux 1 EUR =");
    expect(html).toContain("Document officiel généré par AgencyManager Pro");
    expect(shouldRenderMGAEquivalent(false)).toBe(false);
    expect(getCommercialTableColumnCount(false)).toBe(9);
  });

  it("rend les lignes structurées et le récapitulatif HT, remise, TVA et TTC", () => {
    const html = buildCommercialDocumentHtml("devis", documentData, 5000, false);

    expect(html).toContain("Audit stratégique");
    expect(html).toContain("Diagnostic et recommandations");
    expect(html).toContain("Prix unitaire HT");
    expect(html).toContain("Sous-total HT");
    expect(html).toContain("Remise globale");
    expect(html).toContain("TVA (20 %)");
    expect(html).toContain("Total TTC");
    expect(html).toMatch(/1[   ]092,00/);
  });

  it("applique les mentions de conformité propres au profil Madagascar", () => {
    const html = buildCommercialDocumentHtml(
      "facture",
      {
        ...documentData,
        number: "FAC-2026-001",
        dueDate: "2026-09-18",
        currency: "MGA",
        documentProfile: "mg",
        subtotalAmount: 5_000_000,
        totalAmount: 5_500_000,
        taxRate: 10,
        taxAmount: 500_000,
        itemsJson: JSON.stringify([{ label: "Prestation locale", quantity: 1, unitPrice: 5_000_000, unit: "forfait" }]),
      },
      5000,
      true,
    );

    expect(html).toContain("Madagascar (DGI)");
    expect(html).toContain("Règlementation fiscale malgache");
    expect(html).toMatch(/5[   ]500[   ]000/);
    expect(html).not.toContain("Équivalent indicatif");
  });
});


describe("calcul des totaux commerciaux structurés", () => {
  it("calcule la remise par ligne puis la TVA globale", async () => {
    const { calculateCommercialTotals } = await import("./routers");
    const result = calculateCommercialTotals(
      JSON.stringify([
        { label: "Prestation A", quantity: 2, unitPrice: 100, discountType: "percent", discountValue: 10 },
        { label: "Prestation B", quantity: 1, unitPrice: 50, discountType: "fixed", discountValue: 20 },
      ]),
      "0",
      "none",
      "0",
      "20",
    );

    expect(result.subtotalAmount).toBe("250.00");
    expect(result.discountAmount).toBe("40.00");
    expect(result.taxAmount).toBe("42.00");
    expect(result.totalAmount).toBe("252.00");
  });

  it("plafonne une remise globale au sous-total et conserve un total non négatif", async () => {
    const { calculateCommercialTotals } = await import("./routers");
    const result = calculateCommercialTotals(
      JSON.stringify([{ label: "Forfait", quantity: 1, unitPrice: 100, taxRate: 20 }]),
      "0",
      "fixed",
      "250",
      "20",
    );

    expect(result.subtotalAmount).toBe("100.00");
    expect(result.discountAmount).toBe("100.00");
    expect(result.taxAmount).toBe("0.00");
    expect(result.totalAmount).toBe("0.00");
  });
});
