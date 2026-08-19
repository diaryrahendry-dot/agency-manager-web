import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("navigation interactive du dashboard", () => {
  it("relie les indicateurs aux modules métier correspondants", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

    expect(source).toContain('openDashboardModule("accounting")');
    expect(source).toContain('openDashboardModule("hr")');
    expect(source).toContain('openDashboardModule("crm")');
    expect(source).toContain('aria-label="Ouvrir la comptabilité depuis le chiffre d’affaires"');
    expect(source).toContain('aria-label="Ouvrir les agents actifs"');
    expect(source).toContain('aria-label="Ouvrir les leads en pipeline"');
  });

  it("conserve une navigation horizontale accessible sur mobile", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("w-max min-w-max");
    expect(source).toContain("overflow-x-hidden");
  });
});


describe("isolation du dashboard collaborateur", () => {
  it("désactive les modules globaux et le chiffre d’affaires pour le rôle collaborateur", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

    expect(source).toContain('const canAccessAgencyModules = Boolean(user) && !isCollaborator;');
    expect(source).toContain('enabled: isAuthenticated && canAccessAgencyModules');
    expect(source).toContain('const canViewRevenueDashboard = canAccessAgencyModules && preferencesQuery.data?.showRevenueDashboard !== false;');
    expect(source).toContain("Les pointages sont verrouillés après création");
  });
});
