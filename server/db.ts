import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, agents, timeEntries, leaves, salaryAdvances, contracts, 
  tickets, cashTransactions, leads, clients, clientInteractions, documents, 
  quotes, invoices, catalogItems 
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    if (user.email) {
      const invited = await db.select().from(users).where(and(eq(users.email, user.email), eq(users.accountStatus, "invited"))).limit(1);
      if (invited[0] && invited[0].openId !== user.openId) {
        const activationSet: Record<string, unknown> = {
          openId: user.openId,
          name: user.name ?? invited[0].name,
          email: user.email,
          loginMethod: user.loginMethod ?? invited[0].loginMethod,
          accountStatus: "active",
          invitationToken: null,
          lastSignedIn: user.lastSignedIn ?? new Date(),
        };
        await db.update(users).set(activationSet as any).where(eq(users.id, invited[0].id));
        return;
      }
    }

    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Helpers RH
export async function getAgents(projectId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(agents).where(or(eq(agents.projectId, projectId), isNull(agents.projectId))).orderBy(desc(agents.id));
  return db.select().from(agents).orderBy(desc(agents.id));
}

export async function getAgent(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const res = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return res[0];
}

export async function getTimeEntries(agentId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (agentId) {
    return db.select().from(timeEntries).where(eq(timeEntries.agentId, agentId)).orderBy(desc(timeEntries.date));
  }
  return db.select().from(timeEntries).orderBy(desc(timeEntries.date));
}

export async function getLeaves() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leaves).orderBy(desc(leaves.id));
}

export async function getSalaryAdvances() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(salaryAdvances).orderBy(desc(salaryAdvances.id));
}

export async function getContracts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contracts).orderBy(desc(contracts.id));
}

export async function getTickets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tickets).orderBy(desc(tickets.id));
}

// Helpers Compta
export async function getCashTransactions(projectId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(cashTransactions).where(or(eq(cashTransactions.projectId, projectId), isNull(cashTransactions.projectId))).orderBy(desc(cashTransactions.date));
  return db.select().from(cashTransactions).orderBy(desc(cashTransactions.date));
}

// Helpers CRM Leads
export async function getLeads(projectId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(leads).where(or(eq(leads.projectId, projectId), isNull(leads.projectId))).orderBy(desc(leads.id));
  return db.select().from(leads).orderBy(desc(leads.id));
}

// Helpers Clients
export async function getClients(projectId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(clients).where(or(eq(clients.projectId, projectId), isNull(clients.projectId))).orderBy(desc(clients.id));
  return db.select().from(clients).orderBy(desc(clients.id));
}

export async function getClientInteractions(clientId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (clientId) {
    return db.select().from(clientInteractions).where(eq(clientInteractions.clientId, clientId)).orderBy(desc(clientInteractions.date));
  }
  return db.select().from(clientInteractions).orderBy(desc(clientInteractions.date));
}

export async function getDocuments(entityId?: number, category?: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).orderBy(desc(documents.id));
}

// Helpers Facturation & Devis
export async function getQuotes(projectId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(quotes).where(or(eq(quotes.projectId, projectId), isNull(quotes.projectId))).orderBy(desc(quotes.id));
  return db.select().from(quotes).orderBy(desc(quotes.id));
}

export async function getInvoices(projectId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(invoices).where(or(eq(invoices.projectId, projectId), isNull(invoices.projectId))).orderBy(desc(invoices.id));
  return db.select().from(invoices).orderBy(desc(invoices.id));
}

export async function getCatalogItems(projectId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (projectId) return db.select().from(catalogItems).where(or(eq(catalogItems.projectId, projectId), isNull(catalogItems.projectId))).orderBy(desc(catalogItems.id));
  return db.select().from(catalogItems).orderBy(desc(catalogItems.id));
}
