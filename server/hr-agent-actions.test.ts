import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appRouter } from "./routers";

describe("AgencyManager Pro - fiche agent et temps de travail", () => {
  it("expose les procédures nécessaires aux actions RH rapides", () => {
    expect(appRouter._def.procedures).toHaveProperty("hr.createTimeEntry");
    expect(appRouter._def.procedures).toHaveProperty("hr.createLeave");
    expect(appRouter._def.procedures).toHaveProperty("hr.createSalaryAdvance");
    expect(appRouter._def.procedures).toHaveProperty("hr.createTicket");
    expect(appRouter._def.procedures).toHaveProperty("hr.updateLeave");
  });

  it("affiche la règle 8 heures = 1 journée et le total mensuel", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("const WORKDAY_HOURS = 8");
    expect(homeSource).toContain("const monthlyWorkedDays = monthlyWorkedHours / WORKDAY_HOURS");
    expect(homeSource).toContain("8 h = 1 journée");
    expect(homeSource).toContain("Total du mois");
  });

  it("propose les actions depuis la fiche agent et un récapitulatif repliable", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(homeSource).toContain("Absence déclarée depuis la fiche agent");
    expect(homeSource).toContain("setIsLeaveOpen(true)");
    expect(homeSource).toContain("setIsAdvanceOpen(true)");
    expect(homeSource).toContain("setIsTicketOpen(true)");
    expect(homeSource).toContain("<Collapsible key={agent.id}");
    expect(homeSource).toContain("Modifier la fiche agent");
  });
});
