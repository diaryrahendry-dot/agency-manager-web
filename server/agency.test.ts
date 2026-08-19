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
});
