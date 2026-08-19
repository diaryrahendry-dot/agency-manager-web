import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { 
  agents, timeEntries, leaves, salaryAdvances, contracts, 
  tickets, cashTransactions, leads, clients, clientInteractions, documents, 
  quotes, invoices 
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "./storage";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Module RH
  hr: router({
    listAgents: protectedProcedure.query(async () => {
      return await db.getAgents();
    }),
    createAgent: protectedProcedure.input(z.object({
      name: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      position: z.string(),
      department: z.string(),
      hireDate: z.string(),
      salary: z.string(),
      contractType: z.string(),
      address: z.string().optional(),
      emergencyContact: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(agents).values({
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        position: input.position,
        department: input.department,
        hireDate: input.hireDate,
        salary: input.salary,
        contractType: input.contractType,
        address: input.address || null,
        emergencyContact: input.emergencyContact || null,
        notes: input.notes || null,
      } as any);
      return { success: true };
    }),

    listTimeEntries: protectedProcedure.query(async () => {
      return await db.getTimeEntries();
    }),
    createTimeEntry: protectedProcedure.input(z.object({
      agentId: z.number(),
      date: z.string(),
      hoursWorked: z.string(),
      status: z.enum(["présent", "absent", "retard", "congé"]),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(timeEntries).values({
        agentId: input.agentId,
        date: input.date,
        hoursWorked: input.hoursWorked,
        status: input.status,
        notes: input.notes || null,
      } as any);
      return { success: true };
    }),

    listLeaves: protectedProcedure.query(async () => {
      return await db.getLeaves();
    }),
    createLeave: protectedProcedure.input(z.object({
      agentId: z.number(),
      leaveType: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      daysCount: z.number(),
      reason: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(leaves).values({
        agentId: input.agentId,
        leaveType: input.leaveType,
        startDate: input.startDate,
        endDate: input.endDate,
        daysCount: input.daysCount,
        reason: input.reason || null,
      } as any);
      return { success: true };
    }),
    updateLeaveStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["en_attente", "approuvé", "refusé"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(leaves).set({ status: input.status }).where(eq(leaves.id, input.id));
      return { success: true };
    }),

    listSalaryAdvances: protectedProcedure.query(async () => {
      return await db.getSalaryAdvances();
    }),
    createSalaryAdvance: protectedProcedure.input(z.object({
      agentId: z.number(),
      amount: z.string(),
      requestedDate: z.string(),
      deductionMonth: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(salaryAdvances).values({
        agentId: input.agentId,
        amount: input.amount,
        requestedDate: input.requestedDate,
        deductionMonth: input.deductionMonth,
        notes: input.notes || null,
      } as any);
      return { success: true };
    }),
    updateSalaryAdvanceStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["demandé", "accordé", "déduit", "refusé"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(salaryAdvances).set({ status: input.status }).where(eq(salaryAdvances.id, input.id));
      return { success: true };
    }),

    listContracts: protectedProcedure.query(async () => {
      return await db.getContracts();
    }),
    createContract: protectedProcedure.input(z.object({
      agentId: z.number(),
      title: z.string(),
      contractType: z.string(),
      startDate: z.string(),
      endDate: z.string().optional(),
      documentUrl: z.string().optional(),
      documentKey: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(contracts).values({
        agentId: input.agentId,
        title: input.title,
        contractType: input.contractType,
        startDate: input.startDate,
        endDate: input.endDate || null,
        documentUrl: input.documentUrl || null,
        documentKey: input.documentKey || null,
      } as any);
      return { success: true };
    }),

    listTickets: protectedProcedure.query(async () => {
      return await db.getTickets();
    }),
    createTicket: protectedProcedure.input(z.object({
      title: z.string(),
      description: z.string(),
      agentId: z.number().optional(),
      clientId: z.number().optional(),
      priority: z.enum(["basse", "normale", "haute", "urgente"]),
      category: z.string(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(tickets).values({
        title: input.title,
        description: input.description,
        agentId: input.agentId || null,
        clientId: input.clientId || null,
        priority: input.priority,
        category: input.category,
      } as any);
      return { success: true };
    }),
    updateTicketStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["ouvert", "en_cours", "résolu", "fermé"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(tickets).set({ status: input.status }).where(eq(tickets.id, input.id));
      return { success: true };
    }),
  }),

  // Module Comptabilité
  accounting: router({
    listTransactions: protectedProcedure.query(async () => {
      return await db.getCashTransactions();
    }),
    createTransaction: protectedProcedure.input(z.object({
      type: z.enum(["entrée", "sortie"]),
      category: z.string(),
      amount: z.string(),
      date: z.string(),
      paymentMethod: z.string(),
      reference: z.string().optional(),
      description: z.string(),
      attachedUrl: z.string().optional(),
      attachedKey: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(cashTransactions).values({
        type: input.type,
        category: input.category,
        amount: input.amount,
        date: input.date,
        paymentMethod: input.paymentMethod,
        reference: input.reference || null,
        description: input.description,
        attachedUrl: input.attachedUrl || null,
        attachedKey: input.attachedKey || null,
      } as any);
      return { success: true };
    }),
    summary: protectedProcedure.query(async () => {
      const txs = await db.getCashTransactions();
      let totalEntrees = 0;
      let totalSorties = 0;
      for (const t of txs) {
        const amt = Number(t.amount);
        if (t.type === "entrée") totalEntrees += amt;
        else totalSorties += amt;
      }
      return {
        totalEntrees,
        totalSorties,
        solde: totalEntrees - totalSorties,
        transactionsCount: txs.length,
      };
    }),
  }),

  // Module CRM Leads
  crm: router({
    listLeads: protectedProcedure.query(async () => {
      return await db.getLeads();
    }),
    createLead: protectedProcedure.input(z.object({
      companyName: z.string(),
      contactName: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      expectedAmount: z.string(),
      priority: z.enum(["basse", "moyenne", "haute", "urgente"]),
      status: z.enum(["nouveau", "contacté", "proposition", "negociation", "gagne", "perdu"]),
      nextContactDate: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(leads).values({
        companyName: input.companyName,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone || null,
        expectedAmount: input.expectedAmount,
        priority: input.priority,
        status: input.status,
        nextContactDate: input.nextContactDate || null,
        notes: input.notes || null,
      } as any);
      return { success: true };
    }),
    updateLeadStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["nouveau", "contacté", "proposition", "negociation", "gagne", "perdu"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(leads).set({ status: input.status }).where(eq(leads.id, input.id));
      return { success: true };
    }),
    convertLeadToClient: protectedProcedure.input(z.object({
      leadId: z.number(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      
      const leadRes = await database.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
      if (leadRes.length === 0) throw new Error("Lead introuvable");
      const lead = leadRes[0];

      await database.insert(clients).values({
        companyName: lead.companyName,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        notes: `Converti depuis le lead #${lead.id}. ${lead.notes || ''}`,
        category: "Standard",
        status: "actif",
      });

      await database.update(leads).set({ status: "gagne" }).where(eq(leads.id, input.leadId));

      return { success: true };
    }),
  }),

  // Module Base Clients & Documents
  clientsModule: router({
    listClients: protectedProcedure.query(async () => {
      return await db.getClients();
    }),
    createClient: protectedProcedure.input(z.object({
      companyName: z.string(),
      contactName: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      address: z.string().optional(),
      industry: z.string().optional(),
      category: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(clients).values({
        companyName: input.companyName,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone || null,
        address: input.address || null,
        industry: input.industry || null,
        category: input.category,
        notes: input.notes || null,
      });
      return { success: true };
    }),
    listInteractions: protectedProcedure.query(async () => {
      return await db.getClientInteractions();
    }),
    createInteraction: protectedProcedure.input(z.object({
      clientId: z.number(),
      type: z.string(),
      summary: z.string(),
      agentName: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(clientInteractions).values({
        clientId: input.clientId,
        type: input.type,
        summary: input.summary,
        agentName: input.agentName || null,
      });
      return { success: true };
    }),
    listDocuments: protectedProcedure.query(async () => {
      return await db.getDocuments();
    }),
    uploadDocument: protectedProcedure.input(z.object({
      title: z.string(),
      category: z.string(),
      entityId: z.number().optional(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileSize: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");

      const buffer = Buffer.from(input.fileBase64.split(",")[1] || input.fileBase64, 'base64');
      const storageKey = `documents/${Date.now()}-${input.fileName}`;
      const mimeType = input.fileName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';

      const uploadResult = await storagePut(storageKey, buffer, mimeType);

      await database.insert(documents).values({
        title: input.title,
        category: input.category,
        entityId: input.entityId || null,
        fileUrl: uploadResult.url,
        fileKey: uploadResult.key,
        fileSize: input.fileSize || "1 MB",
      });

      return { success: true, url: uploadResult.url };
    }),
  }),

  // Module Facturation et Devis
  billing: router({
    listQuotes: protectedProcedure.query(async () => {
      return await db.getQuotes();
    }),
    createQuote: protectedProcedure.input(z.object({
      quoteNumber: z.string(),
      clientId: z.number(),
      issueDate: z.string(),
      validUntil: z.string(),
      totalAmount: z.string(),
      itemsJson: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(quotes).values({
        quoteNumber: input.quoteNumber,
        clientId: input.clientId,
        issueDate: input.issueDate,
        validUntil: input.validUntil,
        totalAmount: input.totalAmount,
        itemsJson: input.itemsJson,
        notes: input.notes || null,
        status: "brouillon",
      } as any);
      return { success: true };
    }),
    updateQuoteStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["brouillon", "envoyé", "accepté", "refusé", "facturé"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(quotes).set({ status: input.status }).where(eq(quotes.id, input.id));
      return { success: true };
    }),

    listInvoices: protectedProcedure.query(async () => {
      return await db.getInvoices();
    }),
    createInvoice: protectedProcedure.input(z.object({
      invoiceNumber: z.string(),
      clientId: z.number(),
      quoteId: z.number().optional(),
      issueDate: z.string(),
      dueDate: z.string(),
      totalAmount: z.string(),
      itemsJson: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(invoices).values({
        invoiceNumber: input.invoiceNumber,
        clientId: input.clientId,
        quoteId: input.quoteId || null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        totalAmount: input.totalAmount,
        itemsJson: input.itemsJson,
        notes: input.notes || null,
        status: "brouillon",
      } as any);
      return { success: true };
    }),
    updateInvoiceStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["brouillon", "émise", "payée", "en_retard", "annulée"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(invoices).set({ status: input.status }).where(eq(invoices.id, input.id));
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
