import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("AgencyManager Pro API tests", () => {
  it("allows fetching agents and summary", async () => {
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "test-admin",
        email: "admin@agency.com",
        name: "Admin Test",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    };

    const caller = appRouter.createCaller(ctx);
    const agents = await caller.hr.listAgents();
    expect(Array.isArray(agents)).toBe(true);

    const summary = await caller.accounting.summary();
    expect(summary).toHaveProperty("solde");
  });

  it("rejects an invalid time entry before database insertion", async () => {
    const ctx: TrpcContext = {
      user: { id: 1, openId: "test-admin", email: "admin@agency.com", name: "Admin Test", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    };

    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.createTimeEntry({
      agentId: 1,
      date: "19/08/2026",
      hoursWorked: "25",
      status: "présent",
      notes: "",
    })).rejects.toThrow();
  });

  it("rejects an invalid CRM lead update before database access", async () => {
    const ctx: TrpcContext = {
      user: { id: 1, openId: "test-admin", email: "admin@agency.com", name: "Admin Test", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    };

    const caller = appRouter.createCaller(ctx);
    await expect(caller.crm.updateLead({
      id: 1,
      companyName: "Entreprise test",
      contactName: "Contact test",
      email: "email-invalide",
      phone: "",
      expectedAmount: "-10",
      priority: "moyenne",
      status: "nouveau",
      nextContactDate: "",
      notes: "",
    })).rejects.toThrow();
  });

  it("rejects an incomplete employee record before database insertion", async () => {
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "test-admin",
        email: "admin@agency.com",
        name: "Admin Test",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    };

    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.createAgent({
      name: "",
      email: "adresse-invalide",
      phone: "",
      position: "",
      department: "",
      hireDate: "2026/08/19",
      salary: "-1",
      contractType: "",
      address: "",
      emergencyContact: "",
      notes: "",
    })).rejects.toThrow();
  });
});
