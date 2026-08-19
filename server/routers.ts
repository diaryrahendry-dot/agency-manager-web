import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { randomUUID } from "node:crypto";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, protectedProcedure, router, supervisorProcedure } from "./_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { 
  agents, timeEntries, leaves, salaryAdvances, contracts, 
  tickets, cashTransactions, leads, clients, clientInteractions, documents, 
  quotes, invoices, creditNotes, catalogItems, dynamicStats, budgetSheets, users, agencyProjects, projectMembers,
  rolePermissions, supervisorTeams
} from "../drizzle/schema";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { storagePut } from "./storage";
import { DEFAULT_EUR_TO_MGA, convertEurToMga, normalizeCurrencyAmount } from "../shared/currency";
import { PROJECT_TEMPLATE_KEYS } from "../shared/projectTemplates";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, type PermissionKey, type RoleKey } from "../shared/permissions";

function dateKey(value: string | Date | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function amountOf(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizedLeaveType(value: unknown) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function consumesLeaveBalance(value: unknown) {
  const type = normalizedLeaveType(value);
  if (!type) return true;
  return !/(maladie|sans solde|exceptionnel|maternite|paternite|permission)/.test(type);
}

function periodHasEnded(value: string | Date | null | undefined) {
  const endDate = dateKey(value);
  if (!endDate) return false;
  return endDate < new Date().toISOString().slice(0, 10);
}

async function findLeaveForProject(database: any, leaveId: number, projectId: number | null | undefined) {
  const rows = await database.select({
    id: leaves.id,
    agentId: leaves.agentId,
    leaveType: leaves.leaveType,
    startDate: leaves.startDate,
    endDate: leaves.endDate,
    daysCount: leaves.daysCount,
    status: leaves.status,
    deductedAt: leaves.deductedAt,
    approvedAt: leaves.approvedAt,
    approvedByUserId: leaves.approvedByUserId,
    canceledAt: leaves.canceledAt,
    canceledByUserId: leaves.canceledByUserId,
    leaveBalanceDays: agents.leaveBalanceDays,
  }).from(leaves).innerJoin(agents, eq(leaves.agentId, agents.id)).where(and(eq(leaves.id, leaveId), projectScope(agents.projectId, projectId))).limit(1);
  return rows[0] ?? null;
}

async function approveLeaveRecord(database: any, leaveId: number, actorUserId: number, projectId: number | null | undefined) {
  const existing = await findLeaveForProject(database, leaveId, projectId);
  if (!existing) throw new Error("Demande de congé introuvable");
  if (existing.deductedAt) throw new Error("Cette demande a déjà été décomptée en fin de période");
  if (existing.status !== "approuvé" && consumesLeaveBalance(existing.leaveType) && Number(existing.leaveBalanceDays) < Number(existing.daysCount)) {
    throw new Error(`Solde de congés insuffisant : ${existing.leaveBalanceDays} jour(s) disponible(s)`);
  }
  await database.update(leaves).set({ status: "approuvé", approvedAt: existing.approvedAt || new Date(), approvedByUserId: existing.approvedByUserId || actorUserId, canceledAt: null, canceledByUserId: null } as any).where(eq(leaves.id, leaveId));
  await database.update(tickets).set({ status: "résolu" } as any).where(and(eq(tickets.requestType, "conge"), eq(tickets.requestId, leaveId), eq(tickets.agentId, existing.agentId)));
  return existing;
}

function projectScope(column: any, projectId?: number | null) {
  return projectId ? or(eq(column, projectId), isNull(column)) : isNull(column);
}

async function hasPermission(database: any, role: RoleKey, permissionKey: PermissionKey) {
  if (role === "admin") return true;
  const override = await database.select({ enabled: rolePermissions.enabled }).from(rolePermissions).where(and(eq(rolePermissions.role, role), eq(rolePermissions.permissionKey, permissionKey))).limit(1);
  return override[0] ? Boolean(override[0].enabled) : DEFAULT_ROLE_PERMISSIONS[role].includes(permissionKey);
}

async function requirePermission(database: any, ctx: any, permissionKey: PermissionKey) {
  if (!(await hasPermission(database, ctx.user.role as RoleKey, permissionKey))) {
    throw new Error(`Permission insuffisante: ${permissionKey}`);
  }
}

async function getAccessibleAgentIds(database: any, ctx: any): Promise<number[] | null> {
  if (ctx.user.role === "admin") return null;
  const agentRows = await database.select({ id: agents.id, email: agents.email, department: agents.department }).from(agents).where(projectScope(agents.projectId, ctx.user.activeProjectId));
  const own = agentRows.filter((agent: any) => Boolean(ctx.user.email) && agent.email.toLowerCase() === String(ctx.user.email).toLowerCase());
  if (ctx.user.role === "collaborateur") return own.map((agent: any) => agent.id);
  if (!(await hasPermission(database, ctx.user.role as RoleKey, "hr.team.view"))) return own.map((agent: any) => agent.id);
  const assignedRows = await database.select({ department: supervisorTeams.department }).from(supervisorTeams).where(and(eq(supervisorTeams.supervisorUserId, ctx.user.id), projectScope(supervisorTeams.projectId, ctx.user.activeProjectId)));
  const assignedDepartments = new Set(assignedRows.map((row: any) => row.department));
  return agentRows.filter((agent: any) => own.some((item: any) => item.id === agent.id) || assignedDepartments.has(agent.department)).map((agent: any) => agent.id);
}

async function requireAgentAccess(database: any, ctx: any, agentId: number) {
  const accessible = await getAccessibleAgentIds(database, ctx);
  if (accessible !== null && !accessible.includes(agentId)) throw new Error("Cet agent n’est pas dans votre périmètre");
}

async function requireDepartmentAccess(database: any, ctx: any, department: string) {
  if (ctx.user.role === "admin") return;
  if (ctx.user.role !== "superviseur") throw new Error("Les collaborateurs ne peuvent pas gérer les fiches d’équipe");
  const assigned = await database.select({ id: supervisorTeams.id }).from(supervisorTeams).where(and(eq(supervisorTeams.supervisorUserId, ctx.user.id), eq(supervisorTeams.department, department), projectScope(supervisorTeams.projectId, ctx.user.activeProjectId))).limit(1);
  if (!assigned[0]) throw new Error("Ce département n’est pas attribué à votre équipe");
}

export async function finalizeCompletedLeaveDeductions() {
  const database = await db.getDb();
  if (!database) return { processed: 0, totalDays: 0 };
  const rows = await database.select({ id: leaves.id, agentId: leaves.agentId, leaveType: leaves.leaveType, endDate: leaves.endDate, daysCount: leaves.daysCount }).from(leaves).where(and(eq(leaves.status, "approuvé"), isNull(leaves.deductedAt)));
  let processed = 0;
  let totalDays = 0;
  for (const leave of rows as any[]) {
    if (!periodHasEnded(leave.endDate)) continue;
    if (consumesLeaveBalance(leave.leaveType)) {
      await database.update(agents).set({ leaveBalanceDays: sql`GREATEST(0, ${agents.leaveBalanceDays} - ${Number(leave.daysCount)})` } as any).where(eq(agents.id, leave.agentId));
    }
    await database.update(leaves).set({ deductedAt: new Date() } as any).where(and(eq(leaves.id, leave.id), eq(leaves.status, "approuvé"), isNull(leaves.deductedAt)));
    processed += 1;
    totalDays += consumesLeaveBalance(leave.leaveType) ? Number(leave.daysCount) : 0;
  }
  return { processed, totalDays };
}

async function getRevenueVisibility(database: any, ctx: any) {
  if (!ctx.user.activeProjectId) return true;
  const rows = await database.select({ showRevenueDashboard: agencyProjects.showRevenueDashboard }).from(agencyProjects).where(eq(agencyProjects.id, ctx.user.activeProjectId)).limit(1);
  return rows[0]?.showRevenueDashboard !== false;
}

function invoiceServiceNames(itemsJson: string) {
  try {
    const parsed: unknown = JSON.parse(itemsJson);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const names = items.map((item: unknown) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return String(record.serviceName ?? record.service ?? record.label ?? record.description ?? record.name ?? record.title ?? "").trim();
    }).filter(Boolean);
    return Array.from(new Set(names));
  } catch {
    const fallback = itemsJson.trim();
    return fallback ? [fallback.slice(0, 120)] : ["Service non renseigné"];
  }
}

function invoiceStatusBucket(status: string) {
  if (status === "payée") return "encaissée";
  if (status === "en_retard") return "en retard";
  if (status === "annulée") return "annulée";
  return "autre";
}

type CommercialLine = {
  catalogItemId?: number;
  label?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  currency?: "EUR" | "MGA";
  taxRate?: number;
  discountType?: "none" | "percent" | "fixed";
  discountValue?: number;
};

function parseCommercialLines(itemsJson: string): CommercialLine[] {
  try {
    const parsed: unknown = JSON.parse(itemsJson);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({
      catalogItemId: Number.isFinite(Number(item.catalogItemId)) ? Number(item.catalogItemId) : undefined,
      label: String(item.label ?? item.serviceName ?? item.service ?? item.name ?? item.title ?? "").trim(),
      description: String(item.description ?? "").trim(),
      quantity: Math.max(0, Number(item.quantity ?? item.qty ?? 1) || 0),
      unit: String(item.unit ?? "unité"),
      unitPrice: Math.max(0, Number(item.unitPrice ?? item.price ?? item.amount ?? 0) || 0),
      currency: item.currency === "MGA" ? "MGA" : "EUR",
      taxRate: Math.max(0, Number(item.taxRate ?? 0) || 0),
      discountType: item.discountType === "percent" || item.discountType === "fixed" ? item.discountType : "none",
      discountValue: Math.max(0, Number(item.discountValue ?? 0) || 0),
    }));
  } catch {
    return [];
  }
}

export function calculateCommercialTotals(itemsJson: string, fallbackTotal: string, discountType: "none" | "percent" | "fixed", discountValue: string, taxRate: string) {
  const lines = parseCommercialLines(itemsJson);
  const subtotal = lines.length > 0
    ? lines.reduce((sum, line) => sum + (line.quantity || 0) * (line.unitPrice || 0), 0)
    : amountOf(fallbackTotal);
  const lineDiscount = lines.reduce((sum, line) => {
    const base = (line.quantity || 0) * (line.unitPrice || 0);
    return sum + (line.discountType === "percent" ? base * Math.min(100, line.discountValue || 0) / 100 : line.discountType === "fixed" ? Math.min(base, line.discountValue || 0) : 0);
  }, 0);
  const globalDiscount = discountType === "percent" ? subtotal * Math.min(100, amountOf(discountValue)) / 100 : discountType === "fixed" ? Math.min(subtotal, amountOf(discountValue)) : 0;
  const discountAmount = Math.min(subtotal, lineDiscount + globalDiscount);
  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxableBase * Math.max(0, amountOf(taxRate)) / 100;
  return {
    subtotalAmount: subtotal.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    totalAmount: (taxableBase + taxAmount).toFixed(2),
  };
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
  permissions: router({
    current: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return { role: ctx.user.role, permissions: [] as PermissionKey[] };
      if (ctx.user.role === "admin") return { role: ctx.user.role, permissions: [...PERMISSION_KEYS] as PermissionKey[] };
      const overrides = await database.select({ permissionKey: rolePermissions.permissionKey, enabled: rolePermissions.enabled }).from(rolePermissions).where(eq(rolePermissions.role, ctx.user.role as RoleKey));
      const overrideMap = new Map(overrides.map(item => [item.permissionKey, Boolean(item.enabled)]));
      const permissions = PERMISSION_KEYS.filter(key => overrideMap.has(key) ? overrideMap.get(key) : DEFAULT_ROLE_PERMISSIONS[ctx.user.role as RoleKey].includes(key));
      return { role: ctx.user.role, permissions };
    }),
  }),

  // Module RH
  hr: router({
    listAgents: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      await requirePermission(database, ctx, "dashboard.view");
      const rows = await db.getAgents(ctx.user.activeProjectId);
      const accessible = await getAccessibleAgentIds(database, ctx);
      return accessible === null ? rows : rows.filter(agent => accessible.includes(agent.id));
    }),
    createAgent: supervisorProcedure.input(z.object({
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
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.manage");
      await requireDepartmentAccess(database, ctx, input.department);
      try {
        await database.insert(agents).values({
          projectId: ctx.user.activeProjectId,
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
    updateAgent: supervisorProcedure.input(z.object({
      id: z.number().int().positive(),
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
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.manage");
      const existing = await database.select({ id: agents.id, department: agents.department }).from(agents).where(and(eq(agents.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Agent introuvable");
      await requireDepartmentAccess(database, ctx, existing[0].department);
      await requireDepartmentAccess(database, ctx, input.department);
      await database.update(agents).set({
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
      } as any).where(and(eq(agents.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),
    deleteAgent: supervisorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.manage");
      const existing = await database.select({ id: agents.id, department: agents.department }).from(agents).where(and(eq(agents.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Agent introuvable");
      await requireDepartmentAccess(database, ctx, existing[0].department);
      await database.delete(agents).where(and(eq(agents.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),

    listTimeEntries: protectedProcedure.input(z.object({ agentId: z.number().optional() }).optional()).query(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      await requirePermission(database, ctx, "hr.self.view");
      const accessible = await getAccessibleAgentIds(database, ctx);
      if (accessible !== null && input?.agentId && !accessible.includes(input.agentId)) throw new Error("Ce pointage n’est pas dans votre périmètre");
      if (accessible !== null) return accessible.length ? db.getTimeEntries(input?.agentId ?? accessible[0]) : [];
      return db.getTimeEntries(input?.agentId);
    }),
    createTimeEntry: protectedProcedure.input(z.object({
      agentId: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date du pointage est invalide"),
      hoursWorked: z.string().trim().refine(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 24, "Les heures doivent être comprises entre 0 et 24"),
      status: z.enum(["présent", "absent", "retard", "congé"]),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.timeEntry.create");
      await requireAgentAccess(database, ctx, input.agentId);
      const agent = await database.select({ id: agents.id }).from(agents).where(and(eq(agents.id, input.agentId), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
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
    updateTimeEntry: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date du pointage est invalide"),
      hoursWorked: z.string().trim().refine(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 24, "Les heures doivent être comprises entre 0 et 24"),
      status: z.enum(["présent", "absent", "retard", "congé"]),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.timeEntry.edit");
      const existing = await database.select({ id: timeEntries.id, agentId: timeEntries.agentId }).from(timeEntries).innerJoin(agents, eq(timeEntries.agentId, agents.id)).where(and(eq(timeEntries.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Pointage introuvable");
      await requireAgentAccess(database, ctx, existing[0].agentId);
      await database.update(timeEntries).set({ date: input.date, hoursWorked: input.hoursWorked, status: input.status, notes: input.notes || null } as any).where(eq(timeEntries.id, input.id));
      return { success: true };
    }),
    deleteTimeEntry: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.timeEntry.delete");
      const existing = await database.select({ id: timeEntries.id, agentId: timeEntries.agentId }).from(timeEntries).innerJoin(agents, eq(timeEntries.agentId, agents.id)).where(and(eq(timeEntries.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Pointage introuvable");
      await requireAgentAccess(database, ctx, existing[0].agentId);
      await database.delete(timeEntries).where(eq(timeEntries.id, input.id));
      return { success: true };
    }),

    listLeaves: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      await requirePermission(database, ctx, "hr.self.view");
      const rows = await db.getLeaves();
      const accessible = await getAccessibleAgentIds(database, ctx);
      return accessible === null ? rows : rows.filter(row => accessible.includes(row.agentId));
    }),
    createLeave: protectedProcedure.input(z.object({
      agentId: z.number(),
      leaveType: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      daysCount: z.number(),
      reason: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.request.create");
      await requireAgentAccess(database, ctx, input.agentId);
      const agent = await database.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.id, input.agentId), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (!agent[0]) throw new Error("Agent introuvable");
      const inserted: any = await database.insert(leaves).values({ agentId: input.agentId, leaveType: input.leaveType, startDate: input.startDate, endDate: input.endDate, daysCount: input.daysCount, reason: input.reason || null } as any);
      const requestId = Number(inserted?.[0]?.insertId ?? inserted?.insertId ?? 0) || null;
      await database.insert(tickets).values({ title: `Demande de congé — ${agent[0].name}`, description: input.reason || `Demande de congé du ${input.startDate} au ${input.endDate} (${input.daysCount} jour(s)).`, agentId: input.agentId, requesterUserId: ctx.user.id, requestType: "conge", requestId, priority: "normale", category: "RH - Congé" } as any);
      return { success: true, requestId };
    }),
    updateLeaveStatus: supervisorProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["en_attente", "approuvé", "refusé"]),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.request.manage");
      const existing = await findLeaveForProject(database, input.id, ctx.user.activeProjectId);
      if (!existing) throw new Error("Demande de congé introuvable");
      await requireAgentAccess(database, ctx, existing.agentId);
      if (input.status === "approuvé") {
        await approveLeaveRecord(database, input.id, ctx.user.id, ctx.user.activeProjectId);
      } else {
        await database.update(leaves).set({ status: input.status, approvedAt: null, approvedByUserId: null, canceledAt: null, canceledByUserId: null } as any).where(eq(leaves.id, input.id));
        await database.update(tickets).set({ status: input.status === "en_attente" ? "en_cours" : "fermé" } as any).where(and(eq(tickets.requestType, "conge"), eq(tickets.requestId, input.id), eq(tickets.agentId, existing.agentId)));
      }
      return { success: true };
    }),
    updateLeave: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      leaveType: z.string().trim().min(1),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date de début est invalide"),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date de fin est invalide"),
      daysCount: z.number().int().positive(),
      reason: z.string().trim().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const canEdit = await hasPermission(database, ctx.user.role as RoleKey, "hr.request.edit");
      const canManage = await hasPermission(database, ctx.user.role as RoleKey, "hr.request.manage");
      if (!canEdit && !canManage) throw new Error("Permission insuffisante: hr.request.edit");
      const existing = await findLeaveForProject(database, input.id, ctx.user.activeProjectId);
      if (!existing) throw new Error("Demande de congé introuvable");
      await requireAgentAccess(database, ctx, existing.agentId);
      if (existing.deductedAt) throw new Error("Une demande décomptée en fin de période ne peut plus être modifiée");
      if (existing.status === "annulé") throw new Error("Une demande annulée ne peut plus être modifiée");
      await database.update(leaves).set({ leaveType: input.leaveType, startDate: input.startDate, endDate: input.endDate, daysCount: input.daysCount, reason: input.reason || null, status: "en_attente", approvedAt: null, approvedByUserId: null, canceledAt: null, canceledByUserId: null } as any).where(eq(leaves.id, input.id));
      await database.update(tickets).set({ status: "en_cours", description: input.reason || `Demande modifiée du ${input.startDate} au ${input.endDate} (${input.daysCount} jour(s)).` } as any).where(and(eq(tickets.requestType, "conge"), eq(tickets.requestId, input.id), eq(tickets.agentId, existing.agentId)));
      return { success: true };
    }),
        cancelLeave: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const canCancel = await hasPermission(database, ctx.user.role as RoleKey, "hr.request.cancel");
      const canManage = await hasPermission(database, ctx.user.role as RoleKey, "hr.request.manage");
      if (!canCancel && !canManage) throw new Error("Permission insuffisante: hr.request.cancel");
      const existing = await findLeaveForProject(database, input.id, ctx.user.activeProjectId);
      if (!existing) throw new Error("Demande de congé introuvable");
      await requireAgentAccess(database, ctx, existing.agentId);
      if (existing.deductedAt) throw new Error("Une demande clôturée ne peut plus être annulée");
      if (existing.status === "annulé") return { success: true };
      await database.update(leaves).set({ status: "annulé", canceledAt: new Date(), canceledByUserId: ctx.user.id, approvedAt: null, approvedByUserId: null } as any).where(eq(leaves.id, input.id));
      await database.update(tickets).set({ status: "fermé" } as any).where(and(eq(tickets.requestType, "conge"), eq(tickets.requestId, input.id), eq(tickets.agentId, existing.agentId)));
      return { success: true };
    }),
    deleteLeave: supervisorProcedure.input(z.object({
 id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.request.manage");
      const existing = await database.select({ id: leaves.id, agentId: leaves.agentId }).from(leaves).innerJoin(agents, eq(leaves.agentId, agents.id)).where(and(eq(leaves.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (!existing[0]) throw new Error("Demande de congé introuvable");
      await requireAgentAccess(database, ctx, existing[0].agentId);
      await database.delete(leaves).where(eq(leaves.id, input.id));
      await database.delete(tickets).where(and(eq(tickets.requestType, "conge"), eq(tickets.requestId, input.id)));
      return { success: true };
    }),

    listSalaryAdvances: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      await requirePermission(database, ctx, "hr.self.view");
      const rows = await db.getSalaryAdvances();
      const accessible = await getAccessibleAgentIds(database, ctx);
      return accessible === null ? rows : rows.filter(row => accessible.includes(row.agentId));
    }),
    createSalaryAdvance: protectedProcedure.input(z.object({
      agentId: z.number(),
      amount: z.string(),
      requestedDate: z.string(),
      deductionMonth: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.request.create");
      await requireAgentAccess(database, ctx, input.agentId);
      const agent = await database.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.id, input.agentId), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (!agent[0]) throw new Error("Agent introuvable");
      const inserted: any = await database.insert(salaryAdvances).values({ agentId: input.agentId, amount: input.amount, requestedDate: input.requestedDate, deductionMonth: input.deductionMonth, notes: input.notes || null } as any);
      const requestId = Number(inserted?.[0]?.insertId ?? inserted?.insertId ?? 0) || null;
      await database.insert(tickets).values({ title: `Demande d’avance — ${agent[0].name}`, description: input.notes || `Demande d’avance de ${input.amount} à déduire sur ${input.deductionMonth}.`, agentId: input.agentId, requesterUserId: ctx.user.id, requestType: "avance", requestId, priority: "haute", category: "RH - Avance salaire" } as any);
      return { success: true, requestId };
    }),
    updateSalaryAdvanceStatus: supervisorProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["demandé", "accordé", "déduit", "refusé"]),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.request.manage");
      const existing = await database.select({ id: salaryAdvances.id, agentId: salaryAdvances.agentId }).from(salaryAdvances).innerJoin(agents, eq(salaryAdvances.agentId, agents.id)).where(and(eq(salaryAdvances.id, input.id), projectScope(agents.projectId, ctx.user.activeProjectId))).limit(1);
      if (!existing[0]) throw new Error("Demande d’avance introuvable");
      await requireAgentAccess(database, ctx, existing[0].agentId);
      await database.update(salaryAdvances).set({ status: input.status }).where(eq(salaryAdvances.id, input.id));
      await database.update(tickets).set({ status: input.status === "demandé" ? "en_cours" : input.status === "refusé" ? "fermé" : "résolu" } as any).where(and(eq(tickets.requestType, "avance"), eq(tickets.requestId, input.id)));
      return { success: true };
    }),

    listContracts: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      await requirePermission(database, ctx, "hr.self.view");
      const rows = await db.getContracts();
      const accessible = await getAccessibleAgentIds(database, ctx);
      return accessible === null ? rows : rows.filter(row => accessible.includes(row.agentId));
    }),
    createContract: supervisorProcedure.input(z.object({
      agentId: z.number(),
      title: z.string(),
      contractType: z.string(),
      startDate: z.string(),
      endDate: z.string().optional(),
      documentUrl: z.string().optional(),
      documentKey: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.manage");
      await requireAgentAccess(database, ctx, input.agentId);
      await database.insert(contracts).values({ agentId: input.agentId, title: input.title, contractType: input.contractType, startDate: input.startDate, endDate: input.endDate || null, documentUrl: input.documentUrl || null, documentKey: input.documentKey || null } as any);
      return { success: true };
    }),

    listTickets: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      await requirePermission(database, ctx, "hr.self.view");
      const rows = await db.getTickets();
      const accessible = await getAccessibleAgentIds(database, ctx);
      return accessible === null ? rows : rows.filter(row => (row.agentId !== null && accessible.includes(row.agentId)) || (row as any).requesterUserId === ctx.user.id);
    }),
    createTicket: protectedProcedure.input(z.object({
      title: z.string(),
      description: z.string(),
      agentId: z.number().optional(),
      clientId: z.number().optional(),
      priority: z.enum(["basse", "normale", "haute", "urgente"]),
      category: z.string(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.request.create");
      const accessible = await getAccessibleAgentIds(database, ctx);
      const targetAgentId = input.agentId ?? (accessible && accessible.length === 1 ? accessible[0] : null);
      if (targetAgentId !== null) await requireAgentAccess(database, ctx, targetAgentId);
      if (ctx.user.role === "collaborateur" && targetAgentId === null) throw new Error("Votre ticket doit être rattaché à votre fiche agent");
      await database.insert(tickets).values({ title: input.title, description: input.description, agentId: targetAgentId, clientId: input.clientId || null, requesterUserId: ctx.user.id, priority: input.priority, category: input.category } as any);
      return { success: true };
    }),
    updateTicketStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["ouvert", "en_cours", "résolu", "fermé"]),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await requirePermission(database, ctx, "hr.request.manage");
      const existing = await database.select({ id: tickets.id, agentId: tickets.agentId, requestType: tickets.requestType, requestId: tickets.requestId }).from(tickets).where(eq(tickets.id, input.id)).limit(1);
      if (!existing[0]) throw new Error("Ticket introuvable");
      if (existing[0].agentId !== null) await requireAgentAccess(database, ctx, existing[0].agentId);
      const requestId = existing[0].requestId;
      if (requestId && existing[0].requestType === "conge") {
        const leave = await findLeaveForProject(database, requestId, ctx.user.activeProjectId);
        if (!leave) throw new Error("Demande de congé introuvable dans le projet actif");
        if (input.status === "résolu") {
          await approveLeaveRecord(database, requestId, ctx.user.id, ctx.user.activeProjectId);
        } else {
          const leaveStatus = input.status === "fermé" ? "refusé" : "en_attente";
          await database.update(leaves).set({ status: leaveStatus, approvedAt: null, approvedByUserId: null } as any).where(eq(leaves.id, requestId));
          await database.update(tickets).set({ status: input.status }).where(eq(tickets.id, input.id));
        }
      } else if (requestId && existing[0].requestType === "avance") {
        const advanceStatus = input.status === "résolu" ? "accordé" : input.status === "fermé" ? "refusé" : "demandé";
        await database.update(salaryAdvances).set({ status: advanceStatus } as any).where(eq(salaryAdvances.id, requestId));
        await database.update(tickets).set({ status: input.status }).where(eq(tickets.id, input.id));
      } else {
        await database.update(tickets).set({ status: input.status }).where(eq(tickets.id, input.id));
      }
      return { success: true };
    }),
  }),

  // Module Comptabilité
  accounting: router({
    listTransactions: protectedProcedure.query(async ({ ctx }) => {
      return await db.getCashTransactions(ctx.user.activeProjectId);
    }),
    createTransaction: supervisorProcedure.input(z.object({
      type: z.enum(["entrée", "sortie"]),
      category: z.string().trim().min(1),
      amount: z.string().trim().refine(value => Number.isFinite(Number(value)) && Number(value) >= 0, "Le montant est invalide"),
      currency: z.enum(["EUR", "MGA"]).default("EUR"),
      exchangeRate: z.string().trim().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date est invalide"),
      paymentMethod: z.string().trim().min(1),
      reference: z.string().trim().optional(),
      description: z.string().trim().min(1),
      attachedUrl: z.string().optional(),
      attachedKey: z.string().optional(),
      internalNote: z.string().trim().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const normalized = normalizeCurrencyAmount(input.amount, input.currency, input.exchangeRate);
      await database.insert(cashTransactions).values({
        projectId: ctx.user.activeProjectId,
        type: input.type,
        category: input.category,
        ...normalized,
        date: input.date,
        paymentMethod: input.paymentMethod,
        reference: input.reference || null,
        description: input.description,
        internalNote: input.internalNote || null,
        attachedUrl: input.attachedUrl || null,
        attachedKey: input.attachedKey || null,
      } as any);
      return { success: true, currency: normalized.currency, amountInCurrency: normalized.amountInCurrency };
    }),
    updateTransaction: supervisorProcedure.input(z.object({
      id: z.number().int().positive(),
      type: z.enum(["entrée", "sortie"]),
      category: z.string().trim().min(1),
      amount: z.string().trim().refine(value => Number.isFinite(Number(value)) && Number(value) >= 0, "Le montant est invalide"),
      currency: z.enum(["EUR", "MGA"]).default("EUR"),
      exchangeRate: z.string().trim().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date est invalide"),
      paymentMethod: z.string().trim().min(1),
      reference: z.string().trim().optional(),
      description: z.string().trim().min(1),
      internalNote: z.string().trim().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: cashTransactions.id }).from(cashTransactions).where(and(eq(cashTransactions.id, input.id), projectScope(cashTransactions.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Mouvement introuvable");
      const normalized = normalizeCurrencyAmount(input.amount, input.currency, input.exchangeRate);
      await database.update(cashTransactions).set({
        type: input.type,
        category: input.category,
        ...normalized,
        date: input.date,
        paymentMethod: input.paymentMethod,
        reference: input.reference || null,
        description: input.description,
        internalNote: input.internalNote || null,
      } as any).where(and(eq(cashTransactions.id, input.id), projectScope(cashTransactions.projectId, ctx.user.activeProjectId)));
      return { success: true, currency: normalized.currency, amountInCurrency: normalized.amountInCurrency };
    }),
    convertQuoteToTransaction: protectedProcedure.input(z.object({
      quoteId: z.number().int().positive(),
      currency: z.enum(["EUR", "MGA"]).default("EUR"),
      exchangeRate: z.string().trim().optional(),
      paymentMethod: z.string().trim().min(1).default("À encaisser"),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const quoteRows = await database.select().from(quotes).where(and(eq(quotes.id, input.quoteId), projectScope(quotes.projectId, ctx.user.activeProjectId))).limit(1);
      const quote = quoteRows[0];
      if (!quote) throw new Error("Devis introuvable");
      if (quote.status === "facturé") throw new Error("Ce devis est déjà présent dans la comptabilité");
      const existingTransactions = await db.getCashTransactions(ctx.user.activeProjectId);
      if (existingTransactions.some(transaction => transaction.reference === quote.quoteNumber)) {
        throw new Error("Ce devis possède déjà un mouvement comptable associé");
      }
      const rate = input.exchangeRate ?? String(DEFAULT_EUR_TO_MGA);
      const amountInSelectedCurrency = input.currency === "MGA" ? String(convertEurToMga(Number(quote.totalAmount), Number(rate))) : String(quote.totalAmount);
      const normalized = normalizeCurrencyAmount(amountInSelectedCurrency, input.currency, rate);
      await database.insert(cashTransactions).values({
        projectId: ctx.user.activeProjectId,
        type: "entrée",
        category: "Vente / Devis",
        ...normalized,
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: input.paymentMethod,
        reference: quote.quoteNumber,
        description: `Conversion du ${quote.quoteNumber} en entrée comptable`,
      } as any);
      await database.update(quotes).set({ status: "facturé" }).where(and(eq(quotes.id, input.quoteId), projectScope(quotes.projectId, ctx.user.activeProjectId)));
      return { success: true, quoteNumber: quote.quoteNumber, currency: normalized.currency, amountInCurrency: normalized.amountInCurrency };
    }),
    convertPaidInvoiceToTransaction: protectedProcedure.input(z.object({
      invoiceId: z.number().int().positive(),
      currency: z.enum(["EUR", "MGA"]).default("MGA"),
      exchangeRate: z.string().trim().optional(),
      paymentMethod: z.string().trim().min(1).default("Virement"),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const invoiceRows = await database.select().from(invoices).where(and(eq(invoices.id, input.invoiceId), projectScope(invoices.projectId, ctx.user.activeProjectId))).limit(1);
      const invoice = invoiceRows[0];
      if (!invoice) throw new Error("Facture introuvable");
      if (invoice.status !== "payée") throw new Error("Seules les factures au statut payée peuvent être converties en caisse");
      const existingTransactions = await db.getCashTransactions(ctx.user.activeProjectId);
      if (existingTransactions.some(transaction => transaction.reference === invoice.invoiceNumber)) {
        throw new Error("Cette facture possède déjà une entrée de caisse associée");
      }
      const rate = input.exchangeRate ?? String(DEFAULT_EUR_TO_MGA);
      const amountInSelectedCurrency = input.currency === "MGA" ? String(convertEurToMga(Number(invoice.totalAmount), Number(rate))) : String(invoice.totalAmount);
      const normalized = normalizeCurrencyAmount(amountInSelectedCurrency, input.currency, rate);
      await database.insert(cashTransactions).values({
        projectId: ctx.user.activeProjectId,
        type: "entrée",
        category: "Facture payée",
        ...normalized,
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: input.paymentMethod,
        reference: invoice.invoiceNumber,
        description: `Conversion de la facture payée ${invoice.invoiceNumber} en entrée de caisse`,
      } as any);
      return { success: true, invoiceNumber: invoice.invoiceNumber, currency: normalized.currency, amountInCurrency: normalized.amountInCurrency };
    }),
    creditNotes: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return [];
      return await database.select().from(creditNotes).where(projectScope(creditNotes.projectId, ctx.user.activeProjectId)).orderBy(desc(creditNotes.id));
    }),
    createCreditNote: protectedProcedure.input(z.object({
      invoiceId: z.number().int().positive(),
      reason: z.string().trim().min(3, "Le motif de l'avoir est obligatoire"),
      items: z.array(z.object({
        label: z.string().trim().min(1),
        quantity: z.number().positive(),
        unitPrice: z.string().trim().refine(v => Number.isFinite(Number(v)) && Number(v) >= 0),
        taxRate: z.string().trim().optional(),
        discountType: z.enum(["none", "percent", "fixed"]).optional(),
        discountValue: z.string().trim().optional(),
      })).min(1, "Ajoutez au moins une ligne d'avoir"),
      discountType: z.enum(["none", "percent", "fixed"]).default("none"),
      discountValue: z.string().trim().optional(),
      globalTaxRate: z.string().trim().optional(),
      currency: z.enum(["EUR", "MGA"]).default("MGA"),
      exchangeRate: z.string().trim().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const invoiceRows = await database.select().from(invoices).where(and(eq(invoices.id, input.invoiceId), projectScope(invoices.projectId, ctx.user.activeProjectId))).limit(1);
      const invoice = invoiceRows[0];
      if (!invoice) throw new Error("Facture d'origine introuvable");
      const computed = calculateCommercialTotals(JSON.stringify(input.items), "0", input.discountType, input.discountValue || "0", input.globalTaxRate || "0");
      const creditNoteNumber = `AV-${Date.now().toString().slice(-6)}`;
      const rate = input.exchangeRate ?? String(DEFAULT_EUR_TO_MGA);
      const clientRows = await database.select({ companyName: clients.companyName }).from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
      const clientName = clientRows[0]?.companyName || `Client #${invoice.clientId}`;
      await database.insert(creditNotes).values({
        projectId: ctx.user.activeProjectId,
        invoiceId: invoice.id,
        creditNoteNumber,
        clientId: invoice.clientId,
        clientName,
        amount: computed.totalAmount,
        currency: input.currency,
        exchangeRate: String(rate),
        status: "émis",
        itemsJson: JSON.stringify(input.items),
        reason: input.reason,
      } as any);
      return { success: true, creditNoteNumber, amount: computed.totalAmount };
    }),
    convertCreditNoteToTransaction: protectedProcedure.input(z.object({
      creditNoteId: z.number().int().positive(),
      currency: z.enum(["EUR", "MGA"]).default("MGA"),
      exchangeRate: z.string().trim().optional(),
      paymentMethod: z.string().trim().min(1).default("Remboursement / Virement"),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const cnRows = await database.select().from(creditNotes).where(and(eq(creditNotes.id, input.creditNoteId), projectScope(creditNotes.projectId, ctx.user.activeProjectId))).limit(1);
      const cn = cnRows[0];
      if (!cn) throw new Error("Avoir introuvable");
      if (cn.status === "converti_caisse") throw new Error("Cet avoir a déjà été converti en sortie de caisse");
      if (cn.status === "annulé") throw new Error("Un avoir annulé ne peut pas être converti");
      const rate = input.exchangeRate ?? String(DEFAULT_EUR_TO_MGA);
      const amountInSelectedCurrency = input.currency === "MGA" ? String(convertEurToMga(Number(cn.amount), Number(rate))) : String(cn.amount);
      const normalized = normalizeCurrencyAmount(amountInSelectedCurrency, input.currency, rate);
      await database.insert(cashTransactions).values({
        projectId: ctx.user.activeProjectId,
        type: "sortie",
        category: "Avoir / Remboursement",
        ...normalized,
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: input.paymentMethod,
        reference: cn.creditNoteNumber,
        description: `Sortie de caisse suite à l'avoir ${cn.creditNoteNumber} (${cn.reason})`,
      } as any);
      await database.update(creditNotes).set({ status: "converti_caisse" }).where(and(eq(creditNotes.id, input.creditNoteId), projectScope(creditNotes.projectId, ctx.user.activeProjectId)));
      return { success: true, creditNoteNumber: cn.creditNoteNumber, ...normalized };
    }),
    summary: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) return { totalEntrees: 0, totalSorties: 0, solde: 0, transactionsCount: 0, hidden: false };
      await requirePermission(database, ctx, "accounting.view");
      const visible = await getRevenueVisibility(database, ctx);
      const txs = await db.getCashTransactions(ctx.user.activeProjectId);
      let totalEntrees = 0;
      let totalSorties = 0;
      for (const t of txs) {
        const amt = amountOf(t.amount);
        if (t.type === "entrée") totalEntrees += amt;
        else totalSorties += amt;
      }
      return visible ? { totalEntrees, totalSorties, solde: totalEntrees - totalSorties, transactionsCount: txs.length, hidden: false } : { totalEntrees: 0, totalSorties: 0, solde: 0, transactionsCount: txs.length, hidden: true };
    }),
    revenueReport: protectedProcedure.input(z.object({
      year: z.number().int().min(2000).max(2100).optional(),
    }).optional()).query(async ({ input, ctx }) => {
      const selectedYear = input?.year ?? new Date().getFullYear();
      const database = await db.getDb();
      if (database) await requirePermission(database, ctx, "dashboard.view");
      const visible = database ? await getRevenueVisibility(database, ctx) : true;
      if (!visible) return { year: selectedYear, months: [], annual: [], kpis: { revenue: 0, expenses: 0, invoiced: 0, paid: 0, overdueInvoices: 0 }, hidden: true, generatedAt: new Date().toISOString() };
      const [transactions, allInvoices] = await Promise.all([db.getCashTransactions(ctx.user.activeProjectId), db.getInvoices(ctx.user.activeProjectId)]);
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
        hidden: false,
        generatedAt: new Date().toISOString(),
      };
    }),
    automaticReport: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (database) await requirePermission(database, ctx, "dashboard.view");
      const visible = database ? await getRevenueVisibility(database, ctx) : true;
      if (!visible) return { monthLabel: "CA masqué", collected: 0, expenses: 0, invoicesCount: 0, unpaidCount: 0, hidden: true, generatedAt: new Date().toISOString() };
      const year = new Date().getFullYear();
      const report = await (async () => {
        const transactions = await db.getCashTransactions(ctx.user.activeProjectId);
        const invoices = await db.getInvoices(ctx.user.activeProjectId);
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
      return { ...report, hidden: false, generatedAt: new Date().toISOString() };
    }),
    monthlyReport: protectedProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Le mois doit être au format AAAA-MM").optional() }).optional()).query(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (database) await requirePermission(database, ctx, "dashboard.view");
      const visibleRevenue = database ? await getRevenueVisibility(database, ctx) : true;
      const accessible = database ? await getAccessibleAgentIds(database, ctx) : null;
      const now = new Date();
      const monthKey = input?.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [agentsDataRaw, timeEntriesDataRaw, leavesDataRaw, advancesDataRaw, contractsDataRaw, ticketsDataRaw, transactionsData, leadsData, clientsData, interactionsData, documentsData, quotesData, invoicesData] = await Promise.all([
        db.getAgents(ctx.user.activeProjectId), db.getTimeEntries(), db.getLeaves(), db.getSalaryAdvances(), db.getContracts(), db.getTickets(),
        db.getCashTransactions(ctx.user.activeProjectId), db.getLeads(ctx.user.activeProjectId), db.getClients(ctx.user.activeProjectId), db.getClientInteractions(), db.getDocuments(), db.getQuotes(ctx.user.activeProjectId), db.getInvoices(ctx.user.activeProjectId),
      ]);
      const inScope = (agentId: number | null | undefined) => accessible === null || (agentId !== null && agentId !== undefined && accessible.includes(agentId));
      const agentsData = accessible === null ? agentsDataRaw : agentsDataRaw.filter(item => accessible.includes(item.id));
      const timeEntriesData = timeEntriesDataRaw.filter(item => inScope(item.agentId));
      const leavesData = leavesDataRaw.filter(item => inScope(item.agentId));
      const advancesData = advancesDataRaw.filter(item => inScope(item.agentId));
      const contractsData = contractsDataRaw.filter(item => inScope(item.agentId));
      const ticketsData = accessible === null ? ticketsDataRaw : ticketsDataRaw.filter(item => inScope(item.agentId) || (item as any).requesterUserId === ctx.user.id);
      const inMonth = (value: string | Date | null | undefined) => dateKey(value).startsWith(monthKey);
      const monthTransactions = transactionsData.filter(item => inMonth(item.date));
      const monthLeads = leadsData.filter(item => inMonth(item.createdAt));
      const monthClients = clientsData.filter(item => inMonth(item.createdAt));
      const monthInteractions = interactionsData.filter(item => inMonth(item.date));
      const monthDocuments = documentsData.filter(item => inMonth(item.createdAt));
      const monthQuotes = quotesData.filter(item => inMonth(item.issueDate));
      const monthInvoices = invoicesData.filter(item => inMonth(item.issueDate));
      const monthAgents = agentsData.filter(item => inMonth(item.createdAt));
      const monthTimeEntries = timeEntriesData.filter(item => inMonth(item.date));
      const monthLeaves = leavesData.filter(item => inMonth(item.startDate));
      const monthAdvances = advancesData.filter(item => inMonth(item.requestedDate));
      const monthContracts = contractsData.filter(item => inMonth(item.startDate));
      const monthTickets = ticketsData.filter(item => inMonth(item.createdAt));
      const collected = visibleRevenue ? monthTransactions.filter(item => item.type === "entrée").reduce((sum, item) => sum + amountOf(item.amount), 0) : 0;
      const expenses = visibleRevenue ? monthTransactions.filter(item => item.type === "sortie").reduce((sum, item) => sum + amountOf(item.amount), 0) : 0;
      const invoiced = visibleRevenue ? monthInvoices.filter(item => item.status !== "annulée").reduce((sum, item) => sum + amountOf(item.totalAmount), 0) : 0;
      const paid = visibleRevenue ? monthInvoices.filter(item => item.status === "payée").reduce((sum, item) => sum + amountOf(item.totalAmount), 0) : 0;
      const pipeline = monthLeads.filter(item => !["gagne", "perdu"].includes(item.status)).reduce((sum, item) => sum + amountOf(item.expectedAmount), 0);
      const openTickets = ticketsData.filter(item => ["ouvert", "en_cours"].includes(item.status)).length;
      const pendingAdvances = advancesData.filter(item => item.status === "demandé").length;
      const overdueInvoices = invoicesData.filter(item => item.status === "en_retard").length;
      const insights = [
        visibleRevenue ? (collected > expenses ? "La trésorerie du mois est positive." : "Les dépenses dépassent les encaissements du mois : vérifiez les sorties importantes.") : "Les indicateurs financiers sont masqués par la configuration du projet.",
        pipeline > 0 ? `${monthLeads.length} lead(s) alimentent encore le pipeline pour ${pipeline.toLocaleString("fr-FR")} € potentiels.` : "Aucun montant actif n’est actuellement détecté dans le pipeline.",
        overdueInvoices > 0 ? `${overdueInvoices} facture(s) en retard nécessitent une relance.` : "Aucune facture en retard détectée.",
        pendingAdvances > 0 ? `${pendingAdvances} demande(s) d’avance sur salaire sont à traiter.` : "Aucune avance sur salaire en attente.",
      ];
      return {
        month: monthKey,
        monthLabel: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1)),
        hiddenRevenue: !visibleRevenue,
        generatedAt: new Date().toISOString(),
        sections: {
          rh: { newAgents: monthAgents.length, timeEntries: monthTimeEntries.length, leaveRequests: monthLeaves.length, advances: monthAdvances.length, contracts: monthContracts.length, openTickets },
          accounting: { transactions: monthTransactions.length, collected, expenses, balance: collected - expenses, invoiced, paid },
          crm: { newLeads: monthLeads.length, pipeline, won: monthLeads.filter(item => item.status === "gagne").length, followUps: monthLeads.filter(item => item.nextContactDate && dateKey(item.nextContactDate) <= `${monthKey}-31` && !["gagne", "perdu"].includes(item.status)).length },
          clients: { newClients: monthClients.length, interactions: monthInteractions.length, documents: monthDocuments.length },
          billing: { quotes: monthQuotes.length, invoices: monthInvoices.length, paid, invoiced, overdue: overdueInvoices },
        },
        insights,
      };
    }),
  }),

  // Module Statistiques dynamiques & Budget Planner
  planning: router({
    accountingStatistics: protectedProcedure.input(z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Le mois doit être au format AAAA-MM").optional(),
      type: z.enum(["tous", "entrée", "sortie"]).default("tous"),
      category: z.string().trim().optional(),
    }).optional()).query(async ({ input }) => {
      const transactions = await db.getCashTransactions();
      const monthKey = input?.monthKey || "";
      const category = input?.category?.trim() || "";
      const filtered = transactions.filter((transaction) => {
        const matchesMonth = !monthKey || dateKey(transaction.date).startsWith(monthKey);
        const matchesType = !input?.type || input.type === "tous" || transaction.type === input.type;
        const matchesCategory = !category || transaction.category === category;
        return matchesMonth && matchesType && matchesCategory;
      });
      const amounts = filtered.map((transaction) => amountOf(transaction.amount)).sort((a, b) => a - b);
      const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
      const referenceDate = monthKey ? new Date(`${monthKey}-15T12:00:00Z`) : new Date();
      const rows = filtered.map((transaction) => {
        const amount = amountOf(transaction.amount);
        const transactionDate = new Date(`${dateKey(transaction.date)}T12:00:00Z`);
        const ageInDays = Number.isFinite(transactionDate.getTime()) ? Math.max(0, Math.round((referenceDate.getTime() - transactionDate.getTime()) / 86400000)) : 0;
        const important = amount >= median && amount > 0;
        const urgent = ageInDays <= 14 || transaction.type === "sortie";
        const eisenhowerQuadrant = important && urgent ? "important-urgent" : important ? "important-non-urgent" : urgent ? "non-important-urgent" : "non-important-non-urgent";
        return {
          id: transaction.id,
          date: dateKey(transaction.date),
          monthKey: dateKey(transaction.date).slice(0, 7),
          type: transaction.type,
          category: transaction.category,
          description: transaction.description,
          paymentMethod: transaction.paymentMethod,
          currency: transaction.currency === "MGA" ? "MGA" : "EUR",
          amountInCurrency: amountOf(transaction.amountInCurrency || transaction.amount),
          amountEur: amount,
          amountMga: convertEurToMga(amount),
          amount,
          ageInDays,
          eisenhowerQuadrant,
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
      const monthsMap = new Map<string, { monthKey: string; entries: number; sorties: number; revenueEur: number; expensesEur: number; balanceEur: number }>();
      for (const row of rows) {
        const current = monthsMap.get(row.monthKey) || { monthKey: row.monthKey, entries: 0, sorties: 0, revenueEur: 0, expensesEur: 0, balanceEur: 0 };
        if (row.type === "entrée") { current.entries += 1; current.revenueEur += row.amountEur; }
        else { current.sorties += 1; current.expensesEur += row.amountEur; }
        current.balanceEur = current.revenueEur - current.expensesEur;
        monthsMap.set(row.monthKey, current);
      }
      const categories = Array.from(new Set(transactions.map((transaction) => transaction.category))).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
      const totalRevenueEur = rows.filter((row) => row.type === "entrée").reduce((sum, row) => sum + row.amountEur, 0);
      const totalExpensesEur = rows.filter((row) => row.type === "sortie").reduce((sum, row) => sum + row.amountEur, 0);
      return {
        filters: { monthKey, type: input?.type || "tous", category },
        categories,
        rows,
        months: Array.from(monthsMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey)).map((month) => ({ ...month, revenueMga: convertEurToMga(month.revenueEur), expensesMga: convertEurToMga(month.expensesEur), balanceMga: convertEurToMga(month.balanceEur) })),
        totals: { entries: rows.filter((row) => row.type === "entrée").length, sorties: rows.filter((row) => row.type === "sortie").length, revenueEur: totalRevenueEur, expensesEur: totalExpensesEur, balanceEur: totalRevenueEur - totalExpensesEur, revenueMga: convertEurToMga(totalRevenueEur), expensesMga: convertEurToMga(totalExpensesEur), balanceMga: convertEurToMga(totalRevenueEur - totalExpensesEur) },
      };
    }),
    hrStatistics: protectedProcedure.input(z.object({
      fromMonth: z.string().regex(/^\d{4}-\d{2}$/, "Le mois de début doit être au format AAAA-MM").optional(),
      toMonth: z.string().regex(/^\d{4}-\d{2}$/, "Le mois de fin doit être au format AAAA-MM").optional(),
      agentId: z.number().int().positive().optional(),
      department: z.string().trim().optional(),
    }).optional()).query(async ({ input }) => {
      const [agentRows, timeEntryRows, advanceRows, transactionRows] = await Promise.all([
        db.getAgents(),
        db.getTimeEntries(),
        db.getSalaryAdvances(),
        db.getCashTransactions(),
      ]);
      const fromMonth = input?.fromMonth || "";
      const toMonth = input?.toMonth || "";
      const inRange = (monthKey: string) => (!fromMonth || monthKey >= fromMonth) && (!toMonth || monthKey <= toMonth);
      const matchingAgents = agentRows.filter((agent) => (!input?.agentId || agent.id === input.agentId) && (!input?.department || agent.department === input.department));
      const agentIds = new Set(matchingAgents.map((agent) => agent.id));
      const entries = timeEntryRows.filter((entry) => agentIds.has(entry.agentId) && inRange(dateKey(entry.date).slice(0, 7)));
      const advances = advanceRows.filter((advance) => agentIds.has(advance.agentId) && inRange(dateKey(advance.requestedDate).slice(0, 7)));
      const hrCategory = (category: string) => /salaire|paie|avance|personnel|rh|prime|formation|congé|absence/i.test(category);
      const cashOutflows = transactionRows.filter((transaction) => transaction.type === "sortie" && hrCategory(transaction.category) && inRange(dateKey(transaction.date).slice(0, 7)));
      const dailyMap = new Map<string, { date: string; hours: number; workDays: number; advancesEur: number; cashOutEur: number }>();
      const ensureDay = (date: string) => dailyMap.get(date) || { date, hours: 0, workDays: 0, advancesEur: 0, cashOutEur: 0 };
      for (const entry of entries) {
        const date = dateKey(entry.date);
        const current = ensureDay(date);
        const hours = amountOf(entry.hoursWorked);
        current.hours += hours;
        current.workDays += hours / 8;
        dailyMap.set(date, current);
      }
      for (const advance of advances) {
        const date = dateKey(advance.requestedDate);
        const current = ensureDay(date);
        current.advancesEur += amountOf(advance.amount);
        dailyMap.set(date, current);
      }
      for (const transaction of cashOutflows) {
        const date = dateKey(transaction.date);
        const current = ensureDay(date);
        current.cashOutEur += amountOf(transaction.amount);
        dailyMap.set(date, current);
      }
      const daily = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)).map((row) => ({
        ...row,
        workDays: Number(row.workDays.toFixed(2)),
        totalOutEur: row.advancesEur + row.cashOutEur,
        advancesMga: convertEurToMga(row.advancesEur),
        cashOutMga: convertEurToMga(row.cashOutEur),
        totalOutMga: convertEurToMga(row.advancesEur + row.cashOutEur),
      }));
      const agentMapRows = new Map<number, { agentId: number; agentName: string; department: string; hours: number; workDays: number; salaryEur: number; advancesEur: number }>();
      for (const agent of matchingAgents) agentMapRows.set(agent.id, { agentId: agent.id, agentName: agent.name, department: agent.department, hours: 0, workDays: 0, salaryEur: amountOf(agent.salary), advancesEur: 0 });
      for (const entry of entries) {
        const current = agentMapRows.get(entry.agentId);
        if (!current) continue;
        const hours = amountOf(entry.hoursWorked);
        current.hours += hours;
        current.workDays += hours / 8;
      }
      for (const advance of advances) {
        const current = agentMapRows.get(advance.agentId);
        if (current) current.advancesEur += amountOf(advance.amount);
      }
      const byAgent = Array.from(agentMapRows.values()).map((row) => ({ ...row, workDays: Number(row.workDays.toFixed(2)), salaryMga: convertEurToMga(row.salaryEur), advancesMga: convertEurToMga(row.advancesEur) })).sort((a, b) => b.workDays - a.workDays);
      const departmentMap = new Map<string, { department: string; agentCount: number; hours: number; workDays: number; salaryEur: number; advancesEur: number }>();
      for (const row of byAgent) {
        const current = departmentMap.get(row.department) || { department: row.department, agentCount: 0, hours: 0, workDays: 0, salaryEur: 0, advancesEur: 0 };
        current.agentCount += 1;
        current.hours += row.hours;
        current.workDays += row.workDays;
        current.salaryEur += row.salaryEur;
        current.advancesEur += row.advancesEur;
        departmentMap.set(row.department, current);
      }
      const byDepartment = Array.from(departmentMap.values()).map((row) => ({ ...row, workDays: Number(row.workDays.toFixed(2)), salaryMga: convertEurToMga(row.salaryEur), advancesMga: convertEurToMga(row.advancesEur) })).sort((a, b) => b.workDays - a.workDays);
      const plannedPayrollEur = matchingAgents.reduce((sum, agent) => sum + amountOf(agent.salary), 0);
      const advancesEur = advances.reduce((sum, advance) => sum + amountOf(advance.amount), 0);
      const cashOutEur = cashOutflows.reduce((sum, transaction) => sum + amountOf(transaction.amount), 0);
      return {
        filters: { fromMonth, toMonth, agentId: input?.agentId || null, department: input?.department || "" },
        agents: matchingAgents.map((agent) => ({ id: agent.id, name: agent.name, department: agent.department })),
        departments: Array.from(new Set(agentRows.map((agent) => agent.department))).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr")),
        daily,
        byAgent,
        byDepartment,
        totals: { hours: entries.reduce((sum, entry) => sum + amountOf(entry.hoursWorked), 0), workDays: Number(entries.reduce((sum, entry) => sum + amountOf(entry.hoursWorked) / 8, 0).toFixed(2)), plannedPayrollEur, plannedPayrollMga: convertEurToMga(plannedPayrollEur), advancesEur, advancesMga: convertEurToMga(advancesEur), cashOutEur, cashOutMga: convertEurToMga(cashOutEur) },
      };
    }),
    caStatistics: protectedProcedure.input(z.object({
      fromMonth: z.string().regex(/^\d{4}-\d{2}$/, "Le mois de début doit être au format AAAA-MM").optional(),
      toMonth: z.string().regex(/^\d{4}-\d{2}$/, "Le mois de fin doit être au format AAAA-MM").optional(),
      clientId: z.number().int().positive().optional(),
      serviceName: z.string().trim().optional(),
      status: z.enum(["tous", "encaissée", "en retard", "annulée", "autre"]).default("tous"),
    }).optional()).query(async ({ input }) => {
      const [invoiceRows, clientRows] = await Promise.all([db.getInvoices(), db.getClients()]);
      const clientMap = new Map(clientRows.map((client) => [client.id, client.companyName]));
      const fromMonth = input?.fromMonth || "";
      const toMonth = input?.toMonth || "";
      const inRange = (monthKey: string) => (!fromMonth || monthKey >= fromMonth) && (!toMonth || monthKey <= toMonth);
      const selected = invoiceRows.filter((invoice) => {
        const monthKey = dateKey(invoice.issueDate).slice(0, 7);
        const services = invoiceServiceNames(invoice.itemsJson);
        const bucket = invoiceStatusBucket(invoice.status);
        return inRange(monthKey) && (!input?.clientId || invoice.clientId === input.clientId) && (!input?.serviceName || services.includes(input.serviceName)) && (!input?.status || input.status === "tous" || bucket === input.status);
      });
      const rows = selected.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: dateKey(invoice.issueDate),
        dueDate: dateKey(invoice.dueDate),
        monthKey: dateKey(invoice.issueDate).slice(0, 7),
        clientId: invoice.clientId,
        clientName: clientMap.get(invoice.clientId) || "Client non renseigné",
        services: invoiceServiceNames(invoice.itemsJson),
        status: invoice.status,
        statusBucket: invoiceStatusBucket(invoice.status),
        totalAmountEur: amountOf(invoice.totalAmount),
        totalAmountMga: convertEurToMga(amountOf(invoice.totalAmount)),
      }));
      const byPeriod = Array.from(new Set(rows.map((row) => row.monthKey))).sort().map((key) => { const matching = rows.filter((row) => row.monthKey === key); return { key, invoiceCount: matching.length, amountEur: matching.reduce((sum, row) => sum + row.totalAmountEur, 0), amountMga: convertEurToMga(matching.reduce((sum, row) => sum + row.totalAmountEur, 0)) }; });
      const byClient = Array.from(new Set(rows.map((row) => row.clientName))).sort((a, b) => a.localeCompare(b, "fr")).map((key) => { const matching = rows.filter((row) => row.clientName === key); return { key, invoiceCount: matching.length, amountEur: matching.reduce((sum, row) => sum + row.totalAmountEur, 0), amountMga: convertEurToMga(matching.reduce((sum, row) => sum + row.totalAmountEur, 0)) }; });
      const serviceKeys = Array.from(new Set(rows.flatMap((row) => row.services))).sort((a, b) => a.localeCompare(b, "fr"));
      const byService = serviceKeys.map((key) => { const matching = rows.filter((row) => row.services.includes(key)); return { key, invoiceCount: matching.length, amountEur: matching.reduce((sum, row) => sum + row.totalAmountEur, 0), amountMga: convertEurToMga(matching.reduce((sum, row) => sum + row.totalAmountEur, 0)) }; });
      const statusKeys = ["encaissée", "en retard", "annulée", "autre"];
      const byStatus = statusKeys.map((key) => { const matching = rows.filter((row) => row.statusBucket === key); return { key, invoiceCount: matching.length, amountEur: matching.reduce((sum, row) => sum + row.totalAmountEur, 0), amountMga: convertEurToMga(matching.reduce((sum, row) => sum + row.totalAmountEur, 0)) }; });
      const totalAmountEur = rows.reduce((sum, row) => sum + row.totalAmountEur, 0);
      return { filters: { fromMonth, toMonth, clientId: input?.clientId || null, serviceName: input?.serviceName || "", status: input?.status || "tous" }, clients: clientRows.map((client) => ({ id: client.id, name: client.companyName })), services: serviceKeys, rows, byPeriod, byClient, byService, byStatus, totals: { invoiceCount: rows.length, amountEur: totalAmountEur, amountMga: convertEurToMga(totalAmountEur), encaissed: rows.filter((row) => row.statusBucket === "encaissée").length, overdue: rows.filter((row) => row.statusBucket === "en retard").length, cancelled: rows.filter((row) => row.statusBucket === "annulée").length } };
    }),
    listDynamicStats: protectedProcedure.input(z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Le mois doit être au format AAAA-MM").optional(),
      clientName: z.string().trim().optional(),
      agentName: z.string().trim().optional(),
      serviceName: z.string().trim().optional(),
    }).optional()).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const rows = await database.select().from(dynamicStats);
      return rows.filter((row) => {
        if (input?.monthKey && row.monthKey !== input.monthKey) return false;
        if (input?.clientName && row.clientName !== input.clientName) return false;
        if (input?.agentName && row.agentName !== input.agentName) return false;
        if (input?.serviceName && row.serviceName !== input.serviceName) return false;
        return true;
      });
    }),
    statFilterOptions: protectedProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const rows = await database.select().from(dynamicStats);
      const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"));
      return {
        months: unique(rows.map((row) => row.monthKey)),
        clients: unique(rows.map((row) => row.clientName)),
        agents: unique(rows.map((row) => row.agentName)),
        services: unique(rows.map((row) => row.serviceName)),
      };
    }),
    createDynamicStat: protectedProcedure.input(z.object({
      monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Le mois doit être au format AAAA-MM"),
      clientName: z.string().trim().min(1, "Le client est obligatoire"),
      agentName: z.string().trim().min(1, "L’agent est obligatoire"),
      serviceName: z.string().trim().min(1, "Le service est obligatoire"),
      revenue: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Le CA est invalide"),
      expenses: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Les dépenses sont invalides"),
      workDays: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Les jours travaillés sont invalides"),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(dynamicStats).values({ ...input, notes: input.notes || null } as any);
      return { success: true };
    }),
    updateDynamicStat: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Le mois doit être au format AAAA-MM"),
      clientName: z.string().trim().min(1),
      agentName: z.string().trim().min(1),
      serviceName: z.string().trim().min(1),
      revenue: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0),
      expenses: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0),
      workDays: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const { id, ...values } = input;
      await database.update(dynamicStats).set({ ...values, notes: values.notes || null } as any).where(eq(dynamicStats.id, id));
      return { success: true };
    }),
    deleteDynamicStat: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.delete(dynamicStats).where(eq(dynamicStats.id, input.id));
      return { success: true };
    }),
    listBudgetSheets: protectedProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      return await database.select().from(budgetSheets);
    }),
    createBudgetSheet: protectedProcedure.input(z.object({
      title: z.string().trim().min(1, "Le titre est obligatoire"),
      monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Le mois doit être au format AAAA-MM"),
      currency: z.enum(["EUR", "MGA"]).default("MGA"),
      exchangeRate: z.string().trim().optional(),
      items: z.array(z.object({
        label: z.string().trim().min(1),
        category: z.string().trim().min(1),
        amount: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0),
        note: z.string().trim().optional(),
      })).min(1, "Ajoutez au moins une dépense"),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const amountInCurrency = input.items.reduce((sum, item) => sum + amountOf(item.amount), 0);
      const normalized = normalizeCurrencyAmount(amountInCurrency, input.currency, input.exchangeRate);
      await database.insert(budgetSheets).values({
        title: input.title,
        monthKey: input.monthKey,
        itemsJson: JSON.stringify(input.items),
        totalAmount: String(normalized.amount),
        amountInCurrency: String(normalized.amountInCurrency),
        currency: normalized.currency,
        exchangeRate: String(normalized.exchangeRate),
        status: "brouillon",
        notes: input.notes || null,
      } as any);
      return { success: true, ...normalized };
    }),
    updateBudgetSheet: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1),
      monthKey: z.string().regex(/^\d{4}-\d{2}$/),
      currency: z.enum(["EUR", "MGA"]),
      exchangeRate: z.string().trim().optional(),
      items: z.array(z.object({
        label: z.string().trim().min(1),
        category: z.string().trim().min(1),
        amount: z.string().trim().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0),
        note: z.string().trim().optional(),
      })).min(1),
      notes: z.string().trim().optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select().from(budgetSheets).where(eq(budgetSheets.id, input.id)).limit(1);
      if (!existing[0]) throw new Error("Feuille budgétaire introuvable");
      if (existing[0].status === "converti_caisse") throw new Error("Une feuille convertie en caisse ne peut plus être modifiée");
      const amountInCurrency = input.items.reduce((sum, item) => sum + amountOf(item.amount), 0);
      const normalized = normalizeCurrencyAmount(amountInCurrency, input.currency, input.exchangeRate);
      await database.update(budgetSheets).set({
        title: input.title,
        monthKey: input.monthKey,
        itemsJson: JSON.stringify(input.items),
        totalAmount: String(normalized.amount),
        amountInCurrency: String(normalized.amountInCurrency),
        currency: normalized.currency,
        exchangeRate: String(normalized.exchangeRate),
        notes: input.notes || null,
        status: "brouillon",
      } as any).where(eq(budgetSheets.id, input.id));
      return { success: true, ...normalized };
    }),
    deleteBudgetSheet: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: budgetSheets.id, status: budgetSheets.status }).from(budgetSheets).where(eq(budgetSheets.id, input.id)).limit(1);
      if (!existing[0]) throw new Error("Feuille budgétaire introuvable");
      if (existing[0].status === "converti_caisse") throw new Error("Une feuille convertie en caisse ne peut plus être supprimée");
      await database.delete(budgetSheets).where(eq(budgetSheets.id, input.id));
      return { success: true };
    }),
    convertBudgetSheetToTransaction: protectedProcedure.input(z.object({
      budgetSheetId: z.number().int().positive(),
      paymentMethod: z.string().trim().min(1).default("Virement"),
      date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const rows = await database.select().from(budgetSheets).where(eq(budgetSheets.id, input.budgetSheetId)).limit(1);
      const sheet = rows[0];
      if (!sheet) throw new Error("Feuille budgétaire introuvable");
      if (sheet.status === "converti_caisse") throw new Error("Cette feuille est déjà convertie en sortie de caisse");
      const reference = `BUDGET-${sheet.id}`;
      const existingTransactions = await db.getCashTransactions();
      if (existingTransactions.some((transaction) => transaction.reference === reference)) throw new Error("Cette feuille possède déjà une sortie de caisse associée");
      const amountInCurrency = amountOf(sheet.amountInCurrency) || amountOf(sheet.totalAmount);
      const normalized = normalizeCurrencyAmount(amountInCurrency, sheet.currency, sheet.exchangeRate);
      await database.insert(cashTransactions).values({
        type: "sortie",
        category: "Budget Planner",
        ...normalized,
        date: input.date || new Date().toISOString().slice(0, 10),
        paymentMethod: input.paymentMethod,
        reference,
        description: `Conversion de la feuille budgétaire « ${sheet.title} » en sortie de caisse`,
      } as any);
      await database.update(budgetSheets).set({ status: "converti_caisse" }).where(eq(budgetSheets.id, sheet.id));
      return { success: true, reference, ...normalized };
    }),
  }),

  // Module CRM Leads
  crm: router({
    listLeads: protectedProcedure.query(async ({ ctx }) => {
      return await db.getLeads(ctx.user.activeProjectId);
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
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(leads).values({
        projectId: ctx.user.activeProjectId,
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
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.id), projectScope(leads.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Lead introuvable");
      await database.update(leads).set({ status: input.status }).where(and(eq(leads.id, input.id), projectScope(leads.projectId, ctx.user.activeProjectId)));
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
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.id), projectScope(leads.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Lead introuvable");
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
      } as any).where(and(eq(leads.id, input.id), projectScope(leads.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),
    convertLeadToClient: protectedProcedure.input(z.object({
      leadId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      
      const leadRes = await database.select().from(leads).where(and(eq(leads.id, input.leadId), projectScope(leads.projectId, ctx.user.activeProjectId))).limit(1);
      if (leadRes.length === 0) throw new Error("Lead introuvable");
      const lead = leadRes[0];

      await database.insert(clients).values({
        projectId: ctx.user.activeProjectId ?? lead.projectId,
        companyName: lead.companyName,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        notes: `Converti depuis le lead #${lead.id}. ${lead.notes || ''}`,
        category: "Standard",
        status: "actif",
      });

      await database.update(leads).set({ status: "gagne" }).where(and(eq(leads.id, input.leadId), projectScope(leads.projectId, ctx.user.activeProjectId)));

      return { success: true };
    }),
  }),

  // Module Base Clients & Documents
  clientsModule: router({
    listClients: protectedProcedure.query(async ({ ctx }) => {
      return await db.getClients(ctx.user.activeProjectId);
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
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.insert(clients).values({
        projectId: ctx.user.activeProjectId,
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
    listCatalogItems: protectedProcedure.query(async ({ ctx }) => {
      return await db.getCatalogItems(ctx.user.activeProjectId);
    }),
    createCatalogItem: supervisorProcedure.input(z.object({
      itemType: z.enum(["produit", "prestation"]).default("prestation"),
      label: z.string().trim().min(1, "Le libellé est obligatoire"),
      description: z.string().optional(),
      unit: z.string().trim().min(1).default("unité"),
      unitPrice: z.string().trim().min(1),
      currency: z.enum(["EUR", "MGA"]).default("MGA"),
      pricingMode: z.enum(["ponctuel", "récurrent", "mensuel"]).default("ponctuel"),
      taxRate: z.string().trim().default("0"),
      clientVisible: z.boolean().default(true),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const price = amountOf(input.unitPrice);
      if (price < 0) throw new Error("Le tarif ne peut pas être négatif");
      await database.insert(catalogItems).values({
        projectId: ctx.user.activeProjectId,
        itemType: input.itemType,
        label: input.label,
        description: input.description || null,
        unit: input.unit,
        unitPrice: price.toFixed(2),
        currency: input.currency,
        pricingMode: input.pricingMode,
        taxRate: Math.max(0, amountOf(input.taxRate)).toFixed(2),
        clientVisible: input.clientVisible ? 1 : 0,
        status: "actif",
      });
      return { success: true };
    }),
    updateCatalogItem: supervisorProcedure.input(z.object({
      id: z.number().int().positive(),
      itemType: z.enum(["produit", "prestation"]),
      label: z.string().trim().min(1),
      description: z.string().optional(),
      unit: z.string().trim().min(1),
      unitPrice: z.string().trim().min(1),
      currency: z.enum(["EUR", "MGA"]),
      pricingMode: z.enum(["ponctuel", "récurrent", "mensuel"]),
      taxRate: z.string().trim().default("0"),
      clientVisible: z.boolean().default(true),
      status: z.enum(["actif", "inactif"]).default("actif"),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: catalogItems.id }).from(catalogItems).where(and(eq(catalogItems.id, input.id), projectScope(catalogItems.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Article catalogue introuvable");
      await database.update(catalogItems).set({
        itemType: input.itemType,
        label: input.label,
        description: input.description || null,
        unit: input.unit,
        unitPrice: amountOf(input.unitPrice).toFixed(2),
        currency: input.currency,
        pricingMode: input.pricingMode,
        taxRate: Math.max(0, amountOf(input.taxRate)).toFixed(2),
        clientVisible: input.clientVisible ? 1 : 0,
        status: input.status,
      }).where(and(eq(catalogItems.id, input.id), projectScope(catalogItems.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),
    archiveCatalogItem: supervisorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: catalogItems.id }).from(catalogItems).where(and(eq(catalogItems.id, input.id), projectScope(catalogItems.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Article catalogue introuvable");
      await database.update(catalogItems).set({ status: "inactif" }).where(and(eq(catalogItems.id, input.id), projectScope(catalogItems.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),
    listQuotes: protectedProcedure.query(async ({ ctx }) => {
      return await db.getQuotes(ctx.user.activeProjectId);
    }),
    createQuote: supervisorProcedure.input(z.object({
      quoteNumber: z.string().trim().min(1),
      clientId: z.number().int().positive(),
      issueDate: z.string().trim().min(1),
      validUntil: z.string().trim().min(1),
      itemsJson: z.string().trim().min(1),
      currency: z.enum(["EUR", "MGA"]).default("EUR"),
      documentProfile: z.enum(["fr", "mg"]).default("fr"),
      discountType: z.enum(["none", "percent", "fixed"]).default("none"),
      discountValue: z.string().trim().default("0"),
      taxRate: z.string().trim().default("0"),
      notes: z.string().optional(),
      termsAndConditions: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const totals = calculateCommercialTotals(input.itemsJson, "0", input.discountType, input.discountValue, input.taxRate);
      await database.insert(quotes).values({
        projectId: ctx.user.activeProjectId,
        quoteNumber: input.quoteNumber,
        clientId: input.clientId,
        issueDate: input.issueDate,
        validUntil: input.validUntil,
        subtotalAmount: totals.subtotalAmount,
        discountType: input.discountType,
        discountValue: amountOf(input.discountValue).toFixed(2),
        taxRate: amountOf(input.taxRate).toFixed(2),
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        currency: input.currency,
        documentProfile: input.documentProfile,
        itemsJson: input.itemsJson,
        notes: input.notes || null,
        termsAndConditions: input.termsAndConditions || null,
        status: "brouillon",
      } as any);
      return { success: true };
    }),
    updateQuoteStatus: supervisorProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["brouillon", "envoyé", "accepté", "refusé", "annulé", "facturé"]),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.id, input.id), projectScope(quotes.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Devis introuvable");
      await database.update(quotes).set({ status: input.status }).where(and(eq(quotes.id, input.id), projectScope(quotes.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),
    confirmQuoteDraft: supervisorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: quotes.id, status: quotes.status }).from(quotes).where(and(eq(quotes.id, input.id), projectScope(quotes.projectId, ctx.user.activeProjectId))).limit(1);
      if (!existing[0]) throw new Error("Devis introuvable");
      if (existing[0].status !== "brouillon") throw new Error("Seuls les devis en brouillon peuvent être confirmés");
      await database.update(quotes).set({ status: "envoyé" }).where(and(eq(quotes.id, input.id), projectScope(quotes.projectId, ctx.user.activeProjectId)));
      return { success: true, status: "envoyé" as const };
    }),
    cancelQuoteDraft: supervisorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: quotes.id, status: quotes.status }).from(quotes).where(and(eq(quotes.id, input.id), projectScope(quotes.projectId, ctx.user.activeProjectId))).limit(1);
      if (!existing[0]) throw new Error("Devis introuvable");
      if (existing[0].status !== "brouillon") throw new Error("Seuls les devis en brouillon peuvent être annulés");
      await database.update(quotes).set({ status: "annulé" }).where(and(eq(quotes.id, input.id), projectScope(quotes.projectId, ctx.user.activeProjectId)));
      return { success: true, status: "annulé" as const };
    }),

    listInvoices: protectedProcedure.query(async ({ ctx }) => {
      return await db.getInvoices(ctx.user.activeProjectId);
    }),
    createInvoice: supervisorProcedure.input(z.object({
      invoiceNumber: z.string().trim().min(1),
      clientId: z.number().int().positive(),
      quoteId: z.number().int().positive().optional(),
      issueDate: z.string().trim().min(1),
      dueDate: z.string().trim().min(1),
      itemsJson: z.string().trim().min(1),
      currency: z.enum(["EUR", "MGA"]).default("EUR"),
      documentProfile: z.enum(["fr", "mg"]).default("fr"),
      discountType: z.enum(["none", "percent", "fixed"]).default("none"),
      discountValue: z.string().trim().default("0"),
      taxRate: z.string().trim().default("0"),
      notes: z.string().optional(),
      termsAndConditions: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const totals = calculateCommercialTotals(input.itemsJson, "0", input.discountType, input.discountValue, input.taxRate);
      await database.insert(invoices).values({
        projectId: ctx.user.activeProjectId,
        invoiceNumber: input.invoiceNumber,
        clientId: input.clientId,
        quoteId: input.quoteId || null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        subtotalAmount: totals.subtotalAmount,
        discountType: input.discountType,
        discountValue: amountOf(input.discountValue).toFixed(2),
        taxRate: amountOf(input.taxRate).toFixed(2),
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        currency: input.currency,
        documentProfile: input.documentProfile,
        itemsJson: input.itemsJson,
        notes: input.notes || null,
        termsAndConditions: input.termsAndConditions || null,
        status: "brouillon",
      } as any);
      return { success: true };
    }),
    updateInvoiceStatus: supervisorProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["brouillon", "émise", "payée", "en_retard", "annulée"]),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Facture introuvable");
      await database.update(invoices).set({ status: input.status }).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),
    confirmInvoiceDraft: supervisorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: invoices.id, status: invoices.status }).from(invoices).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId))).limit(1);
      if (!existing[0]) throw new Error("Facture introuvable");
      if (existing[0].status !== "brouillon") throw new Error("Seules les factures en brouillon peuvent être confirmées");
      await database.update(invoices).set({ status: "émise" }).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId)));
      return { success: true, status: "émise" as const };
    }),
    cancelInvoiceDraft: supervisorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: invoices.id, status: invoices.status }).from(invoices).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId))).limit(1);
      if (!existing[0]) throw new Error("Facture introuvable");
      if (existing[0].status !== "brouillon") throw new Error("Seules les factures en brouillon peuvent être annulées");
      await database.update(invoices).set({ status: "annulée" }).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId)));
      return { success: true, status: "annulée" as const };
    }),
    updateInvoiceDraft: supervisorProcedure.input(z.object({
      id: z.number().int().positive(),
      invoiceNumber: z.string().trim().min(1),
      clientId: z.number().int().positive(),
      quoteId: z.number().int().positive().optional(),
      issueDate: z.string().trim().min(1),
      dueDate: z.string().trim().min(1),
      itemsJson: z.string().trim().min(1),
      currency: z.enum(["EUR", "MGA"]).default("EUR"),
      documentProfile: z.enum(["fr", "mg"]).default("fr"),
      discountType: z.enum(["none", "percent", "fixed"]).default("none"),
      discountValue: z.string().trim().default("0"),
      taxRate: z.string().trim().default("0"),
      notes: z.string().optional(),
      termsAndConditions: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select().from(invoices).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId))).limit(1);
      if (existing.length === 0) throw new Error("Facture introuvable");
      if (existing[0].status !== "brouillon") throw new Error("Seules les factures en brouillon peuvent être modifiées");
      const totals = calculateCommercialTotals(input.itemsJson, "0", input.discountType, input.discountValue, input.taxRate);
      await database.update(invoices).set({
        clientId: input.clientId,
        quoteId: input.quoteId || null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        subtotalAmount: totals.subtotalAmount,
        discountType: input.discountType,
        discountValue: amountOf(input.discountValue).toFixed(2),
        taxRate: amountOf(input.taxRate).toFixed(2),
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        currency: input.currency,
        documentProfile: input.documentProfile,
        itemsJson: input.itemsJson,
        notes: input.notes || null,
        termsAndConditions: input.termsAndConditions || null,
      } as any).where(and(eq(invoices.id, input.id), projectScope(invoices.projectId, ctx.user.activeProjectId)));
      return { success: true };
    }),
    nextQuoteNumber: protectedProcedure.query(async ({ ctx }) => {
      const quoteList = await db.getQuotes(ctx.user.activeProjectId);
      const currentYear = new Date().getFullYear();
      const maxSequence = quoteList.reduce((max, quote) => {
        const match = String(quote.quoteNumber).match(new RegExp(`DEV-${currentYear}-(\\d+)`));
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      return `DEV-${currentYear}-${String(maxSequence + 1).padStart(3, "0")}`;
    }),
    nextInvoiceNumber: protectedProcedure.query(async ({ ctx }) => {
      const invoiceList = await db.getInvoices(ctx.user.activeProjectId);
      const currentYear = new Date().getFullYear();
      const maxSequence = invoiceList.reduce((max, invoice) => {
        const match = String(invoice.invoiceNumber).match(new RegExp(`FAC-${currentYear}-(\\d+)`));
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      return `FAC-${currentYear}-${String(maxSequence + 1).padStart(3, "0")}`;
    }),
  }),

  admin: router({
    listUsers: adminProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      return database.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        accountStatus: users.accountStatus,
        preferredCurrency: users.preferredCurrency,
        showMGAEquivalent: users.showMGAEquivalent,
        activeProjectId: users.activeProjectId,
        loginMethod: users.loginMethod,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users);
    }),
    createUser: adminProcedure.input(z.object({
      name: z.string().trim().min(1, "Le nom est obligatoire"),
      email: z.string().trim().email("L’email est invalide"),
      role: z.enum(["collaborateur", "superviseur", "admin"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) throw new Error("Un compte existe déjà avec cet email");
      const openId = `pending:${Date.now()}:${input.email}`;
      const invitationToken = randomUUID();
      await database.insert(users).values({
        openId,
        name: input.name,
        email: input.email,
        loginMethod: "admin_invite",
        role: input.role,
        accountStatus: "invited",
        invitationToken,
      } as any);
      const created = await database.select({ id: users.id, name: users.name, email: users.email, role: users.role, accountStatus: users.accountStatus }).from(users).where(eq(users.openId, openId)).limit(1);
      return created[0] ?? { success: true };
    }),
    updateUserRole: adminProcedure.input(z.object({
      userId: z.number().int().positive(),
      role: z.enum(["collaborateur", "superviseur", "admin"]),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (existing.length === 0) throw new Error("Compte introuvable");
      if (existing[0].role === "admin" && input.role !== "admin") {
        const admins = await database.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
        if (admins.length <= 1) throw new Error("Le dernier administrateur ne peut pas être rétrogradé");
      }
      await database.update(users).set({ role: input.role } as any).where(eq(users.id, input.userId));
      return { success: true, changedBy: ctx.user.id };
    }),
    getRolePermissions: adminProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const overrides = await database.select().from(rolePermissions);
      const roles = ["collaborateur", "superviseur", "admin"] as const;
      return roles.flatMap(role => PERMISSION_KEYS.map(permissionKey => {
        const override = overrides.find(row => row.role === role && row.permissionKey === permissionKey);
        return { role, permissionKey, enabled: override ? Boolean(override.enabled) : DEFAULT_ROLE_PERMISSIONS[role].includes(permissionKey), configured: Boolean(override) };
      }));
    }),
    updateRolePermission: adminProcedure.input(z.object({
      role: z.enum(["collaborateur", "superviseur", "admin"]),
      permissionKey: z.enum(PERMISSION_KEYS),
      enabled: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      if (input.role === "admin" && !input.enabled) throw new Error("Les permissions administrateur restent toujours disponibles");
      const existing = await database.select({ id: rolePermissions.id }).from(rolePermissions).where(and(eq(rolePermissions.role, input.role), eq(rolePermissions.permissionKey, input.permissionKey))).limit(1);
      if (existing[0]) {
        await database.update(rolePermissions).set({ enabled: input.enabled, updatedBy: ctx.user.id } as any).where(eq(rolePermissions.id, existing[0].id));
      } else {
        await database.insert(rolePermissions).values({ role: input.role, permissionKey: input.permissionKey, enabled: input.enabled, updatedBy: ctx.user.id } as any);
      }
      return { success: true, role: input.role, permissionKey: input.permissionKey, enabled: input.enabled };
    }),
    listSupervisorTeams: adminProcedure.input(z.object({ supervisorUserId: z.number().int().positive().optional(), projectId: z.number().int().positive().nullable().optional() }).optional()).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const filters = [] as any[];
      if (input?.supervisorUserId) filters.push(eq(supervisorTeams.supervisorUserId, input.supervisorUserId));
      if (input?.projectId !== undefined) filters.push(input.projectId === null ? isNull(supervisorTeams.projectId) : eq(supervisorTeams.projectId, input.projectId));
      return database.select({ id: supervisorTeams.id, supervisorUserId: supervisorTeams.supervisorUserId, projectId: supervisorTeams.projectId, department: supervisorTeams.department, supervisorName: users.name, supervisorEmail: users.email }).from(supervisorTeams).leftJoin(users, eq(supervisorTeams.supervisorUserId, users.id)).where(filters.length ? and(...filters) : undefined);
    }),
    assignSupervisorTeam: adminProcedure.input(z.object({ supervisorUserId: z.number().int().positive(), projectId: z.number().int().positive().nullable().optional(), department: z.string().trim().min(1, "L’équipe est obligatoire") })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const [supervisor] = await database.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.supervisorUserId)).limit(1);
      if (!supervisor || supervisor.role !== "superviseur") throw new Error("Le compte doit avoir le rôle superviseur");
      if (input.projectId) {
        const project = await database.select({ id: agencyProjects.id }).from(agencyProjects).where(eq(agencyProjects.id, input.projectId)).limit(1);
        if (!project[0]) throw new Error("Projet introuvable");
      }
      const existing = await database.select({ id: supervisorTeams.id }).from(supervisorTeams).where(and(eq(supervisorTeams.supervisorUserId, input.supervisorUserId), input.projectId === null || input.projectId === undefined ? isNull(supervisorTeams.projectId) : eq(supervisorTeams.projectId, input.projectId), eq(supervisorTeams.department, input.department))).limit(1);
      if (!existing[0]) await database.insert(supervisorTeams).values({ supervisorUserId: input.supervisorUserId, projectId: input.projectId ?? null, department: input.department } as any);
      return { success: true };
    }),
    removeSupervisorTeam: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.delete(supervisorTeams).where(eq(supervisorTeams.id, input.id));
      return { success: true };
    }),
    updateRevenueVisibility: adminProcedure.input(z.object({ projectId: z.number().int().positive(), showRevenueDashboard: z.boolean() })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const project = await database.select({ id: agencyProjects.id }).from(agencyProjects).where(eq(agencyProjects.id, input.projectId)).limit(1);
      if (!project[0]) throw new Error("Projet introuvable");
      await database.update(agencyProjects).set({ showRevenueDashboard: input.showRevenueDashboard } as any).where(eq(agencyProjects.id, input.projectId));
      return { success: true, showRevenueDashboard: input.showRevenueDashboard };
    }),
    listProjects: adminProcedure.query(async () => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      return database.select().from(agencyProjects);
    }),
    createProject: adminProcedure.input(z.object({
      name: z.string().trim().min(2, "Le nom du projet est obligatoire"),
      slug: z.string().trim().min(2).optional(),
      description: z.string().trim().optional(),
      managementTemplate: z.enum(PROJECT_TEMPLATE_KEYS).default("agence_complete"),
      defaultCurrency: z.enum(["EUR", "MGA"]).default("MGA"),
      jurisdiction: z.enum(["fr", "mg"]).default("fr"),
      ownerUserId: z.number().int().positive().optional(),
      ownerRole: z.enum(["collaborateur", "superviseur", "admin"]).default("superviseur"),
      activateForCreator: z.boolean().default(true),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const slug = (input.slug || input.name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
      if (!slug) throw new Error("Le slug du projet est invalide");
      const duplicate = await database.select({ id: agencyProjects.id }).from(agencyProjects).where(eq(agencyProjects.slug, slug)).limit(1);
      if (duplicate.length > 0) throw new Error("Un projet existe déjà avec ce slug");
      if (input.ownerUserId) {
        const owner = await database.select({ id: users.id }).from(users).where(eq(users.id, input.ownerUserId)).limit(1);
        if (owner.length === 0) throw new Error("Le compte responsable est introuvable");
      }
      await database.insert(agencyProjects).values({
        name: input.name,
        slug,
        description: input.description || null,
        managementTemplate: input.managementTemplate,
        defaultCurrency: input.defaultCurrency,
        jurisdiction: input.jurisdiction,
        createdBy: ctx.user.id,
      } as any);
      const created = await database.select().from(agencyProjects).where(eq(agencyProjects.slug, slug)).limit(1);
      const project = created[0];
      if (project && input.ownerUserId) {
        await database.insert(projectMembers).values({ projectId: project.id, userId: input.ownerUserId, membershipRole: input.ownerRole } as any);
      }
      if (project && input.activateForCreator) {
        await database.update(users).set({ activeProjectId: project.id } as any).where(eq(users.id, ctx.user.id));
      }
      return project ? { ...project, activatedForCreator: Boolean(input.activateForCreator) } : { success: true };
    }),
    updateProjectStatus: adminProcedure.input(z.object({
      projectId: z.number().int().positive(),
      status: z.enum(["actif", "archive"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.update(agencyProjects).set({ status: input.status } as any).where(eq(agencyProjects.id, input.projectId));
      return { success: true };
    }),
    listProjectMembers: adminProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      return database.select({
        id: projectMembers.id,
        projectId: projectMembers.projectId,
        userId: projectMembers.userId,
        membershipRole: projectMembers.membershipRole,
        name: users.name,
        email: users.email,
      }).from(projectMembers).leftJoin(users, eq(projectMembers.userId, users.id)).where(eq(projectMembers.projectId, input.projectId));
    }),
    assignProjectMember: adminProcedure.input(z.object({
      projectId: z.number().int().positive(),
      userId: z.number().int().positive(),
      membershipRole: z.enum(["collaborateur", "superviseur", "admin"]),
    })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const [project, user, existing] = await Promise.all([
        database.select({ id: agencyProjects.id }).from(agencyProjects).where(eq(agencyProjects.id, input.projectId)).limit(1),
        database.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1),
        database.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId))).limit(1),
      ]);
      if (project.length === 0 || user.length === 0) throw new Error("Projet ou compte introuvable");
      if (existing.length > 0) {
        await database.update(projectMembers).set({ membershipRole: input.membershipRole } as any).where(eq(projectMembers.id, existing[0].id));
      } else {
        await database.insert(projectMembers).values(input as any);
      }
      return { success: true };
    }),
    removeProjectMember: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      await database.delete(projectMembers).where(eq(projectMembers.id, input.id));
      return { success: true };
    }),
    resendInvitation: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ input }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const existing = await database.select({ id: users.id, accountStatus: users.accountStatus, email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!existing[0]) throw new Error("Compte introuvable");
      if (existing[0].accountStatus === "active") throw new Error("Ce compte est déjà actif");
      const invitationToken = randomUUID();
      await database.update(users).set({ invitationToken, accountStatus: "invited" } as any).where(eq(users.id, input.userId));
      return { success: true, status: "invited" as const, email: existing[0].email };
    }),
  }),

  preferences: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      let showRevenueDashboard = true;
      if (database && ctx.user.activeProjectId) {
        showRevenueDashboard = await getRevenueVisibility(database, ctx);
      }
      return {
        currency: ctx.user.preferredCurrency,
        showMGAEquivalent: ctx.user.showMGAEquivalent,
        activeProjectId: ctx.user.activeProjectId,
        showRevenueDashboard,
      };
    }),
    update: protectedProcedure.input(z.object({
      currency: z.enum(["EUR", "MGA"]).optional(),
      showMGAEquivalent: z.boolean().optional(),
      activeProjectId: z.number().int().positive().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      if (input.activeProjectId !== undefined) {
        if (input.activeProjectId === null) {
          await database.update(users).set({ activeProjectId: null } as any).where(eq(users.id, ctx.user.id));
        } else {
          const membership = await database.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, input.activeProjectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
          if (ctx.user.role !== "admin" && membership.length === 0) throw new Error("Vous n’êtes pas membre de ce projet");
          await database.update(users).set({ activeProjectId: input.activeProjectId } as any).where(eq(users.id, ctx.user.id));
        }
      }
      const preferenceSet: Record<string, unknown> = {};
      if (input.currency !== undefined) preferenceSet.preferredCurrency = input.currency;
      if (input.showMGAEquivalent !== undefined) preferenceSet.showMGAEquivalent = input.showMGAEquivalent;
      if (Object.keys(preferenceSet).length > 0) await database.update(users).set(preferenceSet as any).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
  }),

  projects: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      if (ctx.user.role === "admin") return database.select().from(agencyProjects).where(eq(agencyProjects.status, "actif"));
      return database.select({ id: agencyProjects.id, name: agencyProjects.name, slug: agencyProjects.slug, description: agencyProjects.description, status: agencyProjects.status, membershipRole: projectMembers.membershipRole }).from(projectMembers).innerJoin(agencyProjects, eq(projectMembers.projectId, agencyProjects.id)).where(and(eq(projectMembers.userId, ctx.user.id), eq(agencyProjects.status, "actif")));
    }),
    setActive: protectedProcedure.input(z.object({ projectId: z.number().int().positive().nullable() })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      if (input.projectId !== null && ctx.user.role !== "admin") {
        const membership = await database.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, ctx.user.id))).limit(1);
        if (membership.length === 0) throw new Error("Projet non accessible");
      }
      await database.update(users).set({ activeProjectId: input.projectId } as any).where(eq(users.id, ctx.user.id));
      return { success: true, activeProjectId: input.projectId };
    }),
    createForTeam: supervisorProcedure.input(z.object({
      name: z.string().trim().min(2),
      slug: z.string().trim().min(2).optional(),
      description: z.string().trim().optional(),
    })).mutation(async ({ input, ctx }) => {
      const database = await db.getDb();
      if (!database) throw new Error("Database unavailable");
      const slug = (input.slug || input.name).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
      const duplicate = await database.select({ id: agencyProjects.id }).from(agencyProjects).where(eq(agencyProjects.slug, slug)).limit(1);
      if (duplicate.length > 0) throw new Error("Un projet existe déjà avec ce slug");
      await database.insert(agencyProjects).values({ name: input.name, slug, description: input.description || null, createdBy: ctx.user.id } as any);
      const created = await database.select().from(agencyProjects).where(eq(agencyProjects.slug, slug)).limit(1);
      if (created[0]) await database.insert(projectMembers).values({ projectId: created[0].id, userId: ctx.user.id, membershipRole: ctx.user.role } as any);
      return created[0] ?? { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
