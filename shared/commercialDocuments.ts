import { formatMGA } from "./currency";

export type CommercialDocumentKind = "facture" | "devis";

export type CommercialDocumentData = {
  number: string;
  clientId: number;
  issueDate: string | Date;
  dueDate?: string | Date;
  validUntil?: string | Date;
  totalAmount: string | number;
  itemsJson: string;
  notes?: string | null;
  termsAndConditions?: string | null;
};

export function shouldRenderMGAEquivalent(showMGAEquivalent: boolean) {
  return showMGAEquivalent;
}

export function getCommercialTableColumnCount(showMGAEquivalent: boolean) {
  return showMGAEquivalent ? 8 : 7;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildCommercialDocumentHtml(
  kind: CommercialDocumentKind,
  documentData: CommercialDocumentData,
  eurToMgaRate: number,
  showMGAEquivalent: boolean,
) {
  const amountEur = Number(documentData.totalAmount || 0);
  const dateLabel = String(documentData.issueDate).slice(0, 10);
  const secondaryLabel = kind === "facture"
    ? `Échéance : ${String(documentData.dueDate || "").slice(0, 10)}`
    : `Valable jusqu’au : ${String(documentData.validUntil || "").slice(0, 10)}`;
  const mgaLine = showMGAEquivalent
    ? `<br><span class="muted">${formatMGA(amountEur, eurToMgaRate)}</span>`
    : "";
  const mgaTotal = showMGAEquivalent
    ? `<div class="muted">Équivalent : ${formatMGA(amountEur, eurToMgaRate)}</div>`
    : "";
  const rateFooter = showMGAEquivalent
    ? `Taux d’affichage indicatif : 1 EUR = ${escapeHtml(eurToMgaRate)} MGA.`
    : "Affichage en devise principale EUR uniquement.";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${kind === "facture" ? "Facture" : "Devis"} ${escapeHtml(documentData.number)}</title><style>body{font-family:Arial,sans-serif;color:#172033;max-width:850px;margin:40px auto;padding:32px;border:1px solid #e2e8f0}header{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:20px}.muted{color:#64748b;font-size:13px}.label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700}.row{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:14px 0}.total{font-size:20px;font-weight:800}.box{background:#f8fafc;padding:16px;margin-top:24px;white-space:pre-wrap}footer{margin-top:36px;color:#64748b;font-size:12px}</style></head><body><header><div><strong>AgencyManager Pro</strong><div class="muted">Gestion intégrée d’agence &amp; ERP</div></div><div style="text-align:right"><h1 style="margin:0">${kind === "facture" ? "FACTURE" : "DEVIS"}</h1><strong>N° ${escapeHtml(documentData.number)}</strong></div></header><section style="display:flex;justify-content:space-between;padding:24px 0"><div><div class="label">Client</div><strong>Client #${escapeHtml(documentData.clientId)}</strong></div><div style="text-align:right"><div class="label">Dates</div><div>Émission : ${escapeHtml(dateLabel)}</div><div>${escapeHtml(secondaryLabel)}</div></div></section><div class="row"><span><strong>Désignation</strong><br>${escapeHtml(documentData.itemsJson)}</span><strong>${amountEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}${mgaLine}</strong></div><div style="text-align:right;padding-top:24px"><div>Total TTC : ${amountEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</div><div class="total">Net à payer : ${amountEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</div>${mgaTotal}</div>${documentData.notes ? `<div class="box"><div class="label">Notes</div>${escapeHtml(documentData.notes)}</div>` : ""}<div class="box"><div class="label">Conditions générales de vente</div>${escapeHtml(documentData.termsAndConditions || "CGV à compléter")}</div><footer>Document généré depuis AgencyManager Pro. ${rateFooter}</footer></body></html>`;
}
