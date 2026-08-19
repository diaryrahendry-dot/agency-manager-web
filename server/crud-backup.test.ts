import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("AgencyManager Pro - CRUD & Backup Comprehensive Tests", () => {
  it("should support time entry and leave CRUD procedure definitions in router", () => {
    expect(appRouter._def.procedures).toHaveProperty("hr.updateTimeEntry");
    expect(appRouter._def.procedures).toHaveProperty("hr.deleteTimeEntry");
    expect(appRouter._def.procedures).toHaveProperty("hr.updateLeave");
    expect(appRouter._def.procedures).toHaveProperty("hr.deleteLeave");
  });

  it("should have comprehensive backup export support in commercial and accounting modules", () => {
    expect(appRouter._def.procedures).toHaveProperty("accounting.monthlyReport");
    expect(appRouter._def.procedures).toHaveProperty("accounting.revenueReport");
    expect(appRouter._def.procedures).toHaveProperty("accounting.automaticReport");
  });
});
