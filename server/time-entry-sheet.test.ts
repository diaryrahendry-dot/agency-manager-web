import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("feuille de pointage par agent", () => {
  it("synchronise l’agent sélectionné et recharge sa feuille après ajout", () => {
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

    expect(homeSource).toContain("const agentTimeEntriesQuery = trpc.hr.listTimeEntries.useQuery(selectedTimeEntryAgentId ? { agentId: selectedTimeEntryAgentId }");
    expect(homeSource).toContain("setSelectedTimeEntryAgentId(agentId); setTimeEntryForm({ ...timeEntryForm, agentId });");
    expect(homeSource).toContain("utils.hr.listTimeEntries.invalidate({ agentId: selectedTimeEntryAgentId });");
    expect(homeSource).toContain("Feuille de pointage");
  });
});
