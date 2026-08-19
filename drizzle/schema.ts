import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, date } from "drizzle-orm/mysql-core";

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;



export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// 1. Module RH
export const agents = mysqlTable("agents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  position: varchar("position", { length: 150 }).notNull(),
  department: varchar("department", { length: 100 }).notNull(),
  hireDate: date("hireDate").notNull(),
  salary: decimal("salary", { precision: 10, scale: 2 }).notNull(),
  contractType: varchar("contractType", { length: 50 }).default("CDI").notNull(), // CDI, CDD, Stage, etc.
  status: mysqlEnum("status", ["actif", "inactif", "conge"]).default("actif").notNull(),
  address: text("address"),
  emergencyContact: text("emergencyContact"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const timeEntries = mysqlTable("time_entries", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  date: date("date").notNull(),
  hoursWorked: decimal("hoursWorked", { precision: 4, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["présent", "absent", "retard", "congé"]).default("présent").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const leaves = mysqlTable("leaves", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  leaveType: varchar("leaveType", { length: 50 }).notNull(), // Annuel, Maladie, Sans solde, etc.
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  daysCount: int("daysCount").notNull(),
  status: mysqlEnum("status", ["en_attente", "approuvé", "refusé"]).default("en_attente").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const salaryAdvances = mysqlTable("salary_advances", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  requestedDate: date("requestedDate").notNull(),
  status: mysqlEnum("status", ["demandé", "accordé", "déduit", "refusé"]).default("demandé").notNull(),
  deductionMonth: varchar("deductionMonth", { length: 20 }).notNull(), // ex: "2026-09"
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  contractType: varchar("contractType", { length: 50 }).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate"),
  documentUrl: text("documentUrl"),
  documentKey: text("documentKey"),
  status: mysqlEnum("status", ["actif", "expiré", "résilié"]).default("actif").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const tickets = mysqlTable("tickets", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  agentId: int("agentId"), // Assigné à l'agent
  clientId: int("clientId"), // Lié au client optionnel
  priority: mysqlEnum("priority", ["basse", "normale", "haute", "urgente"]).default("normale").notNull(),
  status: mysqlEnum("status", ["ouvert", "en_cours", "résolu", "fermé"]).default("ouvert").notNull(),
  category: varchar("category", { length: 100 }).default("Technique").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 2. Module Comptabilité
export const cashTransactions = mysqlTable("cash_transactions", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["entrée", "sortie"]).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // ex: "Vente client", "Loyer", "Salaires", "Fournitures"
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(), // Montant de référence en EUR pour les agrégations historiques
  currency: mysqlEnum("currency", ["EUR", "MGA"]).default("EUR").notNull(),
  amountInCurrency: decimal("amountInCurrency", { precision: 14, scale: 2 }).default("0.00").notNull(), // Montant effectivement saisi dans la devise choisie
  exchangeRate: decimal("exchangeRate", { precision: 12, scale: 2 }).default("1.00").notNull(), // MGA par EUR, ou 1 pour EUR
  date: date("date").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 50 }).default("Virement").notNull(),
  reference: varchar("reference", { length: 100 }),
  description: text("description").notNull(),
  internalNote: text("internalNote"),
  attachedUrl: text("attachedUrl"),
  attachedKey: text("attachedKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 3. CRM Leads
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 150 }).notNull(),
  contactName: varchar("contactName", { length: 150 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  expectedAmount: decimal("expectedAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  priority: mysqlEnum("priority", ["basse", "moyenne", "haute", "urgente"]).default("moyenne").notNull(),
  status: mysqlEnum("status", ["nouveau", "contacté", "proposition", "negociation", "gagne", "perdu"]).default("nouveau").notNull(),
  nextContactDate: date("nextContactDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 4. Base Clients
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 150 }).notNull(),
  contactName: varchar("contactName", { length: 150 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  industry: varchar("industry", { length: 100 }),
  category: varchar("category", { length: 50 }).default("Standard").notNull(), // Standard, VIP, Partenaire
  status: mysqlEnum("status", ["actif", "inactif"]).default("actif").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const clientInteractions = mysqlTable("client_interactions", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  type: varchar("type", { length: 50 }).default("Appel").notNull(), // Appel, Email, Réunion, Note
  summary: text("summary").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  agentName: varchar("agentName", { length: 150 }),
});

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // "RH", "Client", "Compta", "Contrat"
  entityId: int("entityId"), // ID associé (agentId, clientId, etc.)
  fileUrl: text("fileUrl").notNull(),
  fileKey: text("fileKey").notNull(),
  fileSize: varchar("fileSize", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// 5. Facturation & Devis
export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  quoteNumber: varchar("quoteNumber", { length: 50 }).notNull().unique(),
  clientId: int("clientId").notNull(),
  issueDate: date("issueDate").notNull(),
  validUntil: date("validUntil").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["brouillon", "envoyé", "accepté", "refusé", "facturé"]).default("brouillon").notNull(),
  itemsJson: text("itemsJson").notNull(), // JSON des lignes de devis
  notes: text("notes"),
  termsAndConditions: text("termsAndConditions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull().unique(),
  clientId: int("clientId").notNull(),
  quoteId: int("quoteId"),
  issueDate: date("issueDate").notNull(),
  dueDate: date("dueDate").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["brouillon", "émise", "payée", "en_retard", "annulée"]).default("brouillon").notNull(),
  itemsJson: text("itemsJson").notNull(), // JSON des lignes de facture
  notes: text("notes"),
  termsAndConditions: text("termsAndConditions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});


export type TimeEntry = typeof timeEntries.$inferSelect;
export type Leave = typeof leaves.$inferSelect;
export type SalaryAdvance = typeof salaryAdvances.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type CashTransaction = typeof cashTransactions.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ClientInteraction = typeof clientInteractions.$inferSelect;
export type DocumentRecord = typeof documents.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
