export type CommercialDocumentKind = "facture" | "devis";

export type CommercialDocumentData = {
  number: string;
  clientId: number;
  issueDate: string | Date;
  dueDate?: string | Date;
  validUntil?: string | Date;
  totalAmount: string | number;
  itemsJson: string;
  currency?: "EUR" | "MGA";
  documentProfile?: "fr" | "mg";
  subtotalAmount?: string | number | null;
  discountType?: "none" | "percent" | "fixed" | string | null;
  discountValue?: string | number | null;
  taxRate?: string | number | null;
  taxAmount?: string | number | null;
  notes?: string | null;
  termsAndConditions?: string | null;
};

export function shouldRenderMGAEquivalent(showMGAEquivalent: boolean) {
  return showMGAEquivalent;
}

export function getCommercialTableColumnCount(showMGAEquivalent: boolean) {
  return showMGAEquivalent ? 10 : 9;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type ParsedLine = {
  label?: string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  unitPrice?: number | string;
  taxRate?: number | string;
  discountType?: string;
  discountValue?: number | string;
};

export function buildCommercialDocumentHtml(
  kind: CommercialDocumentKind,
  documentData: CommercialDocumentData,
  eurToMgaRate: number,
  showMGAEquivalent: boolean,
) {
  const currency = documentData.currency === "MGA" ? "MGA" : "EUR";
  const profile = documentData.documentProfile === "mg" ? "mg" : "fr";
  const totalAmount = Number(documentData.totalAmount || 0);
  const subtotalAmount = Number(documentData.subtotalAmount || totalAmount);
  const discountValue = Number(documentData.discountValue || 0);
  const taxAmount = Number(documentData.taxAmount || 0);
  const taxRate = Number(documentData.taxRate || 0);

  let parsedLines: ParsedLine[] = [];
  try {
    const raw = JSON.parse(documentData.itemsJson || "[]");
    if (Array.isArray(raw)) {
      parsedLines = raw;
    } else if (raw && typeof raw === "object") {
      parsedLines = [raw];
    }
  } catch {
    parsedLines = [{ label: String(documentData.itemsJson || "Prestation") }];
  }

  const rowsHtml = parsedLines.map((line, idx) => {
    const qty = Number(line.quantity || 1);
    const unitPrice = Number(line.unitPrice || 0);
    const lineTotal = qty * unitPrice;
    const label = escapeHtml(line.label || `Ligne ${idx + 1}`);
    const desc = line.description ? `<br><span class="muted">${escapeHtml(line.description)}</span>` : "";
    const unit = escapeHtml(line.unit || "unité");
    return `<tr>
      <td><strong>${label}</strong>${desc}</td>
      <td style="text-align:center">${qty} ${unit}</td>
      <td style="text-align:right">${unitPrice.toLocaleString("fr-FR", { style: "currency", currency })}</td>
      <td style="text-align:right"><strong>${lineTotal.toLocaleString("fr-FR", { style: "currency", currency })}</strong></td>
    </tr>`;
  }).join("");

  const dateLabel = String(documentData.issueDate || "").slice(0, 10);
  const secondaryLabel = kind === "facture"
    ? `Échéance : ${String(documentData.dueDate || "").slice(0, 10)}`
    : `Valable jusqu’au : ${String(documentData.validUntil || "").slice(0, 10)}`;

  const profileCompliance = profile === "mg"
    ? `Règlementation fiscale malgache (DGI Madagascar). Devises et transactions conformes aux dispositions en vigueur.`
    : `Règlementation française (Code de commerce et CGI). Indemnité forfaitaire de recouvrement en cas de retard : 40 €. Pénalités de retard : taux de ref. BCE majoré de 10 points.`;

  const mgaEquivalentBlock = showMGAEquivalent && currency === "EUR"
    ? `<div class="muted" style="margin-top:4px;">Équivalent indicatif : ${(totalAmount * eurToMgaRate).toLocaleString("fr-FR")} Ar (Taux 1 EUR = ${eurToMgaRate} MGA)</div>`
    : "";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${kind === "facture" ? "Facture" : "Devis"} ${escapeHtml(documentData.number)}</title><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1e293b;max-width:900px;margin:30px auto;padding:40px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:24px;margin-bottom:24px}
    .brand{font-size:20px;font-weight:800;color:#4f46e5}
    .muted{color:#64748b;font-size:12px}
    .label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;font-weight:700}
    table{width:100%;border-collapse:collapse;margin:24px 0}
    th{background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;padding:10px 12px;border-bottom:1px solid #cbd5e1;text-align:left}
    td{padding:12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155}
    .totals{display:flex;justify-content:flex-end;margin-top:20px}
    .totals-box{width:320px;font-size:13px}
    .totals-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9}
    .totals-final{display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:800;color:#0f172a;border-top:2px solid #0f172a}
    .box{background:#f8fafc;border:1px solid #e2e8f0;padding:16px;border-radius:8px;margin-top:20px;white-space:pre-wrap;font-size:12px;color:#475569}
    footer{margin-top:40px;color:#64748b;font-size:11px;border-top:1px solid #e2e8f0;padding-top:16px}
  </style></head><body>
    <header>
      <div>
        <div class="brand">AgencyManager Pro</div>
        <div class="muted">Gestion intégrée d’agence &amp; ERP commercial</div>
      </div>
      <div style="text-align:right">
        <h1 style="margin:0;font-size:24px;letter-spacing:-0.02em">${kind === "facture" ? "FACTURE" : "DEVIS"}</h1>
        <div style="font-size:14px;font-weight:700;color:#4f46e5;margin-top:4px">N° ${escapeHtml(documentData.number)}</div>
      </div>
    </header>

    <section style="display:flex;justify-content:space-between;margin-bottom:24px">
      <div>
        <div class="label">Émetteur</div>
        <div><strong>AgencyManager Pro</strong></div>
        <div class="muted">Profil légal : ${profile === "mg" ? "Madagascar (DGI)" : "France (RCS / TVA)"}</div>
      </div>
      <div style="text-align:right">
        <div class="label">Client destinataire</div>
        <div><strong>Client #${escapeHtml(documentData.clientId)}</strong></div>
        <div class="muted">Date d’émission : ${escapeHtml(dateLabel)}</div>
        <div class="muted">${escapeHtml(secondaryLabel)}</div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Désignation</th>
          <th style="text-align:center">Quantité</th>
          <th style="text-align:right">Prix unitaire HT</th>
          <th style="text-align:right">Total HT</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row"><span>Sous-total HT</span><span>${subtotalAmount.toLocaleString("fr-FR", { style: "currency", currency })}</span></div>
        ${discountValue > 0 ? `<div class="totals-row" style="color:#e11d48"><span>Remise globale</span><span>- ${discountValue.toLocaleString("fr-FR", { style: "currency", currency })}</span></div>` : ""}
        <div class="totals-row"><span>TVA (${taxRate} %)</span><span>${taxAmount.toLocaleString("fr-FR", { style: "currency", currency })}</span></div>
        <div class="totals-final"><span>Total TTC</span><span>${totalAmount.toLocaleString("fr-FR", { style: "currency", currency })}</span></div>
        ${mgaEquivalentBlock}
      </div>
    </div>

    ${documentData.notes ? `<div class="box"><div class="label">Notes / Conditions de règlement</div>${escapeHtml(documentData.notes)}</div>` : ""}
    
    <div class="box">
      <div class="label">Conditions Générales de Vente (CGV) &amp; Conformité (${profile.toUpperCase()})</div>
      <div>${escapeHtml(documentData.termsAndConditions || profileCompliance)}</div>
    </div>

    <footer>
      <div>${profileCompliance}</div>
      <div style="margin-top:4px">Document officiel généré par AgencyManager Pro · Devise : ${currency}</div>
    </footer>
  </body></html>`;
}
