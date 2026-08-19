import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { vi } from "vitest";

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

  it("réserve la gestion des comptes et projets aux administrateurs", async () => {
    const collaboratorCtx: TrpcContext = {
      user: { id: 2, openId: "test-collaborateur", email: "collab@agency.com", name: "Collaborateur Test", loginMethod: "manus", role: "collaborateur", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    };
    const supervisorCtx: TrpcContext = {
      ...collaboratorCtx,
      user: { ...collaboratorCtx.user!, id: 3, openId: "test-superviseur", email: "superviseur@agency.com", role: "superviseur" },
    };
    await expect(appRouter.createCaller(collaboratorCtx).admin.listUsers()).rejects.toThrow();
    await expect(appRouter.createCaller(supervisorCtx).admin.listProjects()).rejects.toThrow();
  });

  it("valide les identifiants des transitions de brouillon avant toute écriture", async () => {
    const ctx: TrpcContext = {
      user: { id: 1, openId: "test-admin-drafts", email: "admin-drafts@agency.com", name: "Admin Brouillons", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.billing.confirmQuoteDraft({ id: 0 })).rejects.toThrow();
    await expect(caller.billing.cancelInvoiceDraft({ id: 0 })).rejects.toThrow();
  });


describe("Permissions et espaces projet", () => {
  const contextFor = (role: "collaborateur" | "superviseur" | "admin"): TrpcContext => ({
    user: {
      id: role === "admin" ? 1 : role === "superviseur" ? 3 : 2,
      openId: `test-${role}`,
      email: `${role}@agency.com`,
      name: role,
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  });

  it("bloque une écriture RH sensible pour un collaborateur", async () => {
    const caller = appRouter.createCaller(contextFor("collaborateur"));
    await expect(caller.hr.createAgent({
      name: "Agent bloqué",
      email: "agent@example.com",
      phone: "",
      position: "Assistant",
      department: "Production",
      hireDate: "2026-08-19",
      salary: "1000",
      contractType: "CDI",
      address: "",
      emergencyContact: "",
      notes: "",
    })).rejects.toThrow();
  });

  it("valide côté serveur les données de création de compte admin", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.admin.createUser({ name: "Compte", email: "email-invalide", role: "collaborateur" })).rejects.toThrow();
  });

  it("refuse les identifiants de projet invalides avant accès aux données", async () => {
    const caller = appRouter.createCaller(contextFor("collaborateur"));
    await expect(caller.projects.setActive({ projectId: 0 })).rejects.toThrow();
    await expect(caller.preferences.update({ activeProjectId: 0 })).rejects.toThrow();
  });
});


type FakeDb = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createFakeDb(selectResults: unknown[][]): FakeDb {
  const queue = [...selectResults];
  const limitQuery = {
    limit: vi.fn(async () => queue.shift() ?? []),
  };
  const whereQuery = {
    where: vi.fn(() => limitQuery),
  };
  const fromQuery = {
    where: vi.fn(() => limitQuery),
    innerJoin: vi.fn(() => whereQuery),
  };
  const database: FakeDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => fromQuery),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  };
  return database;
}

async function withFakeDb<T>(selectResults: unknown[][], run: (database: FakeDb) => Promise<T>): Promise<T> {
  const database = createFakeDb(selectResults);
  const spy = vi.spyOn(db, "getDb").mockResolvedValue(database as any);
  try {
    return await run(database);
  } finally {
    spy.mockRestore();
  }
}

describe("Chemins de succès admin et transitions métier", () => {
  const adminContext: TrpcContext = {
    user: {
      id: 1,
      openId: "test-admin-success",
      email: "admin-success@agency.com",
      name: "Admin Success",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };

  it("crée un projet avec un responsable et évite un slug dupliqué", async () => {
    const caller = appRouter.createCaller(adminContext);
    const created = await withFakeDb([
      [],
      [{ id: 7 }],
      [{ id: 42, name: "Projet Alpha", slug: "projet-alpha", status: "actif" }],
    ], async (database) => {
      const result = await caller.admin.createProject({ name: "Projet Alpha", ownerUserId: 7, ownerRole: "superviseur" });
      expect(database.insert).toHaveBeenCalledTimes(2);
      return result;
    });
    expect(created).toHaveProperty("slug", "projet-alpha");

    await expect(withFakeDb([[{ id: 42 }]], async () => caller.admin.createProject({ name: "Projet Alpha" }))).rejects.toThrow();
  });

  it("affecte, met à jour et supprime un membre de projet", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([[{ id: 42 }], [{ id: 7 }], []], async (database) => {
      await expect(caller.admin.assignProjectMember({ projectId: 42, userId: 7, membershipRole: "collaborateur" })).resolves.toMatchObject({ success: true });
      expect(database.insert).toHaveBeenCalledTimes(1);
    });
    await withFakeDb([[{ id: 99 }]], async (database) => {
      await expect(caller.admin.removeProjectMember({ id: 99 })).resolves.toMatchObject({ success: true });
      expect(database.delete).toHaveBeenCalledTimes(1);
    });
    await expect(withFakeDb([[{ id: 42 }], []], async () => caller.admin.assignProjectMember({ projectId: 42, userId: 7, membershipRole: "admin" }))).rejects.toThrow();
  });

  it("renvoie une invitation pour un compte invité et refuse un compte actif", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([[{ id: 7, accountStatus: "invited", email: "invite@agency.com" }]], async (database) => {
      await expect(caller.admin.resendInvitation({ userId: 7 })).resolves.toMatchObject({ success: true, status: "invited" });
      expect(database.update).toHaveBeenCalledTimes(1);
    });
    await expect(withFakeDb([[{ id: 7, accountStatus: "active", email: "active@agency.com" }]], async () => caller.admin.resendInvitation({ userId: 7 }))).rejects.toThrow();
  });

  it("persiste le projet actif pour un administrateur et vérifie l’appartenance d’un collaborateur", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([], async (database) => {
      await expect(caller.projects.setActive({ projectId: 42 })).resolves.toMatchObject({ success: true, activeProjectId: 42 });
      expect(database.update).toHaveBeenCalledTimes(1);
    });

    const collaboratorContext: TrpcContext = { ...adminContext, user: { ...adminContext.user!, id: 2, role: "collaborateur", openId: "test-collab-project" } };
    const collaborator = appRouter.createCaller(collaboratorContext);
    await withFakeDb([[{ id: 99 }]], async () => {
      await expect(collaborator.projects.setActive({ projectId: 42 })).resolves.toMatchObject({ success: true, activeProjectId: 42 });
    });
    await expect(withFakeDb([[]], async () => collaborator.projects.setActive({ projectId: 42 }))).rejects.toThrow();
  });

  it("confirme et annule les brouillons, puis refuse toute transition hors brouillon", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([[{ id: 1, status: "brouillon" }]], async (database) => {
      await expect(caller.billing.confirmQuoteDraft({ id: 1 })).resolves.toMatchObject({ success: true, status: "envoyé" });
      expect(database.update).toHaveBeenCalledTimes(1);
    });
    await withFakeDb([[{ id: 2, status: "brouillon" }]], async () => {
      await expect(caller.billing.cancelQuoteDraft({ id: 2 })).resolves.toMatchObject({ success: true, status: "annulé" });
    });
    await withFakeDb([[{ id: 3, status: "émise" }]], async () => {
      await expect(caller.billing.confirmInvoiceDraft({ id: 3 })).rejects.toThrow();
    });
    await withFakeDb([[{ id: 4, status: "brouillon" }]], async () => {
      await expect(caller.billing.cancelInvoiceDraft({ id: 4 })).resolves.toMatchObject({ success: true, status: "annulée" });
    });
    await withFakeDb([[{ id: 5, status: "brouillon" }]], async () => {
      await expect(caller.billing.confirmInvoiceDraft({ id: 5 })).resolves.toMatchObject({ success: true, status: "émise" });
    });
    await withFakeDb([[{ id: 6, status: "payée" }]], async () => {
      await expect(caller.billing.cancelInvoiceDraft({ id: 6 })).rejects.toThrow();
    });
    await withFakeDb([[{ id: 7, status: "envoyé" }]], async () => {
      await expect(caller.billing.confirmQuoteDraft({ id: 7 })).rejects.toThrow();
      await expect(caller.billing.cancelQuoteDraft({ id: 7 })).rejects.toThrow();
    });
    await expect(withFakeDb([[]], async () => caller.billing.confirmQuoteDraft({ id: 999 }))).rejects.toThrow("Devis introuvable");
  });

  it("persiste les préférences et refuse un projet actif non accessible", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([], async (database) => {
      await expect(caller.preferences.update({ currency: "MGA", showMGAEquivalent: true })).resolves.toMatchObject({ success: true });
      expect(database.update).toHaveBeenCalledTimes(1);
    });
    const collaborator = appRouter.createCaller({ ...adminContext, user: { ...adminContext.user!, id: 2, role: "collaborateur", openId: "test-pref-collab" } });
    await expect(withFakeDb([[]], async () => collaborator.preferences.update({ activeProjectId: 42 }))).rejects.toThrow("Vous n’êtes pas membre de ce projet");
  });

  it("refuse les mutations par identifiant hors du projet actif", async () => {
    const caller = appRouter.createCaller({ ...adminContext, user: { ...adminContext.user!, activeProjectId: 42 } });
    await expect(withFakeDb([[]], async () => caller.crm.updateLeadStatus({ id: 9, status: "contacté" }))).rejects.toThrow("Lead introuvable");
    await expect(withFakeDb([[]], async () => caller.crm.updateLead({
      id: 9,
      companyName: "Projet étranger",
      contactName: "Contact",
      email: "contact@example.com",
      phone: "",
      expectedAmount: "1000",
      priority: "moyenne",
      status: "nouveau",
      nextContactDate: "",
      notes: "",
    }))).rejects.toThrow("Lead introuvable");
    await expect(withFakeDb([[]], async () => caller.billing.updateQuoteStatus({ id: 9, status: "envoyé" }))).rejects.toThrow("Devis introuvable");
    await expect(withFakeDb([[]], async () => caller.billing.updateInvoiceStatus({ id: 9, status: "émise" }))).rejects.toThrow("Facture introuvable");
    await expect(withFakeDb([[]], async () => caller.accounting.updateTransaction({ id: 9, type: "entrée", category: "Test", amount: "100", currency: "EUR", exchangeRate: "1", date: "2026-08-19", paymentMethod: "Virement", reference: "REF-9", description: "Test", internalNote: "" }))).rejects.toThrow("Mouvement introuvable");
    await expect(withFakeDb([[]], async () => caller.billing.updateCatalogItem({ id: 9, itemType: "prestation", label: "Service", description: "", unit: "forfait", unitPrice: "100", currency: "EUR", pricingMode: "ponctuel", taxRate: "0", clientVisible: true, status: "actif" }))).rejects.toThrow("Article catalogue introuvable");
    await expect(withFakeDb([[]], async () => caller.hr.updateTimeEntry({ id: 9, date: "2026-08-19", hoursWorked: "8", status: "présent", notes: "" }))).rejects.toThrow("Pointage introuvable");
  });

  it("crée un projet avec le template choisi et l’active pour son administrateur", async () => {
    const caller = appRouter.createCaller(adminContext);
    const created = await withFakeDb([
      [],
      [{ id: 7 }],
      [{ id: 55, name: "Studio Nova", slug: "studio-nova", managementTemplate: "studio_creatif", defaultCurrency: "EUR", jurisdiction: "mg", status: "actif" }],
    ], async (database) => {
      const result = await caller.admin.createProject({ name: "Studio Nova", managementTemplate: "studio_creatif", defaultCurrency: "EUR", jurisdiction: "mg", ownerUserId: 7, ownerRole: "superviseur" });
      expect(database.insert).toHaveBeenCalledTimes(2);
      expect(database.update).toHaveBeenCalledTimes(1);
      return result;
    });
    expect(created).toMatchObject({ id: 55, managementTemplate: "studio_creatif", defaultCurrency: "EUR", jurisdiction: "mg", activatedForCreator: true });
  });
});


describe("RBAC configurable et workflow RH collaborateur", () => {
  const adminContext: TrpcContext = {
    user: { id: 1, openId: "rbac-admin", email: "rbac-admin@agency.com", name: "Admin RBAC", loginMethod: "manus", role: "admin", activeProjectId: 42, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };

  it("permet à l’admin de configurer une permission et refuse de désactiver les droits admin", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([[]], async (database) => {
      await expect(caller.admin.updateRolePermission({ role: "collaborateur", permissionKey: "hr.request.create", enabled: true })).resolves.toMatchObject({ success: true, enabled: true });
      expect(database.insert).toHaveBeenCalledTimes(1);
    });
    await expect(withFakeDb([[]], async () => caller.admin.updateRolePermission({ role: "admin", permissionKey: "hr.request.create", enabled: false }))).rejects.toThrow("toujours disponibles");
  });

  it("permet à l’admin de masquer le CA d’un projet existant", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([[{ id: 42 }]], async (database) => {
      await expect(caller.admin.updateRevenueVisibility({ projectId: 42, showRevenueDashboard: false })).resolves.toMatchObject({ success: true, showRevenueDashboard: false });
      expect(database.update).toHaveBeenCalledTimes(1);
    });
  });

  it("refuse la modification et la suppression d’un pointage au collaborateur", async () => {
    const collaboratorContext: TrpcContext = { ...adminContext, user: { ...adminContext.user!, id: 2, role: "collaborateur", openId: "rbac-collaborateur", email: "collab@agency.com" } };
    const caller = appRouter.createCaller(collaboratorContext);
    await expect(withFakeDb([[]], async () => caller.hr.updateTimeEntry({ id: 10, date: "2026-08-19", hoursWorked: "8", status: "présent", notes: "" }))).rejects.toThrow("hr.timeEntry.edit");
    await expect(withFakeDb([[]], async () => caller.hr.deleteTimeEntry({ id: 10 }))).rejects.toThrow("hr.timeEntry.delete");
  });

  it("crée un ticket RH automatiquement avec la demande de congé", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([[{ id: 4, name: "Agent RH" }]], async (database) => {
      const result = await caller.hr.createLeave({ agentId: 4, leaveType: "Annuel", startDate: "2026-08-20", endDate: "2026-08-21", daysCount: 2, reason: "Congé familial" });
      expect(result).toMatchObject({ success: true });
      expect(database.insert).toHaveBeenCalledTimes(2);
      expect(database.insert.mock.calls[1][0]).toBeDefined();
    });
  });
});


describe("Synchronisation des tickets RH", () => {
  const adminContext: TrpcContext = {
    user: { id: 1, openId: "ticket-admin", email: "ticket-admin@agency.com", name: "Admin Tickets", loginMethod: "manus", role: "admin", activeProjectId: 42, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: () => {} } as any,
  };

  it("propage le statut d’un ticket congé ou avance vers la gestion RH", async () => {
    const caller = appRouter.createCaller(adminContext);
    await withFakeDb([[{ id: 21, agentId: 4, requestType: "conge", requestId: 7 }]], async (database) => {
      await expect(caller.hr.updateTicketStatus({ id: 21, status: "résolu" })).resolves.toMatchObject({ success: true });
      expect(database.update).toHaveBeenCalledTimes(2);
    });
    await withFakeDb([[{ id: 22, agentId: 4, requestType: "avance", requestId: 8 }]], async (database) => {
      await expect(caller.hr.updateTicketStatus({ id: 22, status: "fermé" })).resolves.toMatchObject({ success: true });
      expect(database.update).toHaveBeenCalledTimes(2);
    });
  });
});
