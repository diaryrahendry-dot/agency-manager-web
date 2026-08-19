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
  });

  it("propose les filtres multidimensionnels et les totaux de tableur", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("statFilters.monthKey");
    expect(homeSource).toContain("statFilters.clientName");
    expect(homeSource).toContain("statFilters.agentName");
    expect(homeSource).toContain("statFilters.serviceName");
    expect(homeSource).toContain("dynamicStatsTotals");
    expect(homeSource).toContain("Alimenter le mois");
  });

  it("propose la sauvegarde d’une feuille récurrente et sa conversion en sortie de caisse", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("Budget Planner");
    expect(homeSource).toContain("Nouvelle feuille");
    expect(homeSource).toContain("handleSaveBudgetSheet");
    expect(homeSource).toContain("convertBudgetSheetMutation.mutate");
    expect(homeSource).toContain("Vers caisse");
    expect(homeSource).toContain("itemsJson");
  });
});
