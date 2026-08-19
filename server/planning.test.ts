import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appRouter } from "./routers";

describe("AgencyManager Pro - statistiques dynamiques et Budget Planner", () => {
  it("expose les procédures tRPC du tableur et des feuilles budgétaires", () => {
    expect(appRouter._def.procedures).toHaveProperty("planning.listDynamicStats");
    expect(appRouter._def.procedures).toHaveProperty("planning.createDynamicStat");
    expect(appRouter._def.procedures).toHaveProperty("planning.deleteDynamicStat");
    expect(appRouter._def.procedures).toHaveProperty("planning.listBudgetSheets");
    expect(appRouter._def.procedures).toHaveProperty("planning.createBudgetSheet");
    expect(appRouter._def.procedures).toHaveProperty("planning.convertBudgetSheetToTransaction");
    expect(appRouter._def.procedures).toHaveProperty("planning.accountingStatistics");
    expect(appRouter._def.procedures).toHaveProperty("planning.hrStatistics");
    expect(appRouter._def.procedures).toHaveProperty("planning.caStatistics");
  });

  it("propose les filtres multidimensionnels et les totaux de tableur", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("statFilters.monthKey");
    expect(homeSource).toContain("statFilters.clientName");
    expect(homeSource).toContain("statFilters.agentName");
    expect(homeSource).toContain("statFilters.serviceName");
    expect(homeSource).toContain("dynamicStatsTotals");
    expect(homeSource).toContain("accountingStatsView");
    expect(homeSource).toContain("accountingStatisticsQuery");
    expect(homeSource).toContain("hrStatisticsQuery");
    expect(homeSource).toContain("caStatisticsQuery");
    expect(homeSource).toContain("Statistiques RH");
    expect(homeSource).toContain("Statistiques CA");
    expect(homeSource).toContain("Sorties par jour");
    expect(homeSource).toContain("Nombre et montant des factures");
    expect(homeSource).toContain("Encaissées");
    expect(homeSource).toContain("En retard");
    expect(homeSource).toContain("Annulées");
    expect(homeSource).toContain("Sheet");
    expect(homeSource).toContain("Gantt");
    expect(homeSource).toContain("Eisenhower");
    expect(homeSource).toContain("Alimenter le mois");
    expect(homeSource).toContain("Ouvrir les statistiques");
    expect(homeSource).toContain("Ouvrir le budget");
    expect(homeSource).toContain("Nouvelle feuille");
  });

  it("propose la sauvegarde d’une feuille récurrente et sa conversion en sortie de caisse", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("Budget Planner");
    expect(homeSource).toContain("Nouvelle feuille");
    expect(homeSource).toContain("handleSaveBudgetSheet");
    expect(homeSource).toContain("convertBudgetSheetMutation.mutate");
    expect(homeSource).toContain("Convertir en sortie de caisse");
    expect(homeSource).toContain("itemsJson");
  });

  it("expose le décaissement des avances dans le planning superviseur", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(appRouter._def.procedures).toHaveProperty("accounting.convertAdvanceToTransaction");
    expect(homeSource).toContain("Planning superviseur · Avances");
    expect(homeSource).toContain("convertAdvanceToTransactionMutation");
    expect(homeSource).toContain("handleConvertAdvanceToTransaction");
    expect(homeSource).toContain("Sortie de caisse");
    expect(homeSource).toContain('advance.status === "accordé"');
    expect(homeSource).toContain('currency: "MGA"');
  });
});
