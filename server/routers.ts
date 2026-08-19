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

function dateKey(value: string | Date | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function amountOf(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

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
      name: z.string().trim().min(1, "Le nom est obligatoire"),
      email: z.string().trim().email("L’email professionnel est invalide"),
      phone: z.string().trim().optional(),
      position: z.string().trim().min(1, "Le poste est obligatoire"),
      department: z.string().trim().min(1, "Le département est obligatoire"),
      hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date d’embauche est invalide"),
      salary: z.string().trim().refine(value => Number.isFinite(Number(value)) && Number(value) >= 0, "Le salaire doit être un montant positif"),
      contractType: z.string().trim().min(1, "Le type de contrat est obligatoire"),
      address: z.string().trim().optional(),
      emergencyContact: z.string().trim().optional(),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      try {
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
      } catch (error) {
        console.error("[HR] Failed to create agent", error);
        throw new Error("Impossible d’enregistrer cet employé. Vérifiez les informations saisies et réessayez.");
      }
    }),

    listTimeEntries: protectedProcedure.input(z.object({ agentId: z.number().optional() }).optional()).query(async ({ input }) => {
      return await db.getTimeEntries(input?.agentId);
    }),
    createTimeEntry: protectedProcedure.input(z.object({
      agentId: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date du pointage est invalide"),
      hoursWorked: z.string().trim().refine(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 24, "Les heures doivent être comprises entre 0 et 24"),
      status: z.enum(["présent", "absent", "retard", "congé"]),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const agent = await database.select({ id: agents.id }).from(agents).where(eq(agents.id, input.agentId)).limit(1);
      if (agent.length === 0) throw new Error("Agent introuvable");
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
    convertQuoteToTransaction: protectedProcedure.input(z.object({
      quoteId: z.number().int().positive(),
      paymentMethod: z.string().trim().min(1).default("À encaisser"),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const quoteRows = await database.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
      const quote = quoteRows[0];
      if (!quote) throw new Error("Devis introuvable");
      if (quote.status === "facturé") throw new Error("Ce devis est déjà présent dans la comptabilité");
      const existingTransactions = await db.getCashTransactions();
      if (existingTransactions.some(transaction => transaction.reference === quote.quoteNumber)) {
        throw new Error("Ce devis possède déjà un mouvement comptable associé");
      }
      await database.insert(cashTransactions).values({
        type: "entrée",
        category: "Vente / Devis",
        amount: String(quote.totalAmount),
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: input.paymentMethod,
        reference: quote.quoteNumber,
        description: `Conversion du ${quote.quoteNumber} en entrée comptable`,
      } as any);
      await database.update(quotes).set({ status: "facturé" }).where(eq(quotes.id, input.quoteId));
      return { success: true, quoteNumber: quote.quoteNumber };
    }),
    summary: protectedProcedure.query(async () => {
      const txs = await db.getCashTransactions();
      let totalEntrees = 0;
      let totalSorties = 0;
      for (const t of txs) {
        const amt = amountOf(t.amount);
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
    revenueReport: protectedProcedure.input(z.object({
      year: z.number().int().min(2000).max(2100).optional(),
    }).optional()).query(async ({ input }) => {
      const selectedYear = input?.year ?? new Date().getFullYear();
      const [transactions, allInvoices] = await Promise.all([db.getCashTransactions(), db.getInvoices()]);
      const months = Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(selectedYear, index, 1)),
        revenue: 0,
        expenses: 0,
        invoiced: 0,
        paid: 0,
      }));
      const annualMap = new Map<number, { year: number; revenue: number; expenses: number; invoiced: number; paid: number }>();
      const ensureAnnual = (year: number) => {
        if (!annualMap.has(year)) annualMap.set(year, { year, revenue: 0, expenses: 0, invoiced: 0, paid: 0 });
        return annualMap.get(year)!;
      };

      for (const transaction of transactions) {
        const key = dateKey(transaction.date);
        const year = Number(key.slice(0, 4));
        const month = Number(key.slice(5, 7));
        if (!year) continue;
        const annual = ensureAnnual(year);
        const amount = amountOf(transaction.amount);
        if (transaction.type === "entrée") annual.revenue += amount;
        else annual.expenses += amount;
        if (year === selectedYear && month >= 1 && month <= 12) {
          const item = months[month - 1];
          if (transaction.type === "entrée") item.revenue += amount;
          else item.expenses += amount;
        }
      }

      for (const invoice of allInvoices) {
        const key = dateKey(invoice.issueDate);
        const year = Number(key.slice(0, 4));
        const month = Number(key.slice(5, 7));
        if (!year) continue;
        const annual = ensureAnnual(year);
        const amount = amountOf(invoice.totalAmount);
        if (invoice.status !== "annulée") annual.invoiced += amount;
        if (invoice.status === "payée") annual.paid += amount;
        if (year === selectedYear && month >= 1 && month <= 12) {
          const item = months[month - 1];
          if (invoice.status !== "annulée") item.invoiced += amount;
          if (invoice.status === "payée") item.paid += amount;
        }
      }

      const yearInvoices = allInvoices.filter((invoice) => Number(dateKey(invoice.issueDate).slice(0, 4)) === selectedYear);
      const overdueInvoices = yearInvoices.filter((invoice) => invoice.status === "en_retard").length;
      return {
        year: selectedYear,
        months,
        annual: Array.from(annualMap.values()).sort((a, b) => a.year - b.year).slice(-6),
        kpis: {
          revenue: months.reduce((sum, item) => sum + item.revenue, 0),
          expenses: months.reduce((sum, item) => sum + item.expenses, 0),
          invoiced: months.reduce((sum, item) => sum + item.invoiced, 0),
          paid: months.reduce((sum, item) => sum + item.paid, 0),
          overdueInvoices,
        },
        generatedAt: new Date().toISOString(),
      };
    }),
    automaticReport: protectedProcedure.query(async () => {
      const year = new Date().getFullYear();
      const report = await (async () => {
        const transactions = await db.getCashTransactions();
        const invoices = await db.getInvoices();
        const currentMonth = new Date().getMonth() + 1;
        const currentMonthKey = `${year}-${String(currentMonth).padStart(2, "0")}`;
        const monthTransactions = transactions.filter((item) => dateKey(item.date).startsWith(currentMonthKey));
        const monthInvoices = invoices.filter((item) => dateKey(item.issueDate).startsWith(currentMonthKey));
        return {
          monthLabel: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(year, currentMonth - 1, 1)),
          collected: monthTransactions.filter((item) => item.type === "entrée").reduce((sum, item) => sum + amountOf(item.amount), 0),
          expenses: monthTransactions.filter((item) => item.type === "sortie").reduce((sum, item) => sum + amountOf(item.amount), 0),
          invoicesCount: monthInvoices.length,
          unpaidCount: monthInvoices.filter((item) => item.status !== "payée" && item.status !== "annulée").length,
        };
      })();
      return { ...report, generatedAt: new Date().toISOString() };
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
    updateLead: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      companyName: z.string().trim().min(1, "L’entreprise est obligatoire"),
      contactName: z.string().trim().min(1, "Le contact est obligatoire"),
      email: z.string().trim().email("L’email du lead est invalide"),
      phone: z.string().trim().optional(),
      expectedAmount: z.string().trim().refine(value => Number.isFinite(Number(value)) && Number(value) >= 0, "Le montant attendu est invalide"),
      priority: z.enum(["basse", "moyenne", "haute", "urgente"]),
      status: z.enum(["nouveau", "contacté", "proposition", "negociation", "gagne", "perdu"]),
      nextContactDate: z.string().optional(),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(leads).set({
        companyName: input.companyName,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone || null,
        expectedAmount: input.expectedAmount,
        priority: input.priority,
        status: input.status,
        nextContactDate: input.nextContactDate || null,
        notes: input.notes || null,
      } as any).where(eq(leads.id, input.id));
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
      termsAndConditions: z.string().optional(),
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
        termsAndConditions: input.termsAndConditions || null,
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
      termsAndConditions: z.string().optional(),
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
        termsAndConditions: input.termsAndConditions || null,
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
    updateInvoiceDraft: protectedProcedure.input(z.object({
      id: z.number(),
      clientId: z.number(),
      quoteId: z.number().optional(),
      issueDate: z.string(),
      dueDate: z.string(),
      totalAmount: z.string(),
      itemsJson: z.string(),
      notes: z.string().optional(),
      termsAndConditions: z.string().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
      if (existing.length === 0) throw new Error("Facture introuvable");
      if (existing[0].status !== "brouillon") throw new Error("Seules les factures en brouillon peuvent être modifiées");
      await database.update(invoices).set({
        clientId: input.clientId,
        quoteId: input.quoteId || null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        totalAmount: input.totalAmount,
        itemsJson: input.itemsJson,
        notes: input.notes || null,
        termsAndConditions: input.termsAndConditions || null,
      } as any).where(eq(invoices.id, input.id));
      return { success: true };
    }),
    nextQuoteNumber: protectedProcedure.query(async () => {
      const quoteList = await db.getQuotes();
      const currentYear = new Date().getFullYear();
      const maxSequence = quoteList.reduce((max, quote) => {
        const match = String(quote.quoteNumber).match(new RegExp(`DEV-${currentYear}-(\\d+)`));
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      return `DEV-${currentYear}-${String(maxSequence + 1).padStart(3, "0")}`;
    }),
    nextInvoiceNumber: protectedProcedure.query(async () => {
      const invoiceList = await db.getInvoices();
      const currentYear = new Date().getFullYear();
      const maxSequence = invoiceList.reduce((max, invoice) => {
        const match = String(invoice.invoiceNumber).match(new RegExp(`FAC-${currentYear}-(\\d+)`));
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      return `FAC-${currentYear}-${String(maxSequence + 1).padStart(3, "0")}`;
    }),
  }),
});

export type AppRouter = typeof appRouter;
