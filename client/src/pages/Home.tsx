import React, { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { 
  Users, DollarSign, Kanban, Building2, FileText, Ticket, 
  Plus, Search, Download, CheckCircle, Clock, AlertCircle, 
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, FileSpreadsheet, 
  UserPlus, Briefcase, Calendar, ShieldCheck, ExternalLink, RefreshCw, Pencil, ArrowRight, ClipboardCheck, Trash2, ChevronDown, MessageSquarePlus, WalletCards, Settings, UserCog, FolderPlus, Mail, Check, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { DEFAULT_EUR_TO_MGA, convertEurToMga, convertMgaToEur, formatCurrency, formatMGA, type CurrencyCode } from "@shared/currency";
import { buildCommercialDocumentHtml, getCommercialTableColumnCount, type CommercialDocumentData } from "@shared/commercialDocuments";
import { CommercialMGAColumnCell, CommercialMGAColumnHeader } from "@/components/CommercialMGAColumns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PROJECT_TEMPLATES, getProjectTemplate, type ProjectTemplateKey } from "@shared/projectTemplates";
import { PERMISSION_GROUPS, PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey, type RoleKey } from "@shared/permissions";

const WORKDAY_HOURS = 8;

type BillingLine = {
  catalogItemId?: number;
  label: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  currency: CurrencyCode;
  taxRate: string;
  discountType: "none" | "percent" | "fixed";
  discountValue: string;
};

const emptyBillingLine = (currency: CurrencyCode = "EUR"): BillingLine => ({
  label: "",
  description: "",
  quantity: "1",
  unit: "unité",
  unitPrice: "0",
  currency,
  taxRate: "0",
  discountType: "none",
  discountValue: "0",
});

const parseBillingLines = (value: string | undefined, currency: CurrencyCode = "EUR"): BillingLine[] => {
  if (!value) return [emptyBillingLine(currency)];
  try {
    const parsed: unknown = JSON.parse(value);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    const lines = values.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map(item => ({
      catalogItemId: Number.isFinite(Number(item.catalogItemId)) ? Number(item.catalogItemId) : undefined,
      label: String(item.label ?? item.serviceName ?? item.service ?? item.name ?? item.title ?? ""),
      description: String(item.description ?? ""),
      quantity: String(item.quantity ?? item.qty ?? 1),
      unit: String(item.unit ?? "unité"),
      unitPrice: String(item.unitPrice ?? item.price ?? item.amount ?? 0),
      currency: item.currency === "MGA" ? "MGA" as CurrencyCode : currency,
      taxRate: String(item.taxRate ?? 0),
      discountType: (item.discountType === "percent" || item.discountType === "fixed" ? item.discountType : "none") as BillingLine["discountType"],
      discountValue: String(item.discountValue ?? 0),
    }));
    return lines.length > 0 ? lines : [emptyBillingLine(currency)];
  } catch {
    return [{ ...emptyBillingLine(currency), label: value }];
  }
};

const serializeBillingLines = (lines: BillingLine[]) => JSON.stringify(lines.map(line => ({
  catalogItemId: line.catalogItemId,
  label: line.label,
  description: line.description,
  quantity: Number(line.quantity) || 0,
  unit: line.unit,
  unitPrice: Number(line.unitPrice) || 0,
  currency: line.currency,
  taxRate: Number(line.taxRate) || 0,
  discountType: line.discountType,
  discountValue: Number(line.discountValue) || 0,
})));

const calculateBillingTotals = (lines: BillingLine[], discountType: "none" | "percent" | "fixed", discountValue: string, taxRate: string) => {
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);
  const lineDiscount = lines.reduce((sum, line) => {
    const base = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    const value = Math.max(0, Number(line.discountValue) || 0);
    return sum + (line.discountType === "percent" ? base * Math.min(100, value) / 100 : line.discountType === "fixed" ? Math.min(base, value) : 0);
  }, 0);
  const globalValue = Math.max(0, Number(discountValue) || 0);
  const globalDiscount = discountType === "percent" ? subtotal * Math.min(100, globalValue) / 100 : discountType === "fixed" ? Math.min(subtotal, globalValue) : 0;
  const discount = Math.min(subtotal, lineDiscount + globalDiscount);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * Math.max(0, Number(taxRate) || 0) / 100;
  return { subtotal, discount, taxable, tax, total: taxable + tax };
};

const ACCOUNTING_EISENHOWER_QUADRANTS = [
  { key: "important-urgent", title: "À décider maintenant", description: "Montants importants et actions urgentes", className: "border-rose-200 bg-rose-50", badgeClassName: "bg-rose-100 text-rose-800" },
  { key: "important-non-urgent", title: "À planifier", description: "Montants importants à programmer", className: "border-amber-200 bg-amber-50", badgeClassName: "bg-amber-100 text-amber-800" },
  { key: "non-important-urgent", title: "À déléguer / traiter", description: "Actions récentes ou sorties à suivre", className: "border-sky-200 bg-sky-50", badgeClassName: "bg-sky-100 text-sky-800" },
  { key: "non-important-non-urgent", title: "À surveiller", description: "Mouvements faibles ou historiques", className: "border-slate-200 bg-slate-50", badgeClassName: "bg-slate-100 text-slate-700" },
] as const;

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const isCollaborator = user?.role === "collaborateur";
  const canAccessAgencyModules = Boolean(user) && !isCollaborator;
  useEffect(() => {
    if (isCollaborator && activeTab !== "dashboard") setActiveTab("dashboard");
  }, [activeTab, isCollaborator]);
  const openDashboardModule = (tab: string) => {
    if (isCollaborator && tab !== "dashboard") {
      toast.error("Votre espace collaborateur est limité aux demandes RH personnelles.");
      return;
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Requêtes tRPC
  const [selectedTimeEntryAgentId, setSelectedTimeEntryAgentId] = useState<number | null>(null);
  const agentsQuery = trpc.hr.listAgents.useQuery(undefined, { enabled: isAuthenticated });
  const timeEntriesQuery = trpc.hr.listTimeEntries.useQuery(undefined, { enabled: isAuthenticated });
  const agentTimeEntriesQuery = trpc.hr.listTimeEntries.useQuery(selectedTimeEntryAgentId ? { agentId: selectedTimeEntryAgentId } : undefined, { enabled: isAuthenticated && selectedTimeEntryAgentId !== null });
  const leavesQuery = trpc.hr.listLeaves.useQuery(undefined, { enabled: isAuthenticated });
  const advancesQuery = trpc.hr.listSalaryAdvances.useQuery(undefined, { enabled: isAuthenticated });
  const contractsQuery = trpc.hr.listContracts.useQuery(undefined, { enabled: isAuthenticated });
  const ticketsQuery = trpc.hr.listTickets.useQuery(undefined, { enabled: isAuthenticated });
  const permissionsQuery = trpc.permissions.current.useQuery(undefined, { enabled: isAuthenticated });
  const hasPermission = (key: PermissionKey) => Boolean(permissionsQuery.data?.permissions?.includes(key));
  const canManageHrRequests = hasPermission("hr.request.manage");
  const canEditHrRequests = hasPermission("hr.request.edit") || canManageHrRequests;
  const canCancelHrRequests = hasPermission("hr.request.cancel") || canManageHrRequests;
  const canViewTeamHr = hasPermission("hr.team.view") || hasPermission("hr.manage");
  
  const transactionsQuery = trpc.accounting.listTransactions.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const accountingSummary = trpc.accounting.summary.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const revenueReportQuery = trpc.accounting.revenueReport.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const automaticReportQuery = trpc.accounting.automaticReport.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const [reportMonth, setReportMonth] = useState("2026-08");
  const monthlyReportQuery = trpc.accounting.monthlyReport.useQuery({ month: reportMonth }, { enabled: isAuthenticated && canAccessAgencyModules });
  const dynamicStatsQuery = trpc.planning.listDynamicStats.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const statFilterOptionsQuery = trpc.planning.statFilterOptions.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const [accountingStatsView, setAccountingStatsView] = useState<"sheet" | "gantt" | "eisenhower">("sheet");
  const [accountingStatFilters, setAccountingStatFilters] = useState({ monthKey: "", type: "tous" as "tous" | "entrée" | "sortie", category: "" });
  const accountingStatsInput = useMemo(() => ({
    monthKey: accountingStatFilters.monthKey || undefined,
    type: accountingStatFilters.type,
    category: accountingStatFilters.category || undefined,
  }), [accountingStatFilters]);
  const accountingStatisticsQuery = trpc.planning.accountingStatistics.useQuery(accountingStatsInput, { enabled: isAuthenticated && canAccessAgencyModules });
  const [hrStatFilters, setHrStatFilters] = useState({ fromMonth: "2026-08", toMonth: "2026-08", agentId: "all", department: "all" });
  const [hrGroupView, setHrGroupView] = useState<"department" | "agent">("department");
  const hrStatisticsInput = useMemo(() => ({ fromMonth: hrStatFilters.fromMonth || undefined, toMonth: hrStatFilters.toMonth || undefined, agentId: hrStatFilters.agentId === "all" ? undefined : Number(hrStatFilters.agentId), department: hrStatFilters.department === "all" ? undefined : hrStatFilters.department }), [hrStatFilters]);
  const hrStatisticsQuery = trpc.planning.hrStatistics.useQuery(hrStatisticsInput, { enabled: isAuthenticated && canAccessAgencyModules });
  const [caStatFilters, setCaStatFilters] = useState({ fromMonth: "2026-08", toMonth: "2026-08", clientId: "all", serviceName: "all", status: "tous" });
  const [caBreakdown, setCaBreakdown] = useState<"period" | "client" | "service" | "status">("period");
  const caStatisticsInput = useMemo(() => ({ fromMonth: caStatFilters.fromMonth || undefined, toMonth: caStatFilters.toMonth || undefined, clientId: caStatFilters.clientId === "all" ? undefined : Number(caStatFilters.clientId), serviceName: caStatFilters.serviceName === "all" ? undefined : caStatFilters.serviceName, status: caStatFilters.status as "tous" | "encaissée" | "en retard" | "annulée" | "autre" }), [caStatFilters]);
  const caStatisticsQuery = trpc.planning.caStatistics.useQuery(caStatisticsInput, { enabled: isAuthenticated && canAccessAgencyModules });
  const budgetSheetsQuery = trpc.planning.listBudgetSheets.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });

  const getAgentMonthlySummary = (agentId: number) => {
    const monthEntries = (timeEntriesQuery.data || []).filter(entry => entry.agentId === agentId && String(entry.date).slice(0, 7) === reportMonth);
    const workedHours = monthEntries.filter(entry => entry.status === "présent" || entry.status === "retard").reduce((total, entry) => total + Number(entry.hoursWorked), 0);
    const monthLeaves = (leavesQuery.data || []).filter(leave => leave.agentId === agentId && String(leave.startDate).slice(0, 7) === reportMonth);
    const monthAdvances = (advancesQuery.data || []).filter(advance => advance.agentId === agentId && String(advance.requestedDate).slice(0, 7) === reportMonth);
    const agentTickets = (ticketsQuery.data || []).filter(ticket => ticket.agentId === agentId);
    return {
      entries: monthEntries.length,
      workedHours,
      workDays: workedHours / WORKDAY_HOURS,
      absences: monthEntries.filter(entry => entry.status === "absent").length,
      leaveDays: monthLeaves.reduce((total, leave) => total + Number(leave.daysCount), 0),
      advances: monthAdvances.length,
      tickets: agentTickets.length,
    };
  };

  const monthlyWorkedHours = (timeEntriesQuery.data || []).filter(entry => String(entry.date).slice(0, 7) === reportMonth && (entry.status === "présent" || entry.status === "retard")).reduce((total, entry) => total + Number(entry.hoursWorked), 0);
  const monthlyWorkedDays = monthlyWorkedHours / WORKDAY_HOURS;
  
  const leadsQuery = trpc.crm.listLeads.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  
  const clientsQuery = trpc.clientsModule.listClients.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [isClientHistoryOpen, setIsClientHistoryOpen] = useState(false);
  const [isClientEditOpen, setIsClientEditOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const clientHistoryQuery = trpc.clientsModule.clientHistory.useQuery(
    { clientId: selectedClientId || 0 },
    { enabled: isAuthenticated && canAccessAgencyModules && selectedClientId !== null },
  );
  const interactionsQuery = trpc.clientsModule.listInteractions.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const documentsQuery = trpc.clientsModule.listDocuments.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  
  const catalogItemsQuery = trpc.billing.listCatalogItems.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const quotesQuery = trpc.billing.listQuotes.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const invoicesQuery = trpc.billing.listInvoices.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const nextInvoiceNumberQuery = trpc.billing.nextInvoiceNumber.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const nextQuoteNumberQuery = trpc.billing.nextQuoteNumber.useQuery(undefined, { enabled: isAuthenticated && canAccessAgencyModules });
  const activeProjectIdState = useState<number | null>(null);
  const [activeProjectId, setActiveProjectId] = activeProjectIdState;
  const [permissionsRole, setPermissionsRole] = useState<RoleKey>("collaborateur");
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<number | null>(null);
  const [supervisorDepartment, setSupervisorDepartment] = useState("");
  const isAdmin = user?.role === "admin";
  const adminUsersQuery = trpc.admin.listUsers.useQuery(undefined, { enabled: isAuthenticated && isAdmin });
  const adminProjectsQuery = trpc.admin.listProjects.useQuery(undefined, { enabled: isAuthenticated && isAdmin });
  const rolePermissionsQuery = trpc.admin.getRolePermissions.useQuery(undefined, { enabled: isAuthenticated && isAdmin });
  const supervisorTeamsQuery = trpc.admin.listSupervisorTeams.useQuery({ supervisorUserId: selectedSupervisorId ?? undefined, projectId: activeProjectId }, { enabled: isAuthenticated && isAdmin });
  const preferencesQuery = trpc.preferences.get.useQuery(undefined, { enabled: isAuthenticated });
  const projectsQuery = trpc.projects.mine.useQuery(undefined, { enabled: isAuthenticated });
  const providerEnvironmentsQuery = trpc.provider.listClientEnvironments.useQuery(undefined, { enabled: isAuthenticated && isAdmin });
  const [isProviderClientOpen, setIsProviderClientOpen] = useState(false);
  const [providerClientForm, setProviderClientForm] = useState({
    agencyName: "",
    clientContactName: "",
    clientEmail: "",
    managementTemplate: "agence_complete" as ProjectTemplateKey,
    defaultCurrency: "MGA" as CurrencyCode,
    jurisdiction: "fr" as "fr" | "mg",
    assignAsAdmin: true,
  });
  const createProviderClientMutation = trpc.provider.createClientEnvironment.useMutation({
    onSuccess: () => {
      setIsProviderClientOpen(false);
      setProviderClientForm({ agencyName: "", clientContactName: "", clientEmail: "", managementTemplate: "agence_complete", defaultCurrency: "MGA", jurisdiction: "fr", assignAsAdmin: true });
      utils.provider.listClientEnvironments.invalidate();
      utils.admin.listProjects.invalidate();
      toast.success("Environnement client créé et invitation envoyée avec succès !");
    },
    onError: error => toast.error(`Erreur: ${error.message}`),
  });
  const toggleEnvironmentLockMutation = trpc.provider.toggleEnvironmentLock.useMutation({
    onSuccess: () => {
      utils.provider.listClientEnvironments.invalidate();
      utils.admin.listProjects.invalidate();
      toast.success("Confidentialité et verrouillage mis à jour !");
    },
    onError: error => toast.error(`Erreur: ${error.message}`),
  });

  // États pour les modals de création
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isAgentEditOpen, setIsAgentEditOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const [agentFormError, setAgentFormError] = useState("");
  const [agentForm, setAgentForm] = useState({ name: "", email: "", phone: "", position: "", department: "", hireDate: "2026-01-01", salary: "15000000", contractType: "CDI", address: "", emergencyContact: "", notes: "" });
  const [agentEditForm, setAgentEditForm] = useState({ name: "", email: "", phone: "", position: "", department: "", hireDate: "2026-01-01", salary: "15000000", contractType: "CDI", address: "", emergencyContact: "", notes: "" });

  const [isTxOpen, setIsTxOpen] = useState(false);
  const [isTxEditOpen, setIsTxEditOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [isTimeEntryOpen, setIsTimeEntryOpen] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState<number | null>(null);
  const [timeEntryForm, setTimeEntryForm] = useState({ agentId: 0, date: "2026-08-19", hoursWorked: "8", status: "présent" as "présent" | "absent" | "retard" | "congé", notes: "" });
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ agentId: 0, leaveType: "Annuel", startDate: "2026-08-19", endDate: "2026-08-19", daysCount: 1, reason: "" });
  const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ agentId: 0, amount: "2500000", requestedDate: "2026-08-19", deductionMonth: "2026-09", notes: "" });
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ agentId: 0, title: "", description: "", priority: "normale" as "basse" | "normale" | "haute" | "urgente", category: "Demande de congé" });
  const [expandedAgentId, setExpandedAgentId] = useState<number | null>(null);
  const [isLeaveEditOpen, setIsLeaveEditOpen] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<number | null>(null);
  const [leaveEditForm, setLeaveEditForm] = useState({ leaveType: "Annuel", startDate: "2026-08-19", endDate: "2026-08-19", daysCount: 1, reason: "" });
  const [txForm, setTxForm] = useState({ type: "entrée" as "entrée" | "sortie", category: "Vente client", amount: "7500000", currency: "MGA" as CurrencyCode, exchangeRate: String(DEFAULT_EUR_TO_MGA), date: "2026-08-19", paymentMethod: "Virement", reference: "REF-001", description: "Paiement prestation web", internalNote: "" });
  const [invoiceCashConversion, setInvoiceCashConversion] = useState<{ id: number; number: string; totalAmount: string } | null>(null);
  const [invoiceCashCurrency, setInvoiceCashCurrency] = useState<CurrencyCode>("MGA");
  const [invoiceCashRate, setInvoiceCashRate] = useState(String(DEFAULT_EUR_TO_MGA));
  const [invoiceCashPaymentMethod, setInvoiceCashPaymentMethod] = useState("Virement");
  const [statFilters, setStatFilters] = useState({ monthKey: "", clientName: "", agentName: "", serviceName: "" });
  const [isStatOpen, setIsStatOpen] = useState(false);
  const [statForm, setStatForm] = useState({ monthKey: "2026-08", clientName: "", agentName: "", serviceName: "", revenue: "0", expenses: "0", workDays: "0", notes: "" });
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ title: "Budget récurrent", monthKey: "2026-08", currency: "MGA" as CurrencyCode, exchangeRate: String(DEFAULT_EUR_TO_MGA), notes: "" });
  const [budgetItems, setBudgetItems] = useState([{ label: "", category: "", amount: "0", note: "" }]);

  const [isLeadOpen, setIsLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ companyName: "", contactName: "", email: "", phone: "", expectedAmount: "5000.00", priority: "moyenne" as const, status: "nouveau" as const, nextContactDate: "2026-08-25", notes: "" });
  const [isLeadEditOpen, setIsLeadEditOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  const [leadEditForm, setLeadEditForm] = useState({ companyName: "", contactName: "", email: "", phone: "", expectedAmount: "0.00", priority: "moyenne" as "basse" | "moyenne" | "haute" | "urgente", status: "nouveau" as "nouveau" | "contacté" | "proposition" | "negociation" | "gagne" | "perdu", nextContactDate: "", notes: "" });

  const [isClientOpen, setIsClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ companyName: "", contactName: "", email: "", phone: "", address: "", industry: "Conseil", category: "Standard", notes: "" });
  const [clientEditForm, setClientEditForm] = useState({ companyName: "", contactName: "", email: "", phone: "", address: "", industry: "", category: "Standard", notes: "" });

  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<number | null>(null);
  const [catalogForm, setCatalogForm] = useState({ itemType: "prestation" as "produit" | "prestation", label: "", description: "", unit: "unité", unitPrice: "0", currency: "MGA" as CurrencyCode, pricingMode: "ponctuel" as "ponctuel" | "récurrent" | "mensuel", taxRate: "0", clientVisible: true, status: "actif" as "actif" | "inactif" });
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [eurToMgaRate, setEurToMgaRate] = useState(String(DEFAULT_EUR_TO_MGA));
  const [showMGAEquivalent, setShowMGAEquivalent] = useState(true);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<BillingLine[]>([{ ...emptyBillingLine("EUR"), label: "Prestation conseil", quantity: "1", unitPrice: "2400" }]);
  const [quoteLines, setQuoteLines] = useState<BillingLine[]>([{ ...emptyBillingLine("EUR"), label: "Prestation conseil", quantity: "1", unitPrice: "2400" }]);
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "FAC-2026-001", clientId: 1, quoteId: undefined as number | undefined, issueDate: "2026-08-19", dueDate: "2026-09-19", currency: "EUR" as CurrencyCode, documentProfile: "fr" as "fr" | "mg", discountType: "none" as "none" | "percent" | "fixed", discountValue: "0", taxRate: "0", notes: "Merci pour votre confiance", termsAndConditions: "Paiement à 30 jours. Toute prestation commencée est due. Les frais et taxes applicables restent à la charge du client." });
  const [quoteForm, setQuoteForm] = useState({ quoteNumber: "DEV-2026-001", clientId: 1, issueDate: "2026-08-19", validUntil: "2026-09-18", currency: "EUR" as CurrencyCode, documentProfile: "fr" as "fr" | "mg", discountType: "none" as "none" | "percent" | "fixed", discountValue: "0", taxRate: "0", notes: "Merci pour votre demande.", termsAndConditions: "Validité de l’offre : 30 jours. Paiement selon les conditions convenues au devis." });
  const [adminUserForm, setAdminUserForm] = useState({ name: "", email: "", role: "collaborateur" as "collaborateur" | "superviseur" | "admin" });
  const [isAdminProjectOpen, setIsAdminProjectOpen] = useState(false);
  const [adminProjectForm, setAdminProjectForm] = useState({ name: "", slug: "", description: "", managementTemplate: "agence_complete" as ProjectTemplateKey, defaultCurrency: "MGA" as CurrencyCode, jurisdiction: "fr" as "fr" | "mg", ownerUserId: "none", ownerRole: "superviseur" as "collaborateur" | "superviseur" | "admin" });

  const quoteTotals = calculateBillingTotals(quoteLines, quoteForm.discountType, quoteForm.discountValue, quoteForm.taxRate);
  const invoiceTotals = calculateBillingTotals(invoiceLines, invoiceForm.discountType, invoiceForm.discountValue, invoiceForm.taxRate);

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setShowMGAEquivalent(preferencesQuery.data.showMGAEquivalent);
    setActiveProjectId(preferencesQuery.data.activeProjectId ?? null);
    if (preferencesQuery.data.currency !== invoiceForm.currency) {
      const currency = preferencesQuery.data.currency as CurrencyCode;
      setInvoiceForm(current => ({ ...current, currency }));
      setQuoteForm(current => ({ ...current, currency }));
      setInvoiceLines(lines => lines.map(line => ({ ...line, currency })));
      setQuoteLines(lines => lines.map(line => ({ ...line, currency })));
    }
  }, [preferencesQuery.data]);

  const currentEurToMgaRate = Number(eurToMgaRate) > 0 ? Number(eurToMgaRate) : DEFAULT_EUR_TO_MGA;
  const canViewRevenueDashboard = canAccessAgencyModules && preferencesQuery.data?.showRevenueDashboard !== false;
  const toStoredEur = (mgaValue: string) => convertMgaToEur(Number(mgaValue), currentEurToMgaRate).toFixed(2);

  const openAgentEdit = (agent: NonNullable<typeof agentsQuery.data>[number]) => {
    setEditingAgentId(agent.id);
    setAgentEditForm({ name: agent.name, email: agent.email, phone: agent.phone || "", position: agent.position, department: agent.department, hireDate: String(agent.hireDate).slice(0, 10), salary: String(Math.round(convertEurToMga(Number(agent.salary), Number(eurToMgaRate)))), contractType: agent.contractType, address: agent.address || "", emergencyContact: agent.emergencyContact || "", notes: agent.notes || "" });
    setAgentFormError("");
    setIsAgentEditOpen(true);
  };

  const openTransactionEdit = (transaction: NonNullable<typeof transactionsQuery.data>[number]) => {
    const currency = (transaction.currency === "MGA" ? "MGA" : "EUR") as CurrencyCode;
    const amountInCurrency = Number(transaction.amountInCurrency || transaction.amount);
    setEditingTxId(transaction.id);
    setTxForm({ type: transaction.type, category: transaction.category, amount: currency === "MGA" ? String(Math.round(amountInCurrency)) : String(amountInCurrency), currency, exchangeRate: String(transaction.exchangeRate || (currency === "MGA" ? currentEurToMgaRate : 1)), date: String(transaction.date).slice(0, 10), paymentMethod: transaction.paymentMethod, reference: transaction.reference || "", description: transaction.description, internalNote: transaction.internalNote || "" });
    setIsTxEditOpen(true);
  };

  const openTimeEntryEdit = (entry: NonNullable<typeof timeEntriesQuery.data>[number]) => {
    setEditingTimeEntryId(entry.id);
    setSelectedTimeEntryAgentId(entry.agentId);
    setTimeEntryForm({ agentId: entry.agentId, date: String(entry.date).slice(0, 10), hoursWorked: String(entry.hoursWorked), status: entry.status, notes: entry.notes || "" });
    setIsTimeEntryOpen(true);
  };

  const openLeaveEdit = (leave: NonNullable<typeof leavesQuery.data>[number]) => {
    setEditingLeaveId(leave.id);
    setLeaveEditForm({ leaveType: leave.leaveType, startDate: String(leave.startDate).slice(0, 10), endDate: String(leave.endDate).slice(0, 10), daysCount: leave.daysCount, reason: leave.reason || "" });
    setIsLeaveEditOpen(true);
  };

  const openClientEdit = (client: NonNullable<typeof clientsQuery.data>[number]) => {
    setEditingClientId(client.id);
    setClientEditForm({ companyName: client.companyName, contactName: client.contactName, email: client.email, phone: client.phone || "", address: client.address || "", industry: client.industry || "", category: client.category, notes: client.notes || "" });
    setIsClientEditOpen(true);
  };

  const openClientHistory = (clientId: number) => {
    setSelectedClientId(clientId);
    setIsClientHistoryOpen(true);
  };

  const utils = trpc.useUtils();

  const updatePreferencesMutation = trpc.preferences.update.useMutation({
    onSuccess: () => {
      toast.success("Préférences enregistrées.");
      utils.preferences.get.invalidate();
      utils.projects.mine.invalidate();
    },
    onError: (err) => toast.error("Impossible d’enregistrer les préférences : " + err.message),
  });

  const setActiveProjectMutation = trpc.projects.setActive.useMutation({
    onSuccess: data => {
      setActiveProjectId(data.activeProjectId);
      toast.success("Projet actif mis à jour.");
      utils.preferences.get.invalidate();
    },
    onError: (err) => toast.error("Projet inaccessible : " + err.message),
  });

  const createAdminUserMutation = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      toast.success("Compte créé avec le rôle sélectionné.");
      setAdminUserForm({ name: "", email: "", role: "collaborateur" });
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error("Création du compte impossible : " + err.message),
  });
  const updateAdminRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Rôle mis à jour.");
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error("Modification du rôle impossible : " + err.message),
  });
  const resendInvitationMutation = trpc.admin.resendInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation réinitialisée. Le compte sera activé lors de sa première connexion OAuth avec cet email.");
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => toast.error("Impossible de réinitialiser l’invitation : " + err.message),
  });
  const createAdminProjectMutation = trpc.admin.createProject.useMutation({
    onSuccess: (project) => {
      toast.success("Projet créé et activé dans le backoffice.");
      setAdminProjectForm({ name: "", slug: "", description: "", managementTemplate: "agence_complete", defaultCurrency: "MGA", jurisdiction: "fr", ownerUserId: "none", ownerRole: "superviseur" });
      setIsAdminProjectOpen(false);
      if ("id" in project && typeof project.id === "number") setActiveProjectId(project.id);
      utils.admin.listProjects.invalidate();
      utils.projects.mine.invalidate();
      utils.preferences.get.invalidate();
    },
    onError: (err) => toast.error("Création du projet impossible : " + err.message),
  });
  const updateAdminProjectStatusMutation = trpc.admin.updateProjectStatus.useMutation({
    onSuccess: () => {
      toast.success("Statut du projet mis à jour.");
      utils.admin.listProjects.invalidate();
    },
    onError: (err) => toast.error("Modification du projet impossible : " + err.message),
  });
  const updateRolePermissionMutation = trpc.admin.updateRolePermission.useMutation({
    onSuccess: () => {
      toast.success("Permission enregistrée.");
      utils.admin.getRolePermissions.invalidate();
    },
    onError: (err) => toast.error("Permission non enregistrée : " + err.message),
  });
  const assignSupervisorTeamMutation = trpc.admin.assignSupervisorTeam.useMutation({
    onSuccess: () => {
      toast.success("Équipe attribuée au superviseur.");
      setSupervisorDepartment("");
      utils.admin.listSupervisorTeams.invalidate();
    },
    onError: (err) => toast.error("Attribution impossible : " + err.message),
  });
  const removeSupervisorTeamMutation = trpc.admin.removeSupervisorTeam.useMutation({
    onSuccess: () => {
      toast.success("Équipe retirée.");
      utils.admin.listSupervisorTeams.invalidate();
    },
    onError: (err) => toast.error("Suppression impossible : " + err.message),
  });
  const updateRevenueVisibilityMutation = trpc.admin.updateRevenueVisibility.useMutation({
    onSuccess: () => {
      toast.success("Visibilité du CA mise à jour.");
      utils.admin.listProjects.invalidate();
      utils.preferences.get.invalidate();
      utils.accounting.summary.invalidate();
      utils.accounting.revenueReport.invalidate();
      utils.accounting.automaticReport.invalidate();
    },
    onError: (err) => toast.error("Visibilité du CA non modifiée : " + err.message),
  });

  const updateAgentMutation = trpc.hr.updateAgent.useMutation({
    onSuccess: () => {
      toast.success("Fiche employé mise à jour.");
      setIsAgentEditOpen(false);
      setEditingAgentId(null);
      utils.hr.listAgents.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de modifier l’employé : " + err.message),
  });

  const deleteAgentMutation = trpc.hr.deleteAgent.useMutation({
    onSuccess: () => {
      toast.success("Employé supprimé.");
      utils.hr.listAgents.invalidate();
      utils.hr.listTimeEntries.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de supprimer l’employé : " + err.message),
  });

  const createAgentMutation = trpc.hr.createAgent.useMutation({
    onSuccess: () => {
      toast.success("Employé enregistré avec succès !");
      setAgentFormError("");
      setIsAgentOpen(false);
      utils.hr.listAgents.invalidate();
    },
    onError: (err) => {
      const message = err.message || "Impossible d’enregistrer cet employé.";
      setAgentFormError(message);
      toast.error(message);
    }
  });

  const handleCreateAgent = () => {
    const payload = {
      ...agentForm,
      name: agentForm.name.trim(),
      email: agentForm.email.trim(),
      phone: agentForm.phone.trim(),
      position: agentForm.position.trim(),
      department: agentForm.department.trim(),
      salary: toStoredEur(agentForm.salary.trim()),
      address: agentForm.address.trim(),
      emergencyContact: agentForm.emergencyContact.trim(),
      notes: agentForm.notes.trim(),
    };
    if (!payload.name || !payload.email || !payload.position || !payload.department || !payload.hireDate || !payload.salary) {
      setAgentFormError("Renseignez le nom, l’email, le poste, le département, la date d’embauche et le salaire.");
      toast.error("Informations obligatoires manquantes");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
      setAgentFormError("Saisissez une adresse email professionnelle valide.");
      toast.error("Email invalide");
      return;
    }
    if (!Number.isFinite(Number(payload.salary)) || Number(payload.salary) < 0) {
      setAgentFormError("Le salaire doit être un montant positif.");
      toast.error("Salaire invalide");
      return;
    }
    setAgentFormError("");
    createAgentMutation.mutate(payload);
  };

  const createTimeEntryMutation = trpc.hr.createTimeEntry.useMutation({
    onSuccess: () => {
      toast.success("Pointage enregistré dans la feuille de l’agent.");
      setIsTimeEntryOpen(false);
      setEditingTimeEntryId(null);
      utils.hr.listTimeEntries.invalidate();
      if (selectedTimeEntryAgentId) {
        utils.hr.listTimeEntries.invalidate({ agentId: selectedTimeEntryAgentId });
      }
    },
    onError: (err) => toast.error("Erreur de pointage : " + err.message),
  });

  const updateTimeEntryMutation = trpc.hr.updateTimeEntry.useMutation({
    onSuccess: () => {
      toast.success("Pointage corrigé.");
      setIsTimeEntryOpen(false);
      setEditingTimeEntryId(null);
      utils.hr.listTimeEntries.invalidate();
      if (selectedTimeEntryAgentId) utils.hr.listTimeEntries.invalidate({ agentId: selectedTimeEntryAgentId });
    },
    onError: (err) => toast.error("Impossible de corriger le pointage : " + err.message),
  });

  const deleteTimeEntryMutation = trpc.hr.deleteTimeEntry.useMutation({
    onSuccess: () => {
      toast.success("Pointage supprimé.");
      utils.hr.listTimeEntries.invalidate();
      if (selectedTimeEntryAgentId) utils.hr.listTimeEntries.invalidate({ agentId: selectedTimeEntryAgentId });
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de supprimer le pointage : " + err.message),
  });

  const createTicketMutation = trpc.hr.createTicket.useMutation({
    onSuccess: (data, variables) => {
      if ((variables as any).__fromLeave) {
        // Silencieux ou toast combiné
      } else {
        toast.success("Ticket de demande créé dans le suivi RH.");
        setIsTicketOpen(false);
      }
      utils.hr.listTickets.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de créer le ticket : " + err.message),
  });

  const createLeaveMutation = trpc.hr.createLeave.useMutation({
    onSuccess: () => {
      toast.success("Demande de congé enregistrée et ticket associé créé !");
      setIsLeaveOpen(false);
      utils.hr.listLeaves.invalidate();
      utils.hr.listTickets.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible d’enregistrer le congé : " + err.message),
  });

  const createAdvanceMutation = trpc.hr.createSalaryAdvance.useMutation({
    onSuccess: () => {
      toast.success("Demande d’avance enregistrée.");
      setIsAdvanceOpen(false);
      utils.hr.listSalaryAdvances.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible d’enregistrer l’avance : " + err.message),
  });

  const convertAdvanceToTransactionMutation = trpc.accounting.convertAdvanceToTransaction.useMutation({
    onSuccess: (result) => {
      toast.success(`Avance enregistrée en sortie de caisse (${result.currency}).`);
      utils.hr.listSalaryAdvances.invalidate();
      utils.accounting.listTransactions.invalidate();
      utils.accounting.summary.invalidate();
      utils.accounting.revenueReport.invalidate();
      utils.accounting.automaticReport.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Conversion de l’avance impossible : " + err.message),
  });

  const updateLeaveMutation = trpc.hr.updateLeave.useMutation({
    onSuccess: () => {
      toast.success("Demande de congé corrigée.");
      setIsLeaveEditOpen(false);
      setEditingLeaveId(null);
      utils.hr.listLeaves.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de corriger le congé : " + err.message),
  });

  const deleteLeaveMutation = trpc.hr.deleteLeave.useMutation({
    onSuccess: () => {
      toast.success("Demande de congé supprimée.");
      utils.hr.listLeaves.invalidate();
      utils.hr.listTickets.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de supprimer le congé : " + err.message),
  });

  const cancelLeaveMutation = trpc.hr.cancelLeave.useMutation({
    onSuccess: () => {
      toast.success("Demande de congé annulée.");
      utils.hr.listLeaves.invalidate();
      utils.hr.listTickets.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible d’annuler le congé : " + err.message),
  });

  const updateTicketStatusMutation = trpc.hr.updateTicketStatus.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(variables.status === "résolu" ? "Demande validée et synchronisée avec le dossier agent." : variables.status === "fermé" ? "Demande refusée et ticket clôturé." : "Statut du ticket mis à jour.");
      utils.hr.listTickets.invalidate();
      utils.hr.listLeaves.invalidate();
      utils.hr.listSalaryAdvances.invalidate();
      utils.hr.listAgents.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de traiter la demande : " + err.message),
  });

  const updateTxMutation = trpc.accounting.updateTransaction.useMutation({
    onSuccess: () => {
      toast.success("Mouvement comptable corrigé.");
      setIsTxEditOpen(false);
      setEditingTxId(null);
      utils.accounting.listTransactions.invalidate();
      utils.accounting.summary.invalidate();
      utils.accounting.revenueReport.invalidate();
      utils.accounting.automaticReport.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de corriger le mouvement : " + err.message),
  });

  const createTxMutation = trpc.accounting.createTransaction.useMutation({
    onSuccess: () => {
      toast.success("Mouvement de caisse enregistré !");
      setIsTxOpen(false);
      utils.accounting.listTransactions.invalidate();
      utils.accounting.summary.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

  const createLeadMutation = trpc.crm.createLead.useMutation({
    onSuccess: () => {
      toast.success("Lead ajouté au Kanban CRM !");
      setIsLeadOpen(false);
      utils.crm.listLeads.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

  const updateLeadStatusMutation = trpc.crm.updateLeadStatus.useMutation({
    onSuccess: () => {
      toast.success("Lead déplacé dans le pipeline.");
      utils.crm.listLeads.invalidate();
    },
    onError: (err) => toast.error("Impossible de déplacer le lead : " + err.message),
  });

  const updateLeadMutation = trpc.crm.updateLead.useMutation({
    onSuccess: () => {
      toast.success("Informations et notes du lead mises à jour.");
      setIsLeadEditOpen(false);
      setEditingLeadId(null);
      utils.crm.listLeads.invalidate();
    },
    onError: (err) => toast.error("Impossible de modifier le lead : " + err.message),
  });

  const convertLeadMutation = trpc.crm.convertLeadToClient.useMutation({
    onSuccess: () => {
      toast.success("Lead converti en client avec succès !");
      utils.crm.listLeads.invalidate();
      utils.clientsModule.listClients.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

  const createClientMutation = trpc.clientsModule.createClient.useMutation({
    onSuccess: () => {
      toast.success("Client ajouté à la base !");
      setIsClientOpen(false);
      utils.clientsModule.listClients.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

  const updateClientMutation = trpc.clientsModule.updateClient.useMutation({
    onSuccess: () => {
      toast.success("Informations client mises à jour.");
      setIsClientEditOpen(false);
      setEditingClientId(null);
      utils.clientsModule.listClients.invalidate();
    },
    onError: (err) => toast.error("Modification client impossible : " + err.message),
  });

  const createCatalogItemMutation = trpc.billing.createCatalogItem.useMutation({
    onSuccess: () => {
      toast.success(editingCatalogId ? "Élément du catalogue mis à jour." : "Élément ajouté au catalogue.");
      setIsCatalogOpen(false);
      setEditingCatalogId(null);
      utils.billing.listCatalogItems.invalidate();
    },
    onError: (err) => toast.error("Catalogue : " + err.message),
  });

  const updateCatalogItemMutation = trpc.billing.updateCatalogItem.useMutation({
    onSuccess: () => {
      toast.success("Élément du catalogue mis à jour.");
      setIsCatalogOpen(false);
      setEditingCatalogId(null);
      utils.billing.listCatalogItems.invalidate();
    },
    onError: (err) => toast.error("Catalogue : " + err.message),
  });

  const archiveCatalogItemMutation = trpc.billing.archiveCatalogItem.useMutation({
    onSuccess: () => {
      toast.success("Élément archivé.");
      utils.billing.listCatalogItems.invalidate();
    },
    onError: (err) => toast.error("Catalogue : " + err.message),
  });

  const createQuoteMutation = trpc.billing.createQuote.useMutation({
    onSuccess: () => {
      toast.success("Devis créé avec succès !");
      setIsQuoteOpen(false);
      utils.billing.listQuotes.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

  const convertQuoteMutation = trpc.accounting.convertQuoteToTransaction.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.quoteNumber} a été ajouté à la comptabilité en ${result.currency}.`);
      utils.billing.listQuotes.invalidate();
      utils.accounting.listTransactions.invalidate();
      utils.accounting.summary.invalidate();
      utils.accounting.revenueReport.invalidate();
      utils.accounting.automaticReport.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Conversion impossible : " + err.message)
  });

  const convertPaidInvoiceMutation = trpc.accounting.convertPaidInvoiceToTransaction.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.invoiceNumber} a été ajouté à la caisse en ${result.currency}.`);
      setInvoiceCashConversion(null);
      utils.accounting.listTransactions.invalidate();
      utils.accounting.summary.invalidate();
      utils.accounting.revenueReport.invalidate();
      utils.accounting.automaticReport.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Conversion de la facture impossible : " + err.message)
  });

  const createInvoiceMutation = trpc.billing.createInvoice.useMutation({
    onSuccess: () => {
      toast.success("Facture générée avec style !");
      setIsInvoiceOpen(false);
      utils.billing.listInvoices.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

  const updateInvoiceDraftMutation = trpc.billing.updateInvoiceDraft.useMutation({
    onSuccess: () => {
      toast.success("Facture brouillon mise à jour !");
      setIsInvoiceOpen(false);
      setEditingInvoiceId(null);
      utils.billing.listInvoices.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

  const confirmQuoteDraftMutation = trpc.billing.confirmQuoteDraft.useMutation({
    onSuccess: () => { toast.success("Devis confirmé et marqué comme envoyé."); utils.billing.listQuotes.invalidate(); },
    onError: (err) => toast.error("Confirmation du devis impossible : " + err.message),
  });
  const cancelQuoteDraftMutation = trpc.billing.cancelQuoteDraft.useMutation({
    onSuccess: () => { toast.success("Devis annulé."); utils.billing.listQuotes.invalidate(); },
    onError: (err) => toast.error("Annulation du devis impossible : " + err.message),
  });
  const confirmInvoiceDraftMutation = trpc.billing.confirmInvoiceDraft.useMutation({
    onSuccess: () => { toast.success("Facture confirmée et émise."); utils.billing.listInvoices.invalidate(); },
    onError: (err) => toast.error("Confirmation de la facture impossible : " + err.message),
  });
  const cancelInvoiceDraftMutation = trpc.billing.cancelInvoiceDraft.useMutation({
    onSuccess: () => { toast.success("Facture annulée."); utils.billing.listInvoices.invalidate(); },
    onError: (err) => toast.error("Annulation de la facture impossible : " + err.message),
  });

  const createDynamicStatMutation = trpc.planning.createDynamicStat.useMutation({
    onSuccess: () => {
      toast.success("Ligne statistique mensuelle enregistrée.");
      setIsStatOpen(false);
      utils.planning.listDynamicStats.invalidate();
      utils.planning.statFilterOptions.invalidate();
    },
    onError: (err) => toast.error("Impossible d’enregistrer la statistique : " + err.message),
  });

  const deleteDynamicStatMutation = trpc.planning.deleteDynamicStat.useMutation({
    onSuccess: () => {
      toast.success("Ligne statistique supprimée.");
      utils.planning.listDynamicStats.invalidate();
      utils.planning.statFilterOptions.invalidate();
    },
    onError: (err) => toast.error("Impossible de supprimer la statistique : " + err.message),
  });

  const createBudgetSheetMutation = trpc.planning.createBudgetSheet.useMutation({
    onSuccess: () => {
      toast.success("Feuille budgétaire enregistrée.");
      setIsBudgetOpen(false);
      utils.planning.listBudgetSheets.invalidate();
    },
    onError: (err) => toast.error("Impossible d’enregistrer le budget : " + err.message),
  });

  const deleteBudgetSheetMutation = trpc.planning.deleteBudgetSheet.useMutation({
    onSuccess: () => {
      toast.success("Feuille budgétaire supprimée.");
      utils.planning.listBudgetSheets.invalidate();
    },
    onError: (err) => toast.error("Impossible de supprimer la feuille : " + err.message),
  });

  const convertBudgetSheetMutation = trpc.planning.convertBudgetSheetToTransaction.useMutation({
    onSuccess: (result) => {
      toast.success(`Budget converti en sortie de caisse (${result.currency}).`);
      utils.planning.listBudgetSheets.invalidate();
      utils.accounting.listTransactions.invalidate();
      utils.accounting.summary.invalidate();
      utils.accounting.revenueReport.invalidate();
      utils.accounting.automaticReport.invalidate();
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Conversion du budget impossible : " + err.message),
  });

  const handleUpdateAgent = () => {
    if (!editingAgentId) return;
    updateAgentMutation.mutate({ id: editingAgentId, ...agentEditForm, name: agentEditForm.name.trim(), email: agentEditForm.email.trim(), phone: agentEditForm.phone.trim(), position: agentEditForm.position.trim(), department: agentEditForm.department.trim(), salary: toStoredEur(agentEditForm.salary.trim()), address: agentEditForm.address.trim(), emergencyContact: agentEditForm.emergencyContact.trim(), notes: agentEditForm.notes.trim() });
  };

  const handleDeleteAgent = (agent: { id: number; name: string }) => {
    if (window.confirm(`Supprimer définitivement la fiche de ${agent.name} ? Les pointages et éléments liés restent conservés séparément.`)) {
      deleteAgentMutation.mutate({ id: agent.id });
    }
  };

  const handleCreateTransaction = () => {
    if (!Number.isFinite(Number(txForm.amount)) || Number(txForm.amount) <= 0) {
      toast.error(`Indiquez un montant comptable positif en ${txForm.currency}.`);
      return;
    }
    if (txForm.currency === "MGA" && (!Number.isFinite(Number(txForm.exchangeRate)) || Number(txForm.exchangeRate) <= 0)) {
      toast.error("Indiquez un taux EUR/MGA positif pour ce mouvement.");
      return;
    }
    createTxMutation.mutate({ ...txForm, amount: txForm.amount.trim(), reference: txForm.reference.trim(), description: txForm.description.trim(), internalNote: txForm.internalNote.trim() });
  };

  const handleUpdateTransaction = () => {
    if (!editingTxId) return;
    if (txForm.currency === "MGA" && (!Number.isFinite(Number(txForm.exchangeRate)) || Number(txForm.exchangeRate) <= 0)) {
      toast.error("Indiquez un taux EUR/MGA positif pour ce mouvement.");
      return;
    }
    updateTxMutation.mutate({ id: editingTxId, ...txForm, amount: txForm.amount.trim(), reference: txForm.reference.trim(), internalNote: txForm.internalNote.trim() });
  };

  const handleSaveTimeEntry = () => {
    if (!timeEntryForm.agentId) {
      toast.error("Sélectionnez un agent pour ce pointage.");
      return;
    }
    const payload = { date: timeEntryForm.date, hoursWorked: timeEntryForm.hoursWorked.trim(), status: timeEntryForm.status, notes: timeEntryForm.notes.trim() };
    if (editingTimeEntryId) {
      updateTimeEntryMutation.mutate({ id: editingTimeEntryId, ...payload });
    } else {
      createTimeEntryMutation.mutate({ agentId: timeEntryForm.agentId, ...payload });
    }
  };

  const handleDeleteTimeEntry = (entry: { id: number; date: unknown }) => {
    if (window.confirm(`Supprimer le pointage du ${String(entry.date).slice(0, 10)} ?`)) {
      deleteTimeEntryMutation.mutate({ id: entry.id });
    }
  };

  const handleCreateLeave = () => {
    if (!leaveForm.agentId) {
      toast.error("Sélectionnez un agent pour cette demande de congé.");
      return;
    }
    if (leaveForm.daysCount < 1 || leaveForm.startDate > leaveForm.endDate) {
      toast.error("Vérifiez les dates et le nombre de jours de congé.");
      return;
    }
    createLeaveMutation.mutate({ ...leaveForm, leaveType: leaveForm.leaveType.trim(), reason: leaveForm.reason.trim() });
  };

  const handleCreateAdvance = () => {
    if (!advanceForm.agentId || !Number.isFinite(Number(advanceForm.amount)) || Number(advanceForm.amount) <= 0) {
      toast.error("Sélectionnez un agent et indiquez un montant d’avance positif.");
      return;
    }
    createAdvanceMutation.mutate({ ...advanceForm, amount: toStoredEur(advanceForm.amount.trim()), notes: advanceForm.notes.trim() });
  };

  const handleConvertAdvanceToTransaction = (advance: { id: number; status: string; amount: unknown; agentId: number }) => {
    if (advance.status !== "accordé") {
      toast.error("L’avance doit d’abord être accordée par le superviseur.");
      return;
    }
    const agentName = agentsQuery.data?.find(agent => agent.id === advance.agentId)?.name || `Agent #${advance.agentId}`;
    if (window.confirm(`Enregistrer l’avance de ${agentName} (${formatMGA(Number(advance.amount), currentEurToMgaRate)}) comme sortie de caisse ? Cette action marquera l’avance comme déduite.`)) {
      convertAdvanceToTransactionMutation.mutate({ advanceId: advance.id, currency: "MGA", exchangeRate: String(currentEurToMgaRate), paymentMethod: "Virement / Décaissement" });
    }
  };

  const handleCreateTicket = () => {
    if (!ticketForm.agentId || !ticketForm.title.trim() || !ticketForm.description.trim()) {
      toast.error("Sélectionnez un agent et renseignez le titre et la description de la demande.");
      return;
    }
    createTicketMutation.mutate({ ...ticketForm, title: ticketForm.title.trim(), description: ticketForm.description.trim() });
  };

  const handleUpdateLeave = () => {
    if (!editingLeaveId) return;
    updateLeaveMutation.mutate({ id: editingLeaveId, ...leaveEditForm, reason: leaveEditForm.reason.trim() });
  };

  const handleDeleteLeave = (leave: { id: number; leaveType: string }) => {
    if (window.confirm(`Supprimer cette demande de congé (${leave.leaveType}) ?`)) {
      deleteLeaveMutation.mutate({ id: leave.id });
    }
  };

  const handleCancelLeave = (leave: { id: number; leaveType: string }) => {
    if (window.confirm(`Annuler la demande de congé « ${leave.leaveType} » ?`)) {
      cancelLeaveMutation.mutate({ id: leave.id });
    }
  };

  const handleProcessTicket = (ticket: { id: number; status: string }, status: "résolu" | "fermé") => {
    updateTicketStatusMutation.mutate({ id: ticket.id, status });
  };

  const handleSaveDynamicStat = () => {
    if (!statForm.monthKey || !statForm.clientName.trim() || !statForm.agentName.trim() || !statForm.serviceName.trim()) {
      toast.error("Renseignez le mois, le client, l’agent et le service.");
      return;
    }
    createDynamicStatMutation.mutate({
      ...statForm,
      clientName: statForm.clientName.trim(),
      agentName: statForm.agentName.trim(),
      serviceName: statForm.serviceName.trim(),
      revenue: statForm.revenue.trim(),
      expenses: statForm.expenses.trim(),
      workDays: statForm.workDays.trim(),
      notes: statForm.notes.trim(),
    });
  };

  const updateBudgetItem = (index: number, key: "label" | "category" | "amount" | "note", value: string) => {
    setBudgetItems((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const handleSaveBudgetSheet = () => {
    const validItems = budgetItems.filter((item) => item.label.trim() && item.category.trim() && Number.isFinite(Number(item.amount)) && Number(item.amount) >= 0);
    if (!budgetForm.title.trim() || !budgetForm.monthKey || validItems.length === 0) {
      toast.error("Renseignez le titre, le mois et au moins une dépense complète.");
      return;
    }
    if (budgetForm.currency === "MGA" && (!Number.isFinite(Number(budgetForm.exchangeRate)) || Number(budgetForm.exchangeRate) <= 0)) {
      toast.error("Indiquez un taux EUR/MGA positif pour le budget.");
      return;
    }
    createBudgetSheetMutation.mutate({ ...budgetForm, title: budgetForm.title.trim(), notes: budgetForm.notes.trim(), items: validItems });
  };

  const filteredDynamicStats = (dynamicStatsQuery.data || []).filter((row) => {
    if (statFilters.monthKey && row.monthKey !== statFilters.monthKey) return false;
    if (statFilters.clientName && row.clientName !== statFilters.clientName) return false;
    if (statFilters.agentName && row.agentName !== statFilters.agentName) return false;
    if (statFilters.serviceName && row.serviceName !== statFilters.serviceName) return false;
    return true;
  });
  const dynamicStatsTotals = filteredDynamicStats.reduce((totals, row) => ({
    revenue: totals.revenue + Number(row.revenue),
    expenses: totals.expenses + Number(row.expenses),
    workDays: totals.workDays + Number(row.workDays),
  }), { revenue: 0, expenses: 0, workDays: 0 });
  const parseBudgetItems = (itemsJson: string) => {
    try { return JSON.parse(itemsJson) as Array<{ label: string; category: string; amount: string; note?: string }>; } catch { return []; }
  };
  const accountingMonthOptions = useMemo(() => Array.from(new Set((transactionsQuery.data || []).map((transaction) => String(transaction.date).slice(0, 7)))).filter(Boolean).sort().reverse(), [transactionsQuery.data]);

  // Export CSV Comptabilité
  const exportAccountingCSV = () => {
    const txs = transactionsQuery.data || [];
    let csv = "ID,Type,Categorie,Devise,MontantSaisi,MontantEURReference,MontantMGAEquivalent,TauxEURMGA,Date,ModePaiement,Reference,Description\n";
    txs.forEach(t => {
      const currency = t.currency === "MGA" ? "MGA" : "EUR";
      const amountInCurrency = Number(t.amountInCurrency || t.amount);
      const exchangeRate = Number(t.exchangeRate || (currency === "MGA" ? currentEurToMgaRate : 1));
      const amountMga = currency === "MGA" ? amountInCurrency : Math.round(convertEurToMga(Number(t.amount), currentEurToMgaRate));
      csv += `${t.id},${t.type},"${t.category}",${currency},${amountInCurrency.toFixed(2)},${Number(t.amount).toFixed(2)},${amountMga},${exchangeRate.toFixed(2)},${t.date},${t.paymentMethod},"${t.reference || ''}","${t.description.replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `comptabilite_agence_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export CSV comptable téléchargé !");
  };

  const exportAccountingExcel = () => {
    const workbook = XLSX.utils.book_new();
    const appendSheet = (name: string, rows: Array<Record<string, unknown>>) => {
      const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Information: "Aucune donnée" }]);
      XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
    };
    appendSheet("Mouvements", (transactionsQuery.data || []).map(tx => { const currency = tx.currency === "MGA" ? "MGA" : "EUR"; const amountInCurrency = Number(tx.amountInCurrency || tx.amount); const exchangeRate = Number(tx.exchangeRate || (currency === "MGA" ? currentEurToMgaRate : 1)); return { ID: tx.id, Type: tx.type, Catégorie: tx.category, Devise: currency, MontantSaisi: amountInCurrency, MontantEURReference: Number(tx.amount), MontantMGAEquivalent: currency === "MGA" ? amountInCurrency : convertEurToMga(Number(tx.amount), currentEurToMgaRate), TauxEURMGA: exchangeRate, Date: String(tx.date), Mode: tx.paymentMethod, Référence: tx.reference || "", Description: tx.description, NoteInterne: tx.internalNote || "" }; }));
    appendSheet("Agents RH", (agentsQuery.data || []).map(agent => ({ ID: agent.id, Nom: agent.name, Email: agent.email, Téléphone: agent.phone || "", Poste: agent.position, Département: agent.department, Embauche: String(agent.hireDate), SalaireEUR: Number(agent.salary), SalaireMGA: convertEurToMga(Number(agent.salary), currentEurToMgaRate), Contrat: agent.contractType, Statut: agent.status, Adresse: agent.address || "", ContactUrgence: agent.emergencyContact || "", Notes: agent.notes || "" })));
    appendSheet("Pointages", (timeEntriesQuery.data || []).map(entry => ({ ID: entry.id, AgentID: entry.agentId, Date: String(entry.date), Heures: Number(entry.hoursWorked), Statut: entry.status, Notes: entry.notes || "" })));
    appendSheet("Congés", (leavesQuery.data || []).map(leave => ({ ID: leave.id, AgentID: leave.agentId, Type: leave.leaveType, Début: String(leave.startDate), Fin: String(leave.endDate), Jours: leave.daysCount, Statut: leave.status, Motif: leave.reason || "" })));
    appendSheet("Avances salaire", (advancesQuery.data || []).map(advance => ({ ID: advance.id, AgentID: advance.agentId, MontantEUR: Number(advance.amount), MontantMGA: convertEurToMga(Number(advance.amount), currentEurToMgaRate), DateDemande: String(advance.requestedDate), Statut: advance.status, MoisDéduction: advance.deductionMonth, Notes: advance.notes || "" })));
    appendSheet("Contrats", (contractsQuery.data || []).map(contract => ({ ID: contract.id, AgentID: contract.agentId, Titre: contract.title, Type: contract.contractType, Début: String(contract.startDate), Fin: contract.endDate ? String(contract.endDate) : "", Statut: contract.status, URLDocument: contract.documentUrl || "", CléDocument: contract.documentKey || "" })));
    appendSheet("Tickets", (ticketsQuery.data || []).map(ticket => ({ ID: ticket.id, Titre: ticket.title, AgentID: ticket.agentId || "", ClientID: ticket.clientId || "", Priorité: ticket.priority, Statut: ticket.status, Catégorie: ticket.category, Description: ticket.description })));
    appendSheet("Leads CRM", (leadsQuery.data || []).map(lead => ({ ID: lead.id, Entreprise: lead.companyName, Contact: lead.contactName, Email: lead.email, Téléphone: lead.phone || "", MontantAttenduEUR: Number(lead.expectedAmount), Priorité: lead.priority, Statut: lead.status, ProchainContact: lead.nextContactDate ? String(lead.nextContactDate) : "", Notes: lead.notes || "" })));
    appendSheet("Clients", (clientsQuery.data || []).map(client => ({ ID: client.id, Entreprise: client.companyName, Contact: client.contactName, Email: client.email, Téléphone: client.phone || "", Adresse: client.address || "", Catégorie: client.category, Secteur: client.industry || "", Statut: client.status, Notes: client.notes || "" })));
    appendSheet("Interactions clients", (interactionsQuery.data || []).map(interaction => ({ ID: interaction.id, ClientID: interaction.clientId, Type: interaction.type, Résumé: interaction.summary, Date: String(interaction.date), Agent: interaction.agentName || "" })));
    appendSheet("Documents", (documentsQuery.data || []).map(document => ({ ID: document.id, Titre: document.title, Catégorie: document.category, EntitéID: document.entityId || "", URL: document.fileUrl, CléS3: document.fileKey, Taille: document.fileSize || "", CrééLe: String(document.createdAt) })));
    appendSheet("Devis", (quotesQuery.data || []).map(quote => ({ Numéro: quote.quoteNumber, ClientID: quote.clientId, Date: String(quote.issueDate), ValideJusquAu: String(quote.validUntil), MontantEUR: Number(quote.totalAmount), Statut: quote.status, Notes: quote.notes || "", CGV: quote.termsAndConditions || "" })));
    appendSheet("Factures", (invoicesQuery.data || []).map(invoice => ({ Numéro: invoice.invoiceNumber, ClientID: invoice.clientId, DevisID: invoice.quoteId || "", Date: String(invoice.issueDate), Échéance: String(invoice.dueDate), MontantEUR: Number(invoice.totalAmount), Statut: invoice.status, Notes: invoice.notes || "", CGV: invoice.termsAndConditions || "" })));
    const report = monthlyReportQuery.data;
    if (report) {
      appendSheet("Reporting mensuel", [
        { Section: "RH", Période: report.monthLabel, NouveauxAgents: report.sections.rh.newAgents, Pointages: report.sections.rh.timeEntries, Congés: report.sections.rh.leaveRequests, Avances: report.sections.rh.advances, Contrats: report.sections.rh.contracts, TicketsOuverts: report.sections.rh.openTickets },
        { Section: "Comptabilité", Période: report.monthLabel, Mouvements: report.sections.accounting.transactions, EncaisséEUR: report.sections.accounting.collected, EncaisséMGA: convertEurToMga(report.sections.accounting.collected, currentEurToMgaRate), DépensesEUR: report.sections.accounting.expenses, DépensesMGA: convertEurToMga(report.sections.accounting.expenses, currentEurToMgaRate), SoldeEUR: report.sections.accounting.balance, SoldeMGA: convertEurToMga(report.sections.accounting.balance, currentEurToMgaRate), FacturéEUR: report.sections.accounting.invoiced, FacturéMGA: convertEurToMga(report.sections.accounting.invoiced, currentEurToMgaRate), PayéEUR: report.sections.accounting.paid, PayéMGA: convertEurToMga(report.sections.accounting.paid, currentEurToMgaRate) },
        { Section: "CRM", Période: report.monthLabel, NouveauxLeads: report.sections.crm.newLeads, PipelineEUR: report.sections.crm.pipeline, Gagnés: report.sections.crm.won, Relances: report.sections.crm.followUps },
        { Section: "Clients", Période: report.monthLabel, NouveauxClients: report.sections.clients.newClients, Interactions: report.sections.clients.interactions, Documents: report.sections.clients.documents },
        { Section: "Facturation", Période: report.monthLabel, Devis: report.sections.billing.quotes, Factures: report.sections.billing.invoices, FacturéEUR: report.sections.billing.invoiced, PayéEUR: report.sections.billing.paid, EnRetard: report.sections.billing.overdue },
      ]);
    }
    XLSX.writeFile(workbook, `backup_agency_manager_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Backup Excel complet téléchargé.");
  };

  const downloadCommercialDocument = (kind: "facture" | "devis", documentData: CommercialDocumentData) => {
    const html = buildCommercialDocumentHtml(kind, documentData, Number(eurToMgaRate) || 0, showMGAEquivalent);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind}-${documentData.number}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`${kind === "facture" ? "Facture" : "Devis"} téléchargé(e) !`);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(251,191,36,0.28),_transparent_32%),linear-gradient(135deg,#075985_0%,#0f766e_48%,#c2410c_100%)] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/95 text-foreground border border-white/70 p-8 rounded-[2rem] shadow-2xl shadow-sky-950/25 backdrop-blur-xl text-center space-y-6">
          <div className="relative inline-flex p-4 bg-gradient-to-br from-sky-400 to-teal-500 text-white rounded-[1.5rem] shadow-lg shadow-sky-500/25">
            <Briefcase className="w-10 h-10" />
            <span className="absolute -right-2 -top-2 text-xl" aria-hidden="true">✦</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-600">Bienvenue à bord</p>
            <h1 className="text-3xl font-black tracking-tight med-gradient-header">AgencyManager Pro</h1>
            <p className="text-muted-foreground text-sm leading-6">
              Votre cockpit doux et solaire pour gérer RH, comptabilité, CRM, clients et facturation.
            </p>
          </div>
          <Button onClick={() => startLogin()} className="w-full bg-gradient-to-r from-sky-500 via-teal-500 to-orange-400 hover:brightness-105 text-white font-bold py-3 rounded-2xl shadow-lg shadow-sky-500/20 transition-all active:scale-[0.98]">
            Connexion sécurisée <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,_rgba(125,211,252,0.18),_transparent_28%),radial-gradient(circle_at_88%_8%,_rgba(251,146,60,0.18),_transparent_26%),#fffaf2] text-foreground flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-white/20 bg-slate-950/95 px-4 py-3 text-white shadow-lg shadow-sky-950/10 backdrop-blur-xl sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative rounded-2xl bg-gradient-to-br from-sky-400 via-teal-400 to-orange-400 p-2.5 text-white shadow-lg shadow-sky-950/25">
              <Briefcase className="h-6 w-6" />
              <span className="absolute -right-1 -top-2 text-xs text-amber-300" aria-hidden="true">✦</span>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">AgencyManager <span className="text-amber-300">Pro</span></h1>
              <p className="truncate text-[11px] text-sky-100/70 sm:text-xs">Gestion d’agence, avec soleil & méthode</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.name || "Administrateur"}</p>
              <p className="text-xs text-teal-200">● Mode connecté</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout()} className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              Déconnexion
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container with Tabs */}
      <main className="container flex-1 space-y-6 overflow-x-hidden py-4 md:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-2 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="flex w-max min-w-max space-x-1 rounded-3xl border border-sky-100 bg-white/85 p-1.5 shadow-sm shadow-sky-900/5 backdrop-blur">
              <TabsTrigger value="dashboard" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <TrendingUp className="w-4 h-4 mr-2" /> Tableau de Bord
              </TabsTrigger>
              {!isCollaborator && <TabsTrigger value="hr" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <Users className="w-4 h-4 mr-2" /> RH & Agents
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="accounting" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <DollarSign className="w-4 h-4 mr-2" /> Comptabilité
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="crm" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <Kanban className="w-4 h-4 mr-2" /> CRM Leads
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="clients" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <Building2 className="w-4 h-4 mr-2" /> Base Clients
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="catalog" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <Briefcase className="w-4 h-4 mr-2" /> Catalogue
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="billing" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <FileText className="w-4 h-4 mr-2" /> Devis & Factures
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="stats" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Statistiques
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="budget" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <WalletCards className="w-4 h-4 mr-2" /> Budget Planner
              </TabsTrigger>}
              {!isCollaborator && <TabsTrigger value="settings" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md">
                <Settings className="w-4 h-4 mr-2" /> Paramètres{isAdmin ? " · Admin" : ""}
              </TabsTrigger>}
            </TabsList>
          </div>

          {/* TABLEAU DE BORD */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Onboarding Interactif pour l’Agence */}
            <Card className="border-sky-200 bg-gradient-to-r from-sky-50 via-teal-50 to-amber-50 shadow-md">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <Badge className="mb-2 bg-sky-500 text-white font-semibold">Parcours d’intégration interactif</Badge>
                    <CardTitle className="text-xl font-bold text-slate-900">Bienvenue dans votre cockpit AgencyManager Pro !</CardTitle>
                    <CardDescription>Suivez ces étapes clés pour configurer votre agence et exploiter tout son potentiel.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Progression :</span>
                    <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-black text-white shadow-sm">
                      {[isAdmin, (agentsQuery.data?.length || 0) > 0, (clientsQuery.data?.length || 0) > 0, (invoicesQuery.data?.length || 0) > 0].filter(Boolean).length} / 4 étapes
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Étape 1 */}
                  <div className={`rounded-2xl border p-4 transition-all ${isAdmin ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-sky-200 bg-white shadow-xs"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">Étape 1</span>
                      {isAdmin ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <Clock className="h-5 w-5 text-sky-600" />}
                    </div>
                    <h3 className="font-bold text-sm mb-1">Rôles & Paramètres</h3>
                    <p className="text-xs text-slate-600 mb-3">Définissez vos préférences et activez vos permissions de rôle.</p>
                    <Button size="sm" variant={isAdmin ? "outline" : "default"} className={`w-full text-xs font-semibold rounded-xl ${isAdmin ? "border-emerald-300 text-emerald-800 bg-white" : "bg-gradient-to-r from-sky-500 to-teal-500 text-white"}`} onClick={() => setActiveTab("settings")}>
                      {isAdmin ? "Vérifié ✓" : "Configurer"}
                    </Button>
                  </div>

                  {/* Étape 2 */}
                  <div className={`rounded-2xl border p-4 transition-all ${(agentsQuery.data?.length || 0) > 0 ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-sky-200 bg-white shadow-xs"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">Étape 2</span>
                      {(agentsQuery.data?.length || 0) > 0 ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <Clock className="h-5 w-5 text-sky-600" />}
                    </div>
                    <h3 className="font-bold text-sm mb-1">Équipe RH & Agents</h3>
                    <p className="text-xs text-slate-600 mb-3">Ajoutez vos collaborateurs et suivez leurs pointages en jours.</p>
                    <Button size="sm" variant={(agentsQuery.data?.length || 0) > 0 ? "outline" : "default"} className={`w-full text-xs font-semibold rounded-xl ${(agentsQuery.data?.length || 0) > 0 ? "border-emerald-300 text-emerald-800 bg-white" : "bg-gradient-to-r from-sky-500 to-teal-500 text-white"}`} onClick={() => setActiveTab("hr")}>
                      {(agentsQuery.data?.length || 0) > 0 ? `${agentsQuery.data?.length} agent(s) actif(s)` : "Ajouter un agent"}
                    </Button>
                  </div>

                  {/* Étape 3 */}
                  <div className={`rounded-2xl border p-4 transition-all ${(clientsQuery.data?.length || 0) > 0 ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-sky-200 bg-white shadow-xs"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">Étape 3</span>
                      {(clientsQuery.data?.length || 0) > 0 ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <Clock className="h-5 w-5 text-sky-600" />}
                    </div>
                    <h3 className="font-bold text-sm mb-1">Base Clients & CRM</h3>
                    <p className="text-xs text-slate-600 mb-3">Qualifiez vos prospects et organisez vos fiches clients.</p>
                    <Button size="sm" variant={(clientsQuery.data?.length || 0) > 0 ? "outline" : "default"} className={`w-full text-xs font-semibold rounded-xl ${(clientsQuery.data?.length || 0) > 0 ? "border-emerald-300 text-emerald-800 bg-white" : "bg-gradient-to-r from-sky-500 to-teal-500 text-white"}`} onClick={() => setActiveTab("clients")}>
                      {(clientsQuery.data?.length || 0) > 0 ? `${clientsQuery.data?.length} client(s) enregistrés` : "Créer un client"}
                    </Button>
                  </div>

                  {/* Étape 4 */}
                  <div className={`rounded-2xl border p-4 transition-all ${(invoicesQuery.data?.length || 0) > 0 ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-sky-200 bg-white shadow-xs"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">Étape 4</span>
                      {(invoicesQuery.data?.length || 0) > 0 ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <Clock className="h-5 w-5 text-sky-600" />}
                    </div>
                    <h3 className="font-bold text-sm mb-1">Devis & Facturation</h3>
                    <p className="text-xs text-slate-600 mb-3">Émettez vos premiers devis et factures conformes.</p>
                    <Button size="sm" variant={(invoicesQuery.data?.length || 0) > 0 ? "outline" : "default"} className={`w-full text-xs font-semibold rounded-xl ${(invoicesQuery.data?.length || 0) > 0 ? "border-emerald-300 text-emerald-800 bg-white" : "bg-gradient-to-r from-sky-500 to-teal-500 text-white"}`} onClick={() => setActiveTab("billing")}>
                      {(invoicesQuery.data?.length || 0) > 0 ? `${invoicesQuery.data?.length} facture(s)` : "Émettre une facture"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            {isCollaborator && <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-indigo-600" /> Mon espace collaborateur</CardTitle><CardDescription>Un espace personnel pour enregistrer votre journée et transmettre vos demandes au suivi RH.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><div className="rounded-xl border border-indigo-100 bg-white/80 p-3"><p className="text-xs text-slate-500">Pointages</p><p className="text-xl font-bold text-indigo-700">{timeEntriesQuery.data?.length || 0}</p></div><div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3"><p className="text-xs text-cyan-700">Solde congé</p><p className="text-xl font-bold text-cyan-800">{Number(agentsQuery.data?.[0]?.leaveBalanceDays ?? 0).toFixed(2)} j</p></div><div className="rounded-xl border border-indigo-100 bg-white/80 p-3"><p className="text-xs text-slate-500">Congés</p><p className="text-xl font-bold text-emerald-700">{leavesQuery.data?.length || 0}</p></div><div className="rounded-xl border border-indigo-100 bg-white/80 p-3"><p className="text-xs text-slate-500">Avances</p><p className="text-xl font-bold text-amber-700">{advancesQuery.data?.length || 0}</p></div><div className="rounded-xl border border-indigo-100 bg-white/80 p-3"><p className="text-xs text-slate-500">Tickets</p><p className="text-xl font-bold text-rose-700">{ticketsQuery.data?.length || 0}</p></div></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Button className="bg-indigo-600 text-white hover:bg-indigo-500" onClick={() => { const agentId = agentsQuery.data?.[0]?.id || 0; setSelectedTimeEntryAgentId(agentId || null); setTimeEntryForm(form => ({ ...form, agentId })); setIsTimeEntryOpen(true); }}><ClipboardCheck className="mr-2 h-4 w-4" /> Nouveau pointage</Button><Button variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-50" onClick={() => { const agentId = agentsQuery.data?.[0]?.id || 0; setAdvanceForm(form => ({ ...form, agentId })); setIsAdvanceOpen(true); }}><WalletCards className="mr-2 h-4 w-4" /> Demander une avance</Button><Button variant="outline" className="border-emerald-200 text-emerald-800 hover:bg-emerald-50" onClick={() => { const agentId = agentsQuery.data?.[0]?.id || 0; setLeaveForm(form => ({ ...form, agentId })); setIsLeaveOpen(true); }}><Calendar className="mr-2 h-4 w-4" /> Demander un congé</Button><Button variant="outline" className="border-rose-200 text-rose-800 hover:bg-rose-50" onClick={() => { const agentId = agentsQuery.data?.[0]?.id || 0; setTicketForm(form => ({ ...form, agentId, title: "", description: "", category: "Demande exceptionnelle" })); setIsTicketOpen(true); }}><Ticket className="mr-2 h-4 w-4" /> Créer un ticket</Button></div><p className="text-xs text-slate-500">Les pointages sont verrouillés après création. Les demandes de congé, d’avance et d’exception sont automatiquement rattachées à votre compte et transmises au suivi RH.</p></CardContent></Card>}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {canViewRevenueDashboard && <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-indigo-400" role="button" tabIndex={0} aria-label="Ouvrir la comptabilité depuis le chiffre d’affaires" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Chiffre d’Affaires Encaissé</CardTitle>
                  <ArrowUpRight className="w-5 h-5 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {formatMGA(Number(accountingSummary.data?.totalEntrees || 0), currentEurToMgaRate)}
                  </div>
                  <div className="mt-3"><Button variant="ghost" size="sm" className="h-7 px-0 text-emerald-700 hover:bg-transparent hover:text-emerald-900" onClick={event => { event.stopPropagation(); openDashboardModule("accounting"); }}>Voir la comptabilité <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></div>
                </CardContent>
              </Card>}
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-indigo-400" role="button" tabIndex={0} aria-label="Ouvrir les mouvements de caisse" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Trésorerie / Solde Caisse</CardTitle>
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {formatMGA(Number(accountingSummary.data?.solde || 0), currentEurToMgaRate)}
                  </div>
                  <div className="mt-3"><Button variant="ghost" size="sm" className="h-7 px-0 text-indigo-700 hover:bg-transparent hover:text-indigo-900" onClick={event => { event.stopPropagation(); openDashboardModule("accounting"); }}>Voir les mouvements <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-indigo-400" role="button" tabIndex={0} aria-label="Ouvrir les agents actifs" onClick={() => openDashboardModule("hr")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("hr"); }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Agents Actifs</CardTitle>
                  <Users className="w-5 h-5 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {agentsQuery.data?.length || 0} collaborateurs
                  </div>
                  <div className="mt-3"><Button variant="ghost" size="sm" className="h-7 px-0 text-blue-700 hover:bg-transparent hover:text-blue-900" onClick={event => { event.stopPropagation(); openDashboardModule("hr"); }}>Ouvrir les RH <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-indigo-400" role="button" tabIndex={0} aria-label="Ouvrir les leads en pipeline" onClick={() => openDashboardModule("crm")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("crm"); }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Leads en Pipeline</CardTitle>
                  <Kanban className="w-5 h-5 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {leadsQuery.data?.length || 0} prospects
                  </div>
                  <div className="mt-3"><Button variant="ghost" size="sm" className="h-7 px-0 text-amber-700 hover:bg-transparent hover:text-amber-900" onClick={event => { event.stopPropagation(); openDashboardModule("crm"); }}>Ouvrir le CRM <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {canViewRevenueDashboard && <>
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:shadow-lg" role="button" tabIndex={0} aria-label="Ouvrir la comptabilité et le détail du chiffre d’affaires mensuel" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader>
                  <CardTitle>Analyse du CA mensuel</CardTitle>
                  <CardDescription>Encaissements, dépenses et facturation sur {revenueReportQuery.data?.year || new Date().getFullYear()}</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {revenueReportQuery.isLoading ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Génération du graphique…</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueReportQuery.data?.months || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.28}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `${Math.round(convertEurToMga(Number(value), currentEurToMgaRate) / 1000000)}M`} />
                        <ChartTooltip formatter={(value: number) => formatMGA(Number(value), currentEurToMgaRate)} />
                        <Area type="monotone" dataKey="revenue" name="CA encaissé" stroke="#4f46e5" fill="url(#revenueGradient)" strokeWidth={3} />
                        <Area type="monotone" dataKey="invoiced" name="Facturé" stroke="#06b6d4" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:shadow-lg" role="button" tabIndex={0} aria-label="Ouvrir la comptabilité et le reporting annuel" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader>
                  <CardTitle>CA annuel & reporting automatique</CardTitle>
                  <CardDescription>Vue historique des performances financières de l’agence</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {revenueReportQuery.isLoading ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Agrégation des données…</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueReportQuery.data?.annual || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `${Math.round(convertEurToMga(Number(value), currentEurToMgaRate) / 1000000)}M`} />
                        <ChartTooltip formatter={(value: number) => formatMGA(Number(value), currentEurToMgaRate)} />
                        <Bar dataKey="revenue" name="CA encaissé" fill="#10b981" radius={[5, 5, 0, 0]} />
                        <Bar dataKey="expenses" name="Dépenses" fill="#f43f5e" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card className="border-indigo-100 bg-indigo-50/60 shadow-sm lg:col-span-2 cursor-pointer transition-all hover:shadow-lg" role="button" tabIndex={0} aria-label="Ouvrir le reporting comptable automatique" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-indigo-950">Reporting automatique — {automaticReportQuery.data?.monthLabel || "mois en cours"}</CardTitle>
                      <CardDescription className="text-indigo-700/70">Synthèse actualisée à partir des mouvements de caisse et des factures</CardDescription>
                    </div>
                    <Badge className="bg-indigo-600 text-white"><RefreshCw className="w-3 h-3 mr-1" /> Automatique</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">Encaissé</p><p className="text-xl font-bold text-emerald-600">{formatMGA(Number(automaticReportQuery.data?.collected || 0), currentEurToMgaRate)}</p></div>
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">Dépenses</p><p className="text-xl font-bold text-rose-600">{formatMGA(Number(automaticReportQuery.data?.expenses || 0), currentEurToMgaRate)}</p></div>
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">Factures du mois</p><p className="text-xl font-bold text-indigo-700">{automaticReportQuery.data?.invoicesCount || 0}</p></div>
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">À relancer</p><p className="text-xl font-bold text-amber-600">{automaticReportQuery.data?.unpaidCount || 0}</p></div>
                </CardContent>
              </Card></>}
              <Card className="border-slate-200 shadow-sm bg-white lg:col-span-2">
                <CardHeader className="pb-3"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Reporting intelligent par section</CardTitle><CardDescription>Analyse mensuelle de chaque pôle de l’agence à partir des données enregistrées.</CardDescription></div><div className="flex items-center gap-2"><Label htmlFor="report-month" className="text-xs text-slate-500">Période</Label><Input id="report-month" type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value)} className="w-40 bg-white" /></div></div></CardHeader>
                <CardContent>{monthlyReportQuery.isLoading ? <div className="flex items-center justify-center py-8 text-sm text-slate-500"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Calcul du reporting mensuel…</div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">{[
                  { key: "rh", title: "RH", accent: "text-indigo-700", values: [`${monthlyReportQuery.data?.sections.rh.newAgents || 0} nouveaux agents`, `${monthlyReportQuery.data?.sections.rh.timeEntries || 0} pointages`, `${monthlyReportQuery.data?.sections.rh.openTickets || 0} tickets ouverts`] },
                  { key: "accounting", title: "Comptabilité", accent: "text-emerald-700", values: [`${formatMGA(Number(monthlyReportQuery.data?.sections.accounting.collected || 0), currentEurToMgaRate)} encaissés`, `${formatMGA(Number(monthlyReportQuery.data?.sections.accounting.expenses || 0), currentEurToMgaRate)} dépenses`, `${monthlyReportQuery.data?.sections.accounting.transactions || 0} mouvements`] },
                  { key: "crm", title: "CRM", accent: "text-amber-700", values: [`${monthlyReportQuery.data?.sections.crm.newLeads || 0} nouveaux leads`, `${(monthlyReportQuery.data?.sections.crm.pipeline || 0).toLocaleString("fr-FR")} € pipeline`, `${monthlyReportQuery.data?.sections.crm.followUps || 0} relances`] },
                  { key: "clients", title: "Clients", accent: "text-cyan-700", values: [`${monthlyReportQuery.data?.sections.clients.newClients || 0} nouveaux clients`, `${monthlyReportQuery.data?.sections.clients.interactions || 0} échanges`, `${monthlyReportQuery.data?.sections.clients.documents || 0} documents`] },
                  { key: "billing", title: "Facturation", accent: "text-rose-700", values: [`${monthlyReportQuery.data?.sections.billing.quotes || 0} devis`, `${monthlyReportQuery.data?.sections.billing.invoices || 0} factures`, `${monthlyReportQuery.data?.sections.billing.overdue || 0} en retard`] },
                ].map(section => <button type="button" key={section.key} onClick={() => openDashboardModule(section.key === "accounting" ? "accounting" : section.key)} className="text-left rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400"><p className={`font-semibold ${section.accent}`}>{section.title}</p><div className="mt-3 space-y-1.5 text-xs text-slate-600">{section.values.map(value => <p key={value}>{value}</p>)}</div><span className="mt-3 inline-flex items-center text-xs font-medium text-slate-500">Ouvrir le module <ArrowRight className="ml-1 h-3.5 w-3.5" /></span></button>)}</div>}</CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:shadow-lg" role="button" tabIndex={0} aria-label="Ouvrir les mouvements de caisse récents" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader>
                  <CardTitle>Activité Récente & Mouvements</CardTitle>
                  <CardDescription>Dernières opérations enregistrées dans l'agence</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {transactionsQuery.data?.slice(0, 5).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${tx.type === 'entrée' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                            {tx.type === 'entrée' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{tx.description}</p>
                            <p className="text-xs text-slate-500">{tx.category} • {String(tx.date)}</p>
                          </div>
                        </div>
                        <span className={`font-bold text-sm ${tx.type === 'entrée' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'entrée' ? '+' : '-'}{formatCurrency(Number(tx.amountInCurrency || tx.amount), tx.currency === "MGA" ? "MGA" : "EUR")}
                        </span>
                      </div>
                    ))}
                    {(!transactionsQuery.data || transactionsQuery.data.length === 0) && (
                      <p className="text-sm text-slate-500 text-center py-4">Aucune transaction enregistrée.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:shadow-lg" role="button" tabIndex={0} aria-label="Ouvrir les tickets et le suivi RH" onClick={() => openDashboardModule("hr")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("hr"); }}>
                <CardHeader>
                  <CardTitle>Tickets & Support Interconnectés</CardTitle>
                  <CardDescription>Suivi des demandes liées aux agents et clients</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {ticketsQuery.data?.slice(0, 5).map((ticket) => (
                      <div key={ticket.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <Ticket className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{ticket.title}</p>
                            <p className="text-xs text-slate-500">Priorité : {ticket.priority} • Catégorie : {ticket.category}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize">{ticket.status}</Badge>
                      </div>
                    ))}
                    {(!ticketsQuery.data || ticketsQuery.data.length === 0) && (
                      <p className="text-sm text-slate-500 text-center py-4">Aucun ticket ouvert.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-indigo-950"><FileSpreadsheet className="h-5 w-5 text-indigo-600" /> Statistiques</CardTitle>
                      <CardDescription className="mt-1">Tableur mensuel filtrable par client, agent, service et période.</CardDescription>
                    </div>
                    <Badge variant="outline" className="border-indigo-200 bg-white text-indigo-700">Rubrique</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button className="bg-indigo-600 text-white hover:bg-indigo-500" onClick={() => openDashboardModule("stats")}><FileSpreadsheet className="mr-2 h-4 w-4" /> Ouvrir les statistiques</Button>
                  <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => { openDashboardModule("stats"); setIsStatOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Alimenter le mois</Button>
                </CardContent>
              </Card>
              <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-emerald-950"><WalletCards className="h-5 w-5 text-emerald-600" /> Budget Planner</CardTitle>
                      <CardDescription className="mt-1">Dépenses récurrentes, feuilles mensuelles et conversion en sortie de caisse.</CardDescription>
                    </div>
                    <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">Rubrique</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => openDashboardModule("budget")}><WalletCards className="mr-2 h-4 w-4" /> Ouvrir le budget</Button>
                  <Button variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => { openDashboardModule("budget"); setIsBudgetOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Nouvelle feuille</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* MODULE RH & AGENTS */}
          <TabsContent value="hr" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Ressources Humaines</h2>
                <p className="text-sm text-slate-500">Gestion des dossiers agents, pointages, congés, avances et contrats</p>
              </div>
              <Dialog open={isAgentOpen} onOpenChange={(open) => { setIsAgentOpen(open); if (open) setAgentFormError(""); }}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                    <UserPlus className="w-4 h-4 mr-2" /> Nouvel Agent
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl bg-white rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Intégration d’un nouvel agent</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                      <Label>Nom complet</Label>
                      <Input value={agentForm.name} onChange={e => setAgentForm({...agentForm, name: e.target.value})} placeholder="Jean Dupont" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email professionnel</Label>
                      <Input value={agentForm.email} onChange={e => setAgentForm({...agentForm, email: e.target.value})} placeholder="j.dupont@agence.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Téléphone</Label>
                      <Input value={agentForm.phone} onChange={e => setAgentForm({...agentForm, phone: e.target.value})} placeholder="06 12 34 56 78" />
                    </div>
                    <div className="space-y-2">
                      <Label>Poste / Fonction</Label>
                      <Input value={agentForm.position} onChange={e => setAgentForm({...agentForm, position: e.target.value})} placeholder="Chef de Projet Senior" />
                    </div>
                    <div className="space-y-2">
                      <Label>Département</Label>
                      <Input value={agentForm.department} onChange={e => setAgentForm({...agentForm, department: e.target.value})} placeholder="Technique / Prod" />
                    </div>
                    <div className="space-y-2">
                      <Label>Date d'embauche</Label>
                      <Input type="date" value={agentForm.hireDate} onChange={e => setAgentForm({...agentForm, hireDate: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Salaire net (Ar)</Label>
                      <Input type="number" min="0" step="1" value={agentForm.salary} onChange={e => setAgentForm({...agentForm, salary: e.target.value})} placeholder="15000000" />
                      <p className="text-[11px] text-slate-500">Saisie en Ariary · taux de référence : 1 € = {currentEurToMgaRate.toLocaleString("fr-FR")} Ar</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Type de contrat</Label>
                      <Select value={agentForm.contractType} onValueChange={v => setAgentForm({...agentForm, contractType: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CDI">CDI</SelectItem>
                          <SelectItem value="CDD">CDD</SelectItem>
                          <SelectItem value="Stage">Stage</SelectItem>
                          <SelectItem value="Freelance">Freelance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {agentFormError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{agentFormError}</div>}
                  <DialogFooter>
                    <Button onClick={handleCreateAgent} disabled={createAgentMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                      {createAgentMutation.isPending ? "Enregistrement…" : "Enregistrer l'employé"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isTimeEntryOpen} onOpenChange={(open) => { setIsTimeEntryOpen(open); if (!open) setEditingTimeEntryId(null); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => { const agentId = agentsQuery.data?.[0]?.id || 0; setSelectedTimeEntryAgentId(agentId || null); setTimeEntryForm(form => ({ ...form, agentId })); }}>
                    <ClipboardCheck className="w-4 h-4 mr-2" /> Nouveau pointage
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg bg-white rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingTimeEntryId ? "Corriger un pointage" : "Ajouter un pointage à la feuille agent"}</DialogTitle>
                    <DialogDescription>Le pointage sera rattaché automatiquement au dossier de l’agent sélectionné.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Feuille de pointage</p><p className="font-semibold text-slate-900">{agentsQuery.data?.find(agent => agent.id === selectedTimeEntryAgentId)?.name || "Sélectionnez un agent"}</p></div><Badge variant="outline" className="bg-white">{agentTimeEntriesQuery.data?.length || 0} entrée(s)</Badge></div>
                      <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">{agentTimeEntriesQuery.isLoading ? <p className="text-xs text-slate-500">Chargement de la feuille…</p> : agentTimeEntriesQuery.data?.length ? agentTimeEntriesQuery.data.slice(0, 5).map(entry => <div key={entry.id} className="flex items-center justify-between text-xs text-slate-600"><span>{String(entry.date).slice(0, 10)}</span><span>{entry.hoursWorked} h · {(Number(entry.hoursWorked) / WORKDAY_HOURS).toFixed(2)} j · {entry.status}</span></div>) : <p className="text-xs text-slate-500">Aucun pointage enregistré pour cet agent.</p>}</div>
                    </div>
                    <div className="space-y-2">
                      <Label>Agent</Label>
                      <Select disabled={Boolean(editingTimeEntryId)} value={timeEntryForm.agentId ? String(timeEntryForm.agentId) : ""} onValueChange={value => { const agentId = Number(value); setSelectedTimeEntryAgentId(agentId); setTimeEntryForm({ ...timeEntryForm, agentId }); }}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner un agent" /></SelectTrigger>
                        <SelectContent>{agentsQuery.data?.map(agent => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} · {agent.position}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Date</Label><Input type="date" value={timeEntryForm.date} onChange={e => setTimeEntryForm({ ...timeEntryForm, date: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Heures travaillées</Label><Input type="number" min="0" max="24" step="0.25" value={timeEntryForm.hoursWorked} onChange={e => setTimeEntryForm({ ...timeEntryForm, hoursWorked: e.target.value })} /><p className="text-[11px] text-slate-500">{Number(timeEntryForm.hoursWorked || 0).toFixed(2)} h = {(Number(timeEntryForm.hoursWorked || 0) / WORKDAY_HOURS).toFixed(2)} journée(s) · base : 8 h/jour</p></div>
                    </div>
                    <div className="space-y-2">
                      <Label>Statut</Label>
                      <Select value={timeEntryForm.status} onValueChange={value => setTimeEntryForm({ ...timeEntryForm, status: value as typeof timeEntryForm.status })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="présent">Présent</SelectItem><SelectItem value="retard">Retard</SelectItem><SelectItem value="absent">Absent</SelectItem><SelectItem value="congé">Congé</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Note du pointage</Label><Textarea value={timeEntryForm.notes} onChange={e => setTimeEntryForm({ ...timeEntryForm, notes: e.target.value })} placeholder="Retard justifié, intervention extérieure…" /></div>
                  </div>
                  <DialogFooter><Button disabled={!timeEntryForm.agentId || createTimeEntryMutation.isPending || updateTimeEntryMutation.isPending} onClick={handleSaveTimeEntry} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{createTimeEntryMutation.isPending || updateTimeEntryMutation.isPending ? "Enregistrement…" : editingTimeEntryId ? "Enregistrer la correction" : "Enregistrer le pointage"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isLeaveEditOpen} onOpenChange={(open) => { setIsLeaveEditOpen(open); if (!open) setEditingLeaveId(null); }}>
                <DialogContent className="max-w-lg bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Corriger une demande de congé</DialogTitle><DialogDescription>Modifiez les dates, le type et la justification avant de sauvegarder.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Type de congé</Label><Input value={leaveEditForm.leaveType} onChange={e => setLeaveEditForm({ ...leaveEditForm, leaveType: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Nombre de jours à décompter</Label><Input type="number" min="1" step="1" value={leaveEditForm.daysCount} onChange={e => setLeaveEditForm({ ...leaveEditForm, daysCount: Number(e.target.value) })} /></div>
                      <div className="space-y-2"><Label>Date de début</Label><Input type="date" value={leaveEditForm.startDate} onChange={e => setLeaveEditForm({ ...leaveEditForm, startDate: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Date de fin</Label><Input type="date" value={leaveEditForm.endDate} onChange={e => setLeaveEditForm({ ...leaveEditForm, endDate: e.target.value })} /></div>
                    </div>
                    <div className="space-y-2"><Label>Motif / note RH</Label><Textarea value={leaveEditForm.reason} onChange={e => setLeaveEditForm({ ...leaveEditForm, reason: e.target.value })} placeholder="Précisez la demande ou sa correction…" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleUpdateLeave} disabled={!editingLeaveId || updateLeaveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{updateLeaveMutation.isPending ? "Enregistrement…" : "Enregistrer la correction"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isLeaveOpen} onOpenChange={setIsLeaveOpen}>
                <DialogContent className="max-w-lg bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Demander un congé</DialogTitle><DialogDescription>La demande sera enregistrée dans le suivi RH. Les congés sont décomptés en journées.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Agent</Label><Select value={leaveForm.agentId ? String(leaveForm.agentId) : ""} onValueChange={value => setLeaveForm({ ...leaveForm, agentId: Number(value) })}><SelectTrigger><SelectValue placeholder="Sélectionner un agent" /></SelectTrigger><SelectContent>{agentsQuery.data?.map(agent => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} · {agent.position}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Type de congé</Label><Input value={leaveForm.leaveType} onChange={event => setLeaveForm({ ...leaveForm, leaveType: event.target.value })} /></div><div className="space-y-2"><Label>Nombre de jours</Label><Input type="number" min="1" step="1" value={leaveForm.daysCount} onChange={event => setLeaveForm({ ...leaveForm, daysCount: Number(event.target.value) })} /></div><div className="space-y-2"><Label>Date de début</Label><Input type="date" value={leaveForm.startDate} onChange={event => setLeaveForm({ ...leaveForm, startDate: event.target.value })} /></div><div className="space-y-2"><Label>Date de fin</Label><Input type="date" value={leaveForm.endDate} onChange={event => setLeaveForm({ ...leaveForm, endDate: event.target.value })} /></div></div>
                    <div className="space-y-2"><Label>Motif</Label><Textarea value={leaveForm.reason} onChange={event => setLeaveForm({ ...leaveForm, reason: event.target.value })} placeholder="Congé annuel, rendez-vous médical…" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleCreateLeave} disabled={createLeaveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{createLeaveMutation.isPending ? "Enregistrement…" : "Envoyer la demande"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isAdvanceOpen} onOpenChange={setIsAdvanceOpen}>
                <DialogContent className="max-w-lg bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Demande d’avance sur salaire</DialogTitle><DialogDescription>L’avance sera suivie et déduite du salaire net au mois choisi.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Agent</Label><Select value={advanceForm.agentId ? String(advanceForm.agentId) : ""} onValueChange={value => setAdvanceForm({ ...advanceForm, agentId: Number(value) })}><SelectTrigger><SelectValue placeholder="Sélectionner un agent" /></SelectTrigger><SelectContent>{agentsQuery.data?.map(agent => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} · {agent.position}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Montant de l’avance (Ar)</Label><Input type="number" min="0" step="1" value={advanceForm.amount} onChange={event => setAdvanceForm({ ...advanceForm, amount: event.target.value })} /><p className="text-[11px] text-slate-500">La valeur sera enregistrée selon le taux de référence puis réaffichée en Ariary.</p></div><div className="space-y-2"><Label>Date de demande</Label><Input type="date" value={advanceForm.requestedDate} onChange={event => setAdvanceForm({ ...advanceForm, requestedDate: event.target.value })} /></div><div className="col-span-2 space-y-2"><Label>Mois de déduction</Label><Input type="month" value={advanceForm.deductionMonth} onChange={event => setAdvanceForm({ ...advanceForm, deductionMonth: event.target.value })} /></div></div>
                    <div className="space-y-2"><Label>Note</Label><Textarea value={advanceForm.notes} onChange={event => setAdvanceForm({ ...advanceForm, notes: event.target.value })} placeholder="Précisez le contexte de la demande…" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleCreateAdvance} disabled={createAdvanceMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{createAdvanceMutation.isPending ? "Enregistrement…" : "Enregistrer la demande"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isTicketOpen} onOpenChange={setIsTicketOpen}>
                <DialogContent className="max-w-lg bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Créer un ticket de demande RH</DialogTitle><DialogDescription>Le ticket reste lié à la fiche agent pour assurer le suivi des congés et demandes exceptionnelles.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Agent</Label><Select value={ticketForm.agentId ? String(ticketForm.agentId) : ""} onValueChange={value => setTicketForm({ ...ticketForm, agentId: Number(value) })}><SelectTrigger><SelectValue placeholder="Sélectionner un agent" /></SelectTrigger><SelectContent>{agentsQuery.data?.map(agent => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} · {agent.position}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Type de demande</Label><Select value={ticketForm.category} onValueChange={value => setTicketForm({ ...ticketForm, category: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Demande de congé">Demande de congé</SelectItem><SelectItem value="Demande exceptionnelle">Demande exceptionnelle</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Priorité</Label><Select value={ticketForm.priority} onValueChange={value => setTicketForm({ ...ticketForm, priority: value as typeof ticketForm.priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basse">Basse</SelectItem><SelectItem value="normale">Normale</SelectItem><SelectItem value="haute">Haute</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div></div>
                    <div className="space-y-2"><Label>Titre</Label><Input value={ticketForm.title} onChange={event => setTicketForm({ ...ticketForm, title: event.target.value })} placeholder="Ex. Demande exceptionnelle de télétravail" /></div>
                    <div className="space-y-2"><Label>Description</Label><Textarea value={ticketForm.description} onChange={event => setTicketForm({ ...ticketForm, description: event.target.value })} placeholder="Décrivez la demande et les éléments nécessaires au traitement…" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleCreateTicket} disabled={createTicketMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{createTicketMutation.isPending ? "Création…" : "Créer le ticket"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isAgentEditOpen} onOpenChange={setIsAgentEditOpen}>
                <DialogContent className="max-w-2xl bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Modifier la fiche agent</DialogTitle><DialogDescription>Corrigez les informations RH puis enregistrez la version à jour.</DialogDescription></DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2"><Label>Nom complet</Label><Input value={agentEditForm.name} onChange={e => setAgentEditForm({ ...agentEditForm, name: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Email professionnel</Label><Input type="email" value={agentEditForm.email} onChange={e => setAgentEditForm({ ...agentEditForm, email: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Téléphone</Label><Input value={agentEditForm.phone} onChange={e => setAgentEditForm({ ...agentEditForm, phone: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Poste / Fonction</Label><Input value={agentEditForm.position} onChange={e => setAgentEditForm({ ...agentEditForm, position: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Département</Label><Input value={agentEditForm.department} onChange={e => setAgentEditForm({ ...agentEditForm, department: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Date d’embauche</Label><Input type="date" value={agentEditForm.hireDate} onChange={e => setAgentEditForm({ ...agentEditForm, hireDate: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Salaire net (Ar)</Label><Input type="number" min="0" step="1" value={agentEditForm.salary} onChange={e => setAgentEditForm({ ...agentEditForm, salary: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Type de contrat</Label><Select value={agentEditForm.contractType} onValueChange={value => setAgentEditForm({ ...agentEditForm, contractType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CDI">CDI</SelectItem><SelectItem value="CDD">CDD</SelectItem><SelectItem value="Stage">Stage</SelectItem><SelectItem value="Freelance">Freelance</SelectItem></SelectContent></Select></div>
                    <div className="col-span-2 space-y-2"><Label>Note interne RH</Label><Textarea value={agentEditForm.notes} onChange={e => setAgentEditForm({ ...agentEditForm, notes: e.target.value })} placeholder="Observations utiles sur le dossier agent…" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleUpdateAgent} disabled={updateAgentMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{updateAgentMutation.isPending ? "Enregistrement…" : "Enregistrer les modifications"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Tableau récapitulatif des agents */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Fiches collaborateurs</CardTitle>
                <CardDescription>Ouvrez chaque carte pour consulter les données du mois et lancer une action RH.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {agentsQuery.data?.map(agent => {
                    const hireYear = new Date(agent.hireDate).getFullYear();
                    const seniority = Math.max(0, new Date().getFullYear() - hireYear);
                    const summary = getAgentMonthlySummary(agent.id);
                    const isExpanded = expandedAgentId === agent.id;
                    return (
                      <Collapsible key={agent.id} open={isExpanded} onOpenChange={open => setExpandedAgentId(open ? agent.id : null)} className="min-w-0">
                        <Card className="h-full overflow-hidden border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                          <CardHeader className="p-0">
                            <div className="flex items-start justify-between gap-3 p-4">
                              <CollapsibleTrigger asChild>
                                <button type="button" className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 font-semibold text-indigo-700">{agent.name.slice(0, 1).toUpperCase()}</div>
                                    <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{agent.name}</p><p className="truncate text-xs text-slate-500">{agent.position} · {agent.department}</p></div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{agent.contractType}</Badge><Badge className="bg-emerald-100 text-emerald-800">{agent.status}</Badge><span className="text-xs text-slate-500">{seniority} an(s)</span><span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">Solde congé : {Number(agent.leaveBalanceDays ?? 0).toFixed(2)} j</span></div>
                                </button>
                              </CollapsibleTrigger>
                              <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                            </div>
                            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 pb-4 pt-3">
                              <Button size="sm" variant="outline" className="h-8 rounded-lg border-indigo-200 px-2 text-xs text-indigo-700 hover:bg-indigo-50" onClick={() => { setSelectedTimeEntryAgentId(agent.id); setTimeEntryForm(form => ({ ...form, agentId: agent.id, status: "présent", hoursWorked: "8" })); setIsTimeEntryOpen(true); }}><Clock className="mr-1 h-3.5 w-3.5" /> Pointer</Button>
                              <Button size="sm" variant="outline" className="h-8 rounded-lg border-amber-200 px-2 text-xs text-amber-700 hover:bg-amber-50" onClick={() => { setSelectedTimeEntryAgentId(agent.id); setTimeEntryForm(form => ({ ...form, agentId: agent.id, date: new Date().toISOString().slice(0, 10), hoursWorked: "0", status: "absent", notes: "Absence déclarée depuis la fiche agent" })); setIsTimeEntryOpen(true); }}><Calendar className="mr-1 h-3.5 w-3.5" /> Absence</Button>
                              <Button size="sm" variant="outline" className="h-8 rounded-lg border-cyan-200 px-2 text-xs text-cyan-700 hover:bg-cyan-50" onClick={() => { setLeaveForm(form => ({ ...form, agentId: agent.id })); setIsLeaveOpen(true); }}><Calendar className="mr-1 h-3.5 w-3.5" /> Congé</Button>
                              <Button size="sm" variant="outline" className="h-8 rounded-lg border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50" onClick={() => { setAdvanceForm(form => ({ ...form, agentId: agent.id })); setIsAdvanceOpen(true); }}><WalletCards className="mr-1 h-3.5 w-3.5" /> Avance</Button>
                              <Button size="sm" variant="outline" className="h-8 rounded-lg border-violet-200 px-2 text-xs text-violet-700 hover:bg-violet-50" onClick={() => { setTicketForm(form => ({ ...form, agentId: agent.id, title: "", description: "" })); setIsTicketOpen(true); }}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Ticket</Button>
                              <Button size="icon" variant="outline" className="ml-auto h-8 w-8 rounded-lg" title="Modifier la fiche agent" onClick={() => openAgentEdit(agent)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50" title="Supprimer la fiche agent" onClick={() => handleDeleteAgent(agent)} disabled={deleteAgentMutation.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </CardHeader>
                          <CollapsibleContent>
                            <CardContent className="border-t border-slate-100 bg-slate-50/70 p-4">
                              <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Récapitulatif {reportMonth}</p><span className="text-xs text-slate-500">8 h = 1 journée</span></div>
                              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Jours travaillés</p><p className="mt-1 text-base font-semibold text-indigo-700">{summary.workDays.toFixed(2)}</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Heures</p><p className="mt-1 text-base font-semibold text-slate-900">{summary.workedHours.toFixed(2)} h</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Absences</p><p className="mt-1 text-base font-semibold text-amber-700">{summary.absences}</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Congés du mois</p><p className="mt-1 text-base font-semibold text-cyan-700">{summary.leaveDays} j</p></div><div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Solde disponible</p><p className="mt-1 text-base font-semibold text-cyan-700">{Number(agent.leaveBalanceDays ?? 0).toFixed(2)} j</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Pointages</p><p className="mt-1 text-base font-semibold text-slate-900">{summary.entries}</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Avances</p><p className="mt-1 text-base font-semibold text-emerald-700">{summary.advances}</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Tickets</p><p className="mt-1 text-base font-semibold text-violet-700">{summary.tickets}</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Embauche</p><p className="mt-1 font-semibold text-slate-900">{String(agent.hireDate).slice(0, 10)}</p></div>
                                <div className="rounded-lg bg-white p-2.5"><p className="text-slate-500">Salaire net</p><p className="mt-1 font-semibold text-emerald-700">{formatMGA(Number(agent.salary), currentEurToMgaRate)}</p></div>
                              </div>
                              {(agent.email || agent.phone || agent.notes) && <div className="mt-3 space-y-1 text-xs text-slate-600"><p>{agent.email}{agent.phone ? ` · ${agent.phone}` : ""}</p>{agent.notes && <p className="line-clamp-2">Note : {agent.notes}</p>}</div>}
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
                  {(!agentsQuery.data || agentsQuery.data.length === 0) && <div className="col-span-full rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">Aucun agent enregistré.</div>}
                </div>
              </CardContent>
            </Card>

            {canManageHrRequests && <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-indigo-950"><Mail className="h-5 w-5 text-indigo-600" /> Boîte de réception superviseur</CardTitle>
                    <CardDescription>Tickets et demandes de l’équipe à valider depuis un espace unique.</CardDescription>
                  </div>
                  <Badge className="w-fit bg-indigo-100 text-indigo-800">{(ticketsQuery.data || []).filter(ticket => ticket.status === "ouvert" || ticket.status === "en_cours").length} à traiter</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 lg:grid-cols-2">
                  {(ticketsQuery.data || []).map(ticket => {
                    const agent = agentsQuery.data?.find(item => item.id === ticket.agentId);
                    const isPending = ticket.status === "ouvert" || ticket.status === "en_cours";
                    const isLeaveRequest = ticket.requestType === "conge";
                    const isAdvanceRequest = ticket.requestType === "avance";
                    return <div key={ticket.id} className={`rounded-xl border p-4 ${isPending ? "border-indigo-200 bg-white" : "border-slate-200 bg-slate-50/70"}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{ticket.title}</p><Badge variant="outline">{ticket.status}</Badge></div>
                          <p className="mt-1 text-xs text-slate-500">{agent?.name || (ticket.agentId ? `Agent #${ticket.agentId}` : "Ticket transversal")} · {ticket.category} · priorité {ticket.priority}</p>
                          <p className="mt-2 line-clamp-3 text-sm text-slate-600">{ticket.description}</p>
                        </div>
                        {isPending && <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => handleProcessTicket(ticket, "résolu")} disabled={updateTicketStatusMutation.isPending}><Check className="mr-1.5 h-3.5 w-3.5" /> {isLeaveRequest ? "Valider le congé" : isAdvanceRequest ? "Accorder l’avance" : "Résoudre"}</Button>
                          <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => handleProcessTicket(ticket, "fermé")} disabled={updateTicketStatusMutation.isPending}><X className="mr-1.5 h-3.5 w-3.5" /> Refuser</Button>
                        </div>}
                      </div>
                    </div>;
                  })}
                  {(!ticketsQuery.data || ticketsQuery.data.length === 0) && <div className="rounded-xl border border-dashed border-indigo-200 bg-white/70 p-6 text-center text-sm text-slate-500 lg:col-span-2">Aucun ticket ou demande dans votre périmètre.</div>}
                </div>
              </CardContent>
            </Card>}

            {/* Section Pointages, Congés et Avances sur salaire */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Feuille de Pointage & Horaires</CardTitle><CardDescription>Suivi journalier du temps de travail des agents</CardDescription></div><div className="rounded-xl bg-indigo-50 px-3 py-2 text-left sm:text-right"><p className="text-[11px] uppercase tracking-wide text-indigo-600">Total du mois · {reportMonth}</p><p className="text-lg font-bold text-indigo-800">{monthlyWorkedDays.toFixed(2)} jour(s)</p><p className="text-[11px] text-indigo-600">{monthlyWorkedHours.toFixed(2)} h · base 8 h/jour</p></div></div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent ID</TableHead>
                        <TableHead>Heures / journées</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeEntriesQuery.data?.map(te => (
                        <TableRow key={te.id}>
                          <TableCell>{String(te.date).slice(0, 10)}</TableCell>
                          <TableCell>{agentsQuery.data?.find(agent => agent.id === te.agentId)?.name || `Agent #${te.agentId}`}</TableCell>
                          <TableCell className="font-semibold"><span>{te.hoursWorked} h</span><span className="ml-1 text-xs font-normal text-slate-500">({(Number(te.hoursWorked) / WORKDAY_HOURS).toFixed(2)} j)</span></TableCell>
                          <TableCell><Badge variant="outline">{te.status}</Badge></TableCell>
                          <TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="Corriger le pointage" onClick={() => openTimeEntryEdit(te)}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="outline" className="h-8 w-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50" title="Supprimer le pointage" onClick={() => handleDeleteTimeEntry(te)} disabled={deleteTimeEntryMutation.isPending}><Trash2 className="w-3.5 h-3.5" /></Button></div></TableCell>
                        </TableRow>
                      ))}
                      {(!timeEntriesQuery.data || timeEntriesQuery.data.length === 0) && (
                        <TableRow><TableCell colSpan={5} className="text-center py-4 text-slate-500">Aucun pointage récent.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader>
                  <CardTitle>Demandes de congé</CardTitle>
                  <CardDescription>Correction et suppression des demandes RH</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {leavesQuery.data?.map(leave => {
                      const agent = agentsQuery.data?.find(item => item.id === leave.agentId);
                      return <div key={leave.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2"><div><p className="font-medium text-sm text-slate-900">{agent?.name || `Agent #${leave.agentId}`}</p><p className="text-xs text-slate-500">{leave.leaveType} · {leave.daysCount} jour(s)</p></div><Badge variant="outline">{leave.status}</Badge></div>
                        <p className="text-xs text-slate-500">{String(leave.startDate).slice(0, 10)} → {String(leave.endDate).slice(0, 10)}</p>
                        {leave.reason && <p className="text-xs text-slate-600 line-clamp-2">{leave.reason}</p>}
                        <div className="flex flex-wrap justify-end gap-1"><span className="mr-auto self-center text-[11px] text-slate-500">{leave.deductedAt ? "Période clôturée · verrouillée" : "Modifiable avant clôture"}</span>{canEditHrRequests && !leave.deductedAt && leave.status !== "annulé" && <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="Modifier la demande" onClick={() => openLeaveEdit(leave)}><Pencil className="w-3.5 h-3.5" /></Button>}{canCancelHrRequests && !leave.deductedAt && leave.status !== "annulé" && <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50" title="Annuler la demande" onClick={() => handleCancelLeave(leave)} disabled={cancelLeaveMutation.isPending}><X className="w-3.5 h-3.5" /></Button>}{canManageHrRequests && <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50" title="Supprimer la demande" onClick={() => handleDeleteLeave(leave)} disabled={deleteLeaveMutation.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
                      </div>;
                    })}
                    {(!leavesQuery.data || leavesQuery.data.length === 0) && <p className="py-8 text-center text-sm text-slate-500">Aucune demande de congé.</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-amber-600" /> Planning superviseur · Avances</CardTitle><CardDescription>Validez le décaissement après accord RH : la sortie est enregistrée en comptabilité et l’avance passe à « déduit ».</CardDescription></div><Badge variant="outline" className="w-fit border-amber-200 bg-amber-50 text-amber-800">{(advancesQuery.data || []).filter(advance => advance.status === "accordé").length} à décaisser</Badge></div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Mois déduction</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Action comptable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {advancesQuery.data?.map(adv => {
                        const agent = agentsQuery.data?.find(item => item.id === adv.agentId);
                        const canCashOut = canManageHrRequests && adv.status === "accordé";
                        return <TableRow key={adv.id}>
                          <TableCell><div className="font-medium">{agent?.name || `Agent #${adv.agentId}`}</div><div className="text-xs text-slate-500">Demande du {String(adv.requestedDate).slice(0, 10)}</div></TableCell>
                          <TableCell className="font-bold text-indigo-600">{formatMGA(Number(adv.amount), currentEurToMgaRate)}</TableCell>
                          <TableCell>{adv.deductionMonth}</TableCell>
                          <TableCell><Badge variant={adv.status === "déduit" ? "default" : adv.status === "accordé" ? "secondary" : "outline"}>{adv.status}</Badge></TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={!canCashOut || convertAdvanceToTransactionMutation.isPending} onClick={() => handleConvertAdvanceToTransaction(adv)} title={adv.status === "accordé" ? "Enregistrer la sortie de caisse" : "Disponible après validation superviseur"}><WalletCards className="mr-1.5 h-3.5 w-3.5" /> {convertAdvanceToTransactionMutation.isPending ? "Enregistrement…" : "Sortie de caisse"}</Button></TableCell>
                        </TableRow>;
                      })}
                      {(!advancesQuery.data || advancesQuery.data.length === 0) && (
                        <TableRow><TableCell colSpan={5} className="text-center py-4 text-slate-500">Aucune avance en cours.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* MODULE COMPTABILITÉ */}
          <TabsContent value="accounting" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Comptabilité & Trésorerie</h2>
                <p className="text-sm text-slate-500">Entrées et sorties de caisse, reporting CA et exports Excel / CSV</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button onClick={exportAccountingCSV} variant="outline" className="border-slate-300 rounded-xl">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Exporter CSV
                </Button>
                <Button onClick={exportAccountingExcel} variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl">
                  <Download className="w-4 h-4 mr-2" /> Backup Excel
                </Button>
                <Dialog open={isTxOpen} onOpenChange={setIsTxOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                      <Plus className="w-4 h-4 mr-2" /> Nouveau Mouvement
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-white rounded-2xl">
                    <DialogHeader>
                      <DialogTitle>Enregistrer une entrée ou sortie de caisse</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Type de mouvement</Label>
                        <Select value={txForm.type} onValueChange={v => setTxForm({...txForm, type: v as any})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="entrée">Entrée (Recette)</SelectItem>
                            <SelectItem value="sortie">Sortie (Dépense)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Catégorie</Label>
                        <Input value={txForm.category} onChange={e => setTxForm({...txForm, category: e.target.value})} placeholder="Vente client, Loyer, Fournitures..." />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Devise du mouvement</Label>
                          <Select value={txForm.currency} onValueChange={value => setTxForm({ ...txForm, currency: value as CurrencyCode, exchangeRate: value === "MGA" ? (txForm.exchangeRate === "1" ? String(DEFAULT_EUR_TO_MGA) : txForm.exchangeRate) : "1" })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="MGA">Ariary (MGA)</SelectItem><SelectItem value="EUR">Euro (EUR)</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Montant ({txForm.currency})</Label>
                          <Input type="number" min="0" step={txForm.currency === "MGA" ? "1" : "0.01"} value={txForm.amount} onChange={e => setTxForm({...txForm, amount: e.target.value})} placeholder={txForm.currency === "MGA" ? "7500000" : "1500.00"} />
                        </div>
                      </div>
                      {txForm.currency === "MGA" && <div className="space-y-2"><Label>Taux appliqué (1 EUR = MGA)</Label><Input type="number" min="1" step="1" value={txForm.exchangeRate} onChange={e => setTxForm({ ...txForm, exchangeRate: e.target.value })} /><p className="text-[11px] text-slate-500">Le montant de référence sera conservé en EUR pour les rapports consolidés.</p></div>}
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Input type="date" value={txForm.date} onChange={e => setTxForm({...txForm, date: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description détaillée</Label>
                        <Textarea value={txForm.description} onChange={e => setTxForm({...txForm, description: e.target.value})} placeholder="Détail du mouvement..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Note interne comptable</Label>
                        <Textarea value={txForm.internalNote} onChange={e => setTxForm({...txForm, internalNote: e.target.value})} placeholder="Note visible uniquement par l’équipe comptable…" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleCreateTransaction} disabled={createTxMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                        Enregistrer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={isTxEditOpen} onOpenChange={setIsTxEditOpen}>
                  <DialogContent className="max-w-lg bg-white rounded-2xl">
                    <DialogHeader><DialogTitle>Corriger un mouvement comptable</DialogTitle><DialogDescription>Modifiez les informations ou ajoutez une note interne de suivi.</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>Type</Label><Select value={txForm.type} onValueChange={value => setTxForm({ ...txForm, type: value as typeof txForm.type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="entrée">Entrée</SelectItem><SelectItem value="sortie">Sortie</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Devise</Label><Select value={txForm.currency} onValueChange={value => setTxForm({ ...txForm, currency: value as CurrencyCode, exchangeRate: value === "MGA" ? (txForm.exchangeRate === "1" ? String(DEFAULT_EUR_TO_MGA) : txForm.exchangeRate) : "1" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MGA">MGA</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Montant ({txForm.currency})</Label><Input type="number" min="0" step={txForm.currency === "MGA" ? "1" : "0.01"} value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} /></div></div>
                      {txForm.currency === "MGA" && <div className="space-y-2"><Label>Taux EUR/MGA</Label><Input type="number" min="1" step="1" value={txForm.exchangeRate} onChange={e => setTxForm({ ...txForm, exchangeRate: e.target.value })} /></div>}
                      <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Catégorie</Label><Input value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })} /></div><div className="space-y-2"><Label>Date</Label><Input type="date" value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} /></div></div>
                      <div className="space-y-2"><Label>Description</Label><Textarea value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Note interne</Label><Textarea value={txForm.internalNote} onChange={e => setTxForm({ ...txForm, internalNote: e.target.value })} placeholder="Correction, justification ou rappel interne…" /></div>
                    </div>
                    <DialogFooter><Button onClick={handleUpdateTransaction} disabled={updateTxMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{updateTxMutation.isPending ? "Enregistrement…" : "Enregistrer la correction"}</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Journal des Mouvements de Caisse</CardTitle>
                <CardDescription>Détail de chaque flux financier avec justificatifs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Note interne</TableHead>
                      <TableHead>Mode</TableHead>
                              <TableHead className="text-right">Montant / devise</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionsQuery.data?.map(tx => (
                      <TableRow key={tx.id}>
                        <TableCell>{String(tx.date)}</TableCell>
                        <TableCell>
                          <Badge className={tx.type === 'entrée' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}>
                            {tx.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{tx.category}</TableCell>
                        <TableCell className="text-slate-600">{tx.description}</TableCell>
                        <TableCell className="max-w-[220px] text-xs text-slate-500">{tx.internalNote || "—"}</TableCell>
                        <TableCell>{tx.paymentMethod}</TableCell>
                        <TableCell className={`text-right font-bold ${tx.type === 'entrée' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'entrée' ? '+' : '-'}{formatCurrency(Number(tx.amountInCurrency || tx.amount), tx.currency === "MGA" ? "MGA" : "EUR")}
                        </TableCell>
                        <TableCell className="text-right"><Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="Corriger le mouvement" onClick={() => openTransactionEdit(tx)}><Pencil className="w-3.5 h-3.5" /></Button></TableCell>
                      </TableRow>
                    ))}
                    {(!transactionsQuery.data || transactionsQuery.data.length === 0) && (
                      <TableRow><TableCell colSpan={8} className="text-center py-6 text-slate-500">Aucun mouvement enregistré.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE CRM LEADS */}
          <TabsContent value="crm" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">CRM Leads & Opportunités</h2>
                <p className="text-sm text-slate-500">Tableau Kanban dynamique pour qualifier les leads, RDV et montants attendus</p>
              </div>
              <Dialog open={isLeadOpen} onOpenChange={setIsLeadOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                    <Plus className="w-4 h-4 mr-2" /> Nouveau Lead
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Ajouter un nouveau lead au CRM</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Entreprise</Label>
                      <Input value={leadForm.companyName} onChange={e => setLeadForm({...leadForm, companyName: e.target.value})} placeholder="Tech Solutions SA" />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact principal</Label>
                      <Input value={leadForm.contactName} onChange={e => setLeadForm({...leadForm, contactName: e.target.value})} placeholder="Marc Vianney" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={leadForm.email} onChange={e => setLeadForm({...leadForm, email: e.target.value})} placeholder="marc@techsolutions.fr" />
                    </div>
                    <div className="space-y-2">
                      <Label>Montant attendu de la vente (€)</Label>
                      <Input value={leadForm.expectedAmount} onChange={e => setLeadForm({...leadForm, expectedAmount: e.target.value})} placeholder="7500.00" />
                    </div>
                    <div className="space-y-2">
                      <Label>Niveau de priorité</Label>
                      <Select value={leadForm.priority} onValueChange={v => setLeadForm({...leadForm, priority: v as any})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basse">Basse</SelectItem>
                          <SelectItem value="moyenne">Moyenne</SelectItem>
                          <SelectItem value="haute">Haute</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date du prochain contact</Label>
                      <Input type="date" value={leadForm.nextContactDate} onChange={e => setLeadForm({...leadForm, nextContactDate: e.target.value})} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => createLeadMutation.mutate(leadForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                      Ajouter au Kanban
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Vue Kanban Simple */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
              {['nouveau', 'contacté', 'proposition', 'negociation', 'gagne', 'perdu'].map(statusCol => (
                <div key={statusCol} className="bg-slate-100 p-4 rounded-2xl border border-slate-200 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold capitalize text-slate-700">{statusCol}</h3>
                    <Badge variant="outline" className="bg-white">
                      {leadsQuery.data?.filter(l => l.status === statusCol).length || 0}
                    </Badge>
                  </div>
                  <div className="space-y-3 flex-1">
                    {leadsQuery.data?.filter(l => l.status === statusCol).map(lead => (
                      <Card key={lead.id} className="bg-white border-slate-200 shadow-sm p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-slate-900">{lead.companyName}</span>
                          <Badge variant="outline" className="text-xs">{lead.priority}</Badge>
                        </div>
                        <p className="text-xs text-slate-500">Contact : {lead.contactName}</p>
                        <div className="text-sm font-semibold text-indigo-600">
                          {Number(lead.expectedAmount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center pt-1 border-t border-slate-100 justify-between gap-2">
                          <span>RDV : {lead.nextContactDate ? String(lead.nextContactDate) : 'Non planifié'}</span>
                          {statusCol !== 'gagne' && statusCol !== 'perdu' && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-indigo-600 hover:bg-indigo-50" onClick={() => convertLeadMutation.mutate({ leadId: lead.id })}>
                              Convertir → Client
                            </Button>
                          )}
                        </div>
                        {lead.notes && <p className="text-xs text-slate-500 line-clamp-2">Note : {lead.notes}</p>}
                        <div className="flex items-center gap-2 pt-2">
                          <Select value={lead.status} onValueChange={value => updateLeadStatusMutation.mutate({ id: lead.id, status: value as typeof lead.status })}>
                            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Déplacer" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nouveau">Nouveau</SelectItem><SelectItem value="contacté">Contacté</SelectItem><SelectItem value="proposition">Proposition</SelectItem><SelectItem value="negociation">Négociation</SelectItem><SelectItem value="gagne">Gagné</SelectItem><SelectItem value="perdu">Perdu</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="outline" className="h-8 w-8" title="Modifier les informations et les notes" onClick={() => { setEditingLeadId(lead.id); setLeadEditForm({ companyName: lead.companyName, contactName: lead.contactName, email: lead.email, phone: lead.phone || "", expectedAmount: String(lead.expectedAmount), priority: lead.priority, status: lead.status, nextContactDate: lead.nextContactDate ? String(lead.nextContactDate).slice(0, 10) : "", notes: lead.notes || "" }); setIsLeadEditOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Dialog open={isLeadEditOpen} onOpenChange={setIsLeadEditOpen}>
              <DialogContent className="max-w-2xl bg-white rounded-2xl">
                <DialogHeader><DialogTitle>Modifier le lead</DialogTitle><DialogDescription>Mettez à jour les informations, le statut commercial et les notes de suivi.</DialogDescription></DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="space-y-2"><Label>Entreprise / client</Label><Input value={leadEditForm.companyName} onChange={e => setLeadEditForm({ ...leadEditForm, companyName: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Contact</Label><Input value={leadEditForm.contactName} onChange={e => setLeadEditForm({ ...leadEditForm, contactName: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={leadEditForm.email} onChange={e => setLeadEditForm({ ...leadEditForm, email: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Téléphone</Label><Input value={leadEditForm.phone} onChange={e => setLeadEditForm({ ...leadEditForm, phone: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Montant attendu (€)</Label><Input type="number" min="0" value={leadEditForm.expectedAmount} onChange={e => setLeadEditForm({ ...leadEditForm, expectedAmount: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Prochain contact</Label><Input type="date" value={leadEditForm.nextContactDate} onChange={e => setLeadEditForm({ ...leadEditForm, nextContactDate: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Priorité</Label><Select value={leadEditForm.priority} onValueChange={value => setLeadEditForm({ ...leadEditForm, priority: value as typeof leadEditForm.priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basse">Basse</SelectItem><SelectItem value="moyenne">Moyenne</SelectItem><SelectItem value="haute">Haute</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Étape du pipeline</Label><Select value={leadEditForm.status} onValueChange={value => setLeadEditForm({ ...leadEditForm, status: value as typeof leadEditForm.status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nouveau">Nouveau</SelectItem><SelectItem value="contacté">Contacté</SelectItem><SelectItem value="proposition">Proposition</SelectItem><SelectItem value="negociation">Négociation</SelectItem><SelectItem value="gagne">Gagné</SelectItem><SelectItem value="perdu">Perdu</SelectItem></SelectContent></Select></div>
                  <div className="col-span-2 space-y-2"><Label>Notes de suivi</Label><Textarea value={leadEditForm.notes} onChange={e => setLeadEditForm({ ...leadEditForm, notes: e.target.value })} placeholder="Compte rendu d’appel, objections, prochaine action…" /></div>
                </div>
                <DialogFooter><Button disabled={!editingLeadId || updateLeadMutation.isPending} onClick={() => editingLeadId && updateLeadMutation.mutate({ id: editingLeadId, ...leadEditForm })} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{updateLeadMutation.isPending ? "Enregistrement…" : "Enregistrer les modifications"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* BASE CLIENTS */}
          <TabsContent value="clients" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Base Clients & Historique</h2>
                <p className="text-sm text-slate-500">Fiches détaillées, historique des échanges, documents et factures</p>
              </div>
              <Dialog open={isClientOpen} onOpenChange={setIsClientOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                    <UserPlus className="w-4 h-4 mr-2" /> Nouveau Client
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Ajouter un client à la base</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Entreprise / Client</Label>
                      <Input value={clientForm.companyName} onChange={e => setClientForm({...clientForm, companyName: e.target.value})} placeholder="Acme Corp" />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact principal</Label>
                      <Input value={clientForm.contactName} onChange={e => setClientForm({...clientForm, contactName: e.target.value})} placeholder="Alice Martin" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={clientForm.email} onChange={e => setClientForm({...clientForm, email: e.target.value})} placeholder="alice@acme.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Téléphone</Label>
                      <Input value={clientForm.phone} onChange={e => setClientForm({...clientForm, phone: e.target.value})} placeholder="01 42 00 00 00" />
                    </div>
                    <div className="space-y-2">
                      <Label>Catégorie</Label>
                      <Select value={clientForm.category} onValueChange={v => setClientForm({...clientForm, category: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Standard">Standard</SelectItem>
                          <SelectItem value="VIP">VIP</SelectItem>
                          <SelectItem value="Partenaire">Partenaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => createClientMutation.mutate(clientForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                      Enregistrer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clientsQuery.data?.map(client => {
                const invoiceCount = invoicesQuery.data?.filter(invoice => invoice.clientId === client.id).length || 0;
                const documentCount = documentsQuery.data?.filter(document => document.entityId === client.id).length || 0;
                return (
                  <Card key={client.id} className="border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-lg text-slate-900">{client.companyName}</CardTitle>
                          <CardDescription className="mt-1">{client.contactName}</CardDescription>
                        </div>
                        <Badge variant="outline" className="shrink-0">{client.category}</Badge>
                      </div>
                      <Badge className="w-fit bg-emerald-100 text-emerald-800">{client.status}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5 text-sm text-slate-600">
                        <p className="truncate">{client.email}</p>
                        <p>{client.phone || "Téléphone non renseigné"}</p>
                        <p className="line-clamp-2 text-xs text-slate-500">{client.address || "Adresse non renseignée"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                        <div><p className="text-lg font-bold text-slate-900">{invoiceCount}</p><p className="text-[11px] uppercase tracking-wide text-slate-500">Factures</p></div>
                        <div><p className="text-lg font-bold text-slate-900">{documentCount}</p><p className="text-[11px] uppercase tracking-wide text-slate-500">Documents</p></div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openClientEdit(client)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifier</Button>
                        <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-500" onClick={() => openClientHistory(client.id)}><FileText className="mr-1.5 h-3.5 w-3.5" /> Historique</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {(!clientsQuery.data || clientsQuery.data.length === 0) && <Card className="border-dashed border-slate-300 bg-white md:col-span-2 xl:col-span-3"><CardContent className="py-12 text-center text-slate-500">Aucun client enregistré.</CardContent></Card>}
            </div>

            <Dialog open={isClientEditOpen} onOpenChange={setIsClientEditOpen}>
              <DialogContent className="max-w-2xl rounded-2xl bg-white">
                <DialogHeader><DialogTitle>Modifier les informations client</DialogTitle><DialogDescription>Les changements sont limités au projet actif et seront réutilisés dans les prochains documents.</DialogDescription></DialogHeader>
                <div className="grid gap-4 py-3 md:grid-cols-2">
                  <div className="space-y-2"><Label>Entreprise / Client</Label><Input value={clientEditForm.companyName} onChange={event => setClientEditForm({ ...clientEditForm, companyName: event.target.value })} /></div>
                  <div className="space-y-2"><Label>Contact principal</Label><Input value={clientEditForm.contactName} onChange={event => setClientEditForm({ ...clientEditForm, contactName: event.target.value })} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={clientEditForm.email} onChange={event => setClientEditForm({ ...clientEditForm, email: event.target.value })} /></div>
                  <div className="space-y-2"><Label>Téléphone</Label><Input value={clientEditForm.phone} onChange={event => setClientEditForm({ ...clientEditForm, phone: event.target.value })} /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Adresse</Label><Input value={clientEditForm.address} onChange={event => setClientEditForm({ ...clientEditForm, address: event.target.value })} /></div>
                  <div className="space-y-2"><Label>Secteur</Label><Input value={clientEditForm.industry} onChange={event => setClientEditForm({ ...clientEditForm, industry: event.target.value })} /></div>
                  <div className="space-y-2"><Label>Catégorie</Label><Select value={clientEditForm.category} onValueChange={value => setClientEditForm({ ...clientEditForm, category: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Standard">Standard</SelectItem><SelectItem value="VIP">VIP</SelectItem><SelectItem value="Partenaire">Partenaire</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2 md:col-span-2"><Label>Notes internes</Label><Textarea value={clientEditForm.notes} onChange={event => setClientEditForm({ ...clientEditForm, notes: event.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => editingClientId && updateClientMutation.mutate({ id: editingClientId, ...clientEditForm })} disabled={!editingClientId || updateClientMutation.isPending} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500">{updateClientMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isClientHistoryOpen} onOpenChange={open => { setIsClientHistoryOpen(open); if (!open) setSelectedClientId(null); }}>
              <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto rounded-2xl bg-white">
                <DialogHeader><DialogTitle>Historique client</DialogTitle><DialogDescription>{clientsQuery.data?.find(client => client.id === selectedClientId)?.companyName || "Client sélectionné"} · factures, devis, avoirs, documents et échanges associés.</DialogDescription></DialogHeader>
                {clientHistoryQuery.isLoading ? <div className="py-10 text-center text-sm text-slate-500">Chargement de l’historique…</div> : <div className="space-y-5 py-2">
                  <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-indigo-50 p-3"><p className="text-xl font-bold text-indigo-900">{clientHistoryQuery.data?.invoices.length || 0}</p><p className="text-xs text-indigo-700">Factures</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold text-slate-900">{clientHistoryQuery.data?.quotes.length || 0}</p><p className="text-xs text-slate-600">Devis</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xl font-bold text-amber-900">{clientHistoryQuery.data?.creditNotes.length || 0}</p><p className="text-xs text-amber-700">Avoirs</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xl font-bold text-emerald-900">{clientHistoryQuery.data?.documents.length || 0}</p><p className="text-xs text-emerald-700">Documents</p></div></div>
                  <div className="space-y-2"><h3 className="font-semibold text-slate-900">Factures et avoirs</h3>{(clientHistoryQuery.data?.invoices.length || 0) + (clientHistoryQuery.data?.creditNotes.length || 0) === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Aucun document de facturation lié.</p> : <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Référence</TableHead><TableHead>Date</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader><TableBody>{clientHistoryQuery.data?.invoices.map(invoice => <TableRow key={`invoice-${invoice.id}`}><TableCell>Facture</TableCell><TableCell className="font-semibold">{invoice.invoiceNumber}</TableCell><TableCell>{String(invoice.issueDate).slice(0, 10)}</TableCell><TableCell>{formatCurrency(Number(invoice.totalAmount || 0), invoice.currency as CurrencyCode)}</TableCell><TableCell><Badge variant="outline">{invoice.status}</Badge></TableCell></TableRow>)}{clientHistoryQuery.data?.creditNotes.map(note => <TableRow key={`credit-${note.id}`}><TableCell>Avoir</TableCell><TableCell className="font-semibold">{note.creditNoteNumber}</TableCell><TableCell>{String(note.createdAt).slice(0, 10)}</TableCell><TableCell className="text-rose-700">-{formatCurrency(Number(note.amount || 0), note.currency as CurrencyCode)}</TableCell><TableCell><Badge variant="outline">{note.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}</div>
                  <div className="grid gap-5 md:grid-cols-2"><div className="space-y-2"><h3 className="font-semibold text-slate-900">Documents associés</h3>{clientHistoryQuery.data?.documents.length ? clientHistoryQuery.data.documents.map(document => <a key={document.id} href={document.fileUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border p-3 text-sm hover:bg-slate-50"><span className="truncate">{document.title}</span><ExternalLink className="ml-2 h-4 w-4 shrink-0 text-indigo-600" /></a>) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Aucun document associé.</p>}</div><div className="space-y-2"><h3 className="font-semibold text-slate-900">Échanges</h3>{clientHistoryQuery.data?.interactions.length ? clientHistoryQuery.data.interactions.map(interaction => <div key={interaction.id} className="rounded-xl border p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{interaction.type}</span><span className="text-xs text-slate-500">{String(interaction.date).slice(0, 10)}</span></div><p className="mt-1 text-slate-600">{interaction.summary}</p></div>) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Aucun échange enregistré.</p>}</div></div>
                </div>}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* CATALOGUE */}
          <TabsContent value="catalog" className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div><h2 className="text-2xl font-bold tracking-tight">Catalogue produits & prestations</h2><p className="text-sm text-slate-500">Centralisez vos offres réutilisables dans les devis et factures, avec tarif, devise, récurrence et description client.</p></div>
              <Dialog open={isCatalogOpen} onOpenChange={setIsCatalogOpen}>
                <DialogTrigger asChild><Button onClick={() => { setEditingCatalogId(null); setCatalogForm({ itemType: "prestation", label: "", description: "", unit: "unité", unitPrice: "0", currency: "MGA", pricingMode: "ponctuel", taxRate: "0", clientVisible: true, status: "actif" }); }} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500"><Plus className="mr-2 h-4 w-4" /> Ajouter au catalogue</Button></DialogTrigger>
                <DialogContent className="max-w-2xl rounded-2xl bg-white">
                  <DialogHeader><DialogTitle>{editingCatalogId ? "Modifier l’élément" : "Nouvel élément catalogue"}</DialogTitle><DialogDescription>Les descriptions visibles client seront reprises dans les lignes commerciales.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-3 md:grid-cols-2">
                    <div className="space-y-2"><Label>Type</Label><Select value={catalogForm.itemType} onValueChange={value => setCatalogForm({ ...catalogForm, itemType: value as "produit" | "prestation" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prestation">Prestation</SelectItem><SelectItem value="produit">Produit</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label>Mode de tarification</Label><Select value={catalogForm.pricingMode} onValueChange={value => setCatalogForm({ ...catalogForm, pricingMode: value as "ponctuel" | "récurrent" | "mensuel" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ponctuel">Ponctuel</SelectItem><SelectItem value="récurrent">Récurrent</SelectItem><SelectItem value="mensuel">Mensuel</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2 md:col-span-2"><Label>Libellé</Label><Input value={catalogForm.label} onChange={event => setCatalogForm({ ...catalogForm, label: event.target.value })} placeholder="Audit digital, abonnement support…" /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Description visible par le client</Label><Textarea value={catalogForm.description} onChange={event => setCatalogForm({ ...catalogForm, description: event.target.value })} placeholder="Décrivez précisément le périmètre livré." /></div>
                    <div className="space-y-2"><Label>Unité</Label><Input value={catalogForm.unit} onChange={event => setCatalogForm({ ...catalogForm, unit: event.target.value })} placeholder="heure, forfait, mois…" /></div>
                    <div className="space-y-2"><Label>Tarif unitaire</Label><Input inputMode="decimal" value={catalogForm.unitPrice} onChange={event => setCatalogForm({ ...catalogForm, unitPrice: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Devise</Label><Select value={catalogForm.currency} onValueChange={value => setCatalogForm({ ...catalogForm, currency: value as CurrencyCode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MGA">Ariary (MGA)</SelectItem><SelectItem value="EUR">Euro (EUR)</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label>TVA par défaut (%)</Label><Input inputMode="decimal" value={catalogForm.taxRate} onChange={event => setCatalogForm({ ...catalogForm, taxRate: event.target.value })} /></div>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 md:col-span-2"><Switch checked={catalogForm.clientVisible} onCheckedChange={value => setCatalogForm({ ...catalogForm, clientVisible: value })} id="catalog-client-visible" /><Label htmlFor="catalog-client-visible" className="cursor-pointer">Description visible sur les documents client</Label></div>
                  </div>
                  <DialogFooter><Button onClick={() => editingCatalogId ? updateCatalogItemMutation.mutate({ id: editingCatalogId, ...catalogForm }) : createCatalogItemMutation.mutate(catalogForm)} disabled={createCatalogItemMutation.isPending || updateCatalogItemMutation.isPending} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500">{createCatalogItemMutation.isPending || updateCatalogItemMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Card className="border-slate-200 bg-white shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Libellé</TableHead><TableHead>Description client</TableHead><TableHead>Tarif</TableHead><TableHead>Mode</TableHead><TableHead>TVA</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{catalogItemsQuery.data?.map(item => <TableRow key={item.id} className={item.status === "inactif" ? "opacity-55" : ""}><TableCell><Badge variant="outline">{item.itemType}</Badge></TableCell><TableCell className="font-semibold text-slate-900">{item.label}</TableCell><TableCell className="max-w-xs text-xs text-slate-500">{item.description || "—"}</TableCell><TableCell className="font-semibold">{formatCurrency(Number(item.unitPrice), item.currency as CurrencyCode)} <span className="text-xs font-normal text-slate-500">/ {item.unit}</span></TableCell><TableCell>{item.pricingMode}</TableCell><TableCell>{Number(item.taxRate).toLocaleString("fr-FR")} %</TableCell><TableCell><Badge className={item.status === "actif" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>{item.status}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingCatalogId(item.id); setCatalogForm({ itemType: item.itemType, label: item.label, description: item.description || "", unit: item.unit, unitPrice: String(item.unitPrice), currency: item.currency as CurrencyCode, pricingMode: item.pricingMode, taxRate: String(item.taxRate), clientVisible: Boolean(item.clientVisible), status: item.status }); setIsCatalogOpen(true); }}><Pencil className="mr-1 h-3.5 w-3.5" /> Modifier</Button>{item.status === "actif" && <Button size="sm" variant="outline" onClick={() => archiveCatalogItemMutation.mutate({ id: item.id })} className="border-rose-200 text-rose-700 hover:bg-rose-50"><Trash2 className="mr-1 h-3.5 w-3.5" /> Archiver</Button>}</div></TableCell></TableRow>)}{(!catalogItemsQuery.data || catalogItemsQuery.data.length === 0) && <TableRow><TableCell colSpan={8} className="py-12 text-center text-slate-500">Le catalogue est vide. Ajoutez votre première prestation ou votre premier produit.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
          </TabsContent>

          {/* FACTURATION ET DEVIS */}
          <TabsContent value="billing" className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Facturation & Devis</h2>
                <p className="text-sm text-slate-500">Documents structurés avec catalogue, remises, TVA et profils France/Madagascar.</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span className="font-semibold text-slate-700">1 EUR =</span><Input className="h-8 w-24 bg-white" inputMode="decimal" value={eurToMgaRate} onChange={event => setEurToMgaRate(event.target.value.replace(/[^0-9.]/g, ""))} aria-label="Taux euro vers ariary" /><span className="font-semibold text-slate-700">MGA</span><span>Taux de référence modifiable</span><span className="ml-2 h-4 w-px bg-slate-200" /><div className="flex items-center gap-2"><Switch checked={showMGAEquivalent} onCheckedChange={setShowMGAEquivalent} id="show-mga-equivalent" /><Label htmlFor="show-mga-equivalent" className="cursor-pointer font-semibold text-slate-700">Afficher l’équivalent</Label></div></div>
              </div>
              <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setQuoteForm({ ...quoteForm, quoteNumber: nextQuoteNumberQuery.data || quoteForm.quoteNumber }); setIsQuoteOpen(true); }} className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50"><FileText className="mr-2 h-4 w-4" /> Créer un devis</Button><Button onClick={() => { setEditingInvoiceId(null); setInvoiceForm({ ...invoiceForm, invoiceNumber: nextInvoiceNumberQuery.data || invoiceForm.invoiceNumber }); setIsInvoiceOpen(true); }} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500"><Plus className="mr-2 h-4 w-4" /> Nouvelle facture</Button></div>
            </div>

            <Dialog open={isQuoteOpen} onOpenChange={setIsQuoteOpen}>
              <DialogContent className="max-w-4xl rounded-2xl bg-white"><DialogHeader><DialogTitle>Créer un devis professionnel</DialogTitle><DialogDescription>Ajoutez des lignes depuis le catalogue ou saisissez-les manuellement.</DialogDescription></DialogHeader>
                <div className="grid gap-4 py-3 md:grid-cols-2"><div className="space-y-2"><Label>Numéro du devis</Label><Input value={quoteForm.quoteNumber} onChange={event => setQuoteForm({ ...quoteForm, quoteNumber: event.target.value })} /></div><div className="space-y-2"><Label>Client</Label><Select value={String(quoteForm.clientId)} onValueChange={value => setQuoteForm({ ...quoteForm, clientId: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clientsQuery.data?.map(client => <SelectItem key={client.id} value={String(client.id)}>{client.companyName}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Date d’émission</Label><Input type="date" value={quoteForm.issueDate} onChange={event => setQuoteForm({ ...quoteForm, issueDate: event.target.value })} /></div><div className="space-y-2"><Label>Valable jusqu’au</Label><Input type="date" value={quoteForm.validUntil} onChange={event => setQuoteForm({ ...quoteForm, validUntil: event.target.value })} /></div><div className="space-y-2"><Label>Devise</Label><Select value={quoteForm.currency} onValueChange={value => { const currency = value as CurrencyCode; setQuoteForm({ ...quoteForm, currency }); setQuoteLines(lines => lines.map(line => ({ ...line, currency }))); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EUR">Euro (EUR)</SelectItem><SelectItem value="MGA">Ariary (MGA)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Profil légal</Label><Select value={quoteForm.documentProfile} onValueChange={value => setQuoteForm({ ...quoteForm, documentProfile: value as "fr" | "mg" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fr">France</SelectItem><SelectItem value="mg">Madagascar</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Remise globale</Label><div className="flex gap-2"><Select value={quoteForm.discountType} onValueChange={value => setQuoteForm({ ...quoteForm, discountType: value as "none" | "percent" | "fixed" })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Aucune</SelectItem><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">Montant</SelectItem></SelectContent></Select><Input inputMode="decimal" value={quoteForm.discountValue} onChange={event => setQuoteForm({ ...quoteForm, discountValue: event.target.value })} disabled={quoteForm.discountType === "none"} /></div></div><div className="space-y-2"><Label>TVA globale (%)</Label><Input inputMode="decimal" value={quoteForm.taxRate} onChange={event => setQuoteForm({ ...quoteForm, taxRate: event.target.value })} /></div></div>
                <div className="space-y-3"><div className="flex items-center justify-between"><Label className="font-semibold">Lignes du devis</Label><Button type="button" size="sm" variant="outline" onClick={() => setQuoteLines(lines => [...lines, emptyBillingLine(quoteForm.currency)])}><Plus className="mr-1 h-3.5 w-3.5" /> Ligne</Button></div>{quoteLines.map((line, index) => <div key={`quote-line-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid gap-2 md:grid-cols-[1.3fr_0.55fr_0.65fr_0.75fr_auto]"><Select value={line.catalogItemId ? String(line.catalogItemId) : `manual-quote-${index}`} onValueChange={value => { const item = catalogItemsQuery.data?.find(candidate => String(candidate.id) === value); if (!item) return; setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, catalogItemId: item.id, label: item.label, description: item.clientVisible ? item.description || "" : "", unit: item.unit, unitPrice: String(item.unitPrice), currency: item.currency as CurrencyCode, taxRate: String(item.taxRate) } : current)); }}><SelectTrigger className="bg-white"><SelectValue placeholder="Choisir prestation / service" /></SelectTrigger><SelectContent><SelectItem value={`manual-quote-${index}`}>Saisie manuelle</SelectItem>{catalogItemsQuery.data?.filter(item => item.status === "actif" && item.currency === quoteForm.currency).map(item => <SelectItem key={item.id} value={String(item.id)}>{item.itemType === "prestation" ? "Prestation" : "Produit"} · {item.label} · {formatCurrency(Number(item.unitPrice), item.currency as CurrencyCode)}</SelectItem>)}</SelectContent></Select><Input value={line.label} onChange={event => setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, label: event.target.value, catalogItemId: undefined } : current))} placeholder="Désignation" className="bg-white" /><Input inputMode="decimal" value={line.quantity} onChange={event => setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, quantity: event.target.value } : current))} placeholder="Qté" className="bg-white" /><Input inputMode="decimal" value={line.unitPrice} onChange={event => setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, unitPrice: event.target.value } : current))} placeholder="Prix HT" className="bg-white" />{quoteLines.length > 1 && <Button type="button" size="icon" variant="outline" title="Supprimer cette ligne" aria-label={`Supprimer la ligne ${index + 1}`} className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setQuoteLines(lines => lines.filter((_, row) => row !== index))}><Trash2 className="h-4 w-4" /></Button>}</div><div className="mt-2 grid gap-2 md:grid-cols-[1fr_0.7fr_0.8fr]"><Input value={line.description} onChange={event => setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, description: event.target.value } : current))} placeholder="Description client" className="bg-white" /><Input inputMode="decimal" value={line.taxRate} onChange={event => setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, taxRate: event.target.value } : current))} placeholder="TVA ligne %" className="bg-white" /><div className="flex gap-2"><Select value={line.discountType} onValueChange={value => setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, discountType: value as BillingLine["discountType"] } : current))}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sans remise</SelectItem><SelectItem value="percent">Remise %</SelectItem><SelectItem value="fixed">Remise montant</SelectItem></SelectContent></Select><Input inputMode="decimal" value={line.discountValue} onChange={event => setQuoteLines(lines => lines.map((current, row) => row === index ? { ...current, discountValue: event.target.value } : current))} disabled={line.discountType === "none"} className="bg-white" /></div></div></div>)}</div>
                <div className="mt-4 flex justify-end"><div className="w-72 space-y-1 text-right text-sm"><div className="flex justify-between"><span className="text-slate-500">Sous-total HT</span><span>{formatCurrency(quoteTotals.subtotal, quoteForm.currency)}</span></div><div className="flex justify-between text-rose-600"><span>Remise</span><span>- {formatCurrency(quoteTotals.discount, quoteForm.currency)}</span></div><div className="flex justify-between"><span className="text-slate-500">TVA</span><span>{formatCurrency(quoteTotals.tax, quoteForm.currency)}</span></div><div className="flex justify-between border-t border-slate-900 pt-2 text-base font-black"><span>Total TTC</span><span>{formatCurrency(quoteTotals.total, quoteForm.currency)}</span></div></div></div><div className="grid gap-4 py-4"><div className="space-y-2"><Label>Notes</Label><Textarea value={quoteForm.notes} onChange={event => setQuoteForm({ ...quoteForm, notes: event.target.value })} /></div><div className="space-y-2"><Label>CGV</Label><Textarea value={quoteForm.termsAndConditions} onChange={event => setQuoteForm({ ...quoteForm, termsAndConditions: event.target.value })} placeholder="Validité, paiement, pénalités, propriété intellectuelle…" /></div></div><DialogFooter><Button onClick={() => createQuoteMutation.mutate({ ...quoteForm, itemsJson: serializeBillingLines(quoteLines) })} disabled={createQuoteMutation.isPending} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500">{createQuoteMutation.isPending ? "Création…" : "Enregistrer le devis"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-2xl bg-white"><DialogHeader><DialogTitle>{editingInvoiceId ? "Modifier la facture brouillon" : "Créer une facture professionnelle"}</DialogTitle><DialogDescription>Construisez un document clair en trois étapes. Le brouillon reste modifiable jusqu’à sa confirmation.</DialogDescription></DialogHeader><div className="grid gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-900 sm:grid-cols-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">1</span><span><strong>Document</strong><span className="block text-indigo-700/80">Client, dates et profil</span></span></div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">2</span><span><strong>Lignes</strong><span className="block text-indigo-700/80">Catalogue, quantités et remises</span></span></div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">3</span><span><strong>Vérification</strong><span className="block text-indigo-700/80">Totaux et enregistrement</span></span></div></div><div className="grid gap-4 py-3 md:grid-cols-2"><div className="space-y-2"><Label>Numéro de facture</Label><Input value={invoiceForm.invoiceNumber} disabled={Boolean(editingInvoiceId)} onChange={event => setInvoiceForm({ ...invoiceForm, invoiceNumber: event.target.value })} /></div><div className="space-y-2"><Label>Client</Label><Select value={String(invoiceForm.clientId)} onValueChange={value => setInvoiceForm({ ...invoiceForm, clientId: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clientsQuery.data?.map(client => <SelectItem key={client.id} value={String(client.id)}>{client.companyName}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Date d’émission</Label><Input type="date" value={invoiceForm.issueDate} onChange={event => setInvoiceForm({ ...invoiceForm, issueDate: event.target.value })} /></div><div className="space-y-2"><Label>Date d’échéance</Label><Input type="date" value={invoiceForm.dueDate} onChange={event => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })} /></div><div className="space-y-2"><Label>Devise</Label><Select value={invoiceForm.currency} onValueChange={value => { const currency = value as CurrencyCode; setInvoiceForm({ ...invoiceForm, currency }); setInvoiceLines(lines => lines.map(line => ({ ...line, currency }))); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EUR">Euro (EUR)</SelectItem><SelectItem value="MGA">Ariary (MGA)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Profil légal</Label><Select value={invoiceForm.documentProfile} onValueChange={value => setInvoiceForm({ ...invoiceForm, documentProfile: value as "fr" | "mg" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fr">France</SelectItem><SelectItem value="mg">Madagascar</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Remise globale</Label><div className="flex gap-2"><Select value={invoiceForm.discountType} onValueChange={value => setInvoiceForm({ ...invoiceForm, discountType: value as "none" | "percent" | "fixed" })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Aucune</SelectItem><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">Montant</SelectItem></SelectContent></Select><Input inputMode="decimal" value={invoiceForm.discountValue} onChange={event => setInvoiceForm({ ...invoiceForm, discountValue: event.target.value })} disabled={invoiceForm.discountType === "none"} /></div></div><div className="space-y-2"><Label>TVA globale (%)</Label><Input inputMode="decimal" value={invoiceForm.taxRate} onChange={event => setInvoiceForm({ ...invoiceForm, taxRate: event.target.value })} /></div></div><div className="space-y-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><Label className="font-semibold">Lignes de facture</Label><p className="text-xs text-slate-500">Choisissez une prestation ou un service du catalogue, ou saisissez une ligne manuellement juste à côté.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setInvoiceLines(lines => [...lines, emptyBillingLine(invoiceForm.currency)])}><Plus className="mr-1 h-3.5 w-3.5" /> Ligne</Button></div>{invoiceLines.map((line, index) => <div key={`invoice-line-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid gap-2 md:grid-cols-[1.3fr_0.55fr_0.65fr_0.75fr_auto]"><Select value={line.catalogItemId ? String(line.catalogItemId) : `manual-invoice-${index}`} onValueChange={value => { const item = catalogItemsQuery.data?.find(candidate => String(candidate.id) === value); if (!item) { setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, catalogItemId: undefined } : current)); return; } setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, catalogItemId: item.id, label: item.label, description: item.clientVisible ? item.description || "" : "", unit: item.unit, unitPrice: String(item.unitPrice), currency: item.currency as CurrencyCode, taxRate: String(item.taxRate) } : current)); }}><SelectTrigger className="bg-white"><SelectValue placeholder="Choisir prestation / service" /></SelectTrigger><SelectContent><SelectItem value={`manual-invoice-${index}`}>Saisie manuelle</SelectItem>{catalogItemsQuery.data?.filter(item => item.status === "actif" && item.currency === invoiceForm.currency).map(item => <SelectItem key={item.id} value={String(item.id)}>{item.itemType === "prestation" ? "Prestation" : "Produit"} · {item.label} · {formatCurrency(Number(item.unitPrice), item.currency as CurrencyCode)}</SelectItem>)}</SelectContent></Select><Input value={line.label} onChange={event => setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, label: event.target.value, catalogItemId: undefined } : current))} placeholder="Désignation" className="bg-white" /><Input inputMode="decimal" value={line.quantity} onChange={event => setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, quantity: event.target.value } : current))} placeholder="Qté" className="bg-white" /><Input inputMode="decimal" value={line.unitPrice} onChange={event => setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, unitPrice: event.target.value } : current))} placeholder="Prix HT" className="bg-white" />{invoiceLines.length > 1 && <Button type="button" size="icon" variant="outline" title="Supprimer cette ligne" aria-label={`Supprimer la ligne ${index + 1}`} className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setInvoiceLines(lines => lines.filter((_, row) => row !== index))}><Trash2 className="h-4 w-4" /></Button>}</div><div className="mt-2 grid gap-2 md:grid-cols-[1fr_0.7fr_0.8fr]"><Input value={line.description} onChange={event => setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, description: event.target.value } : current))} placeholder="Description client" className="bg-white" /><Input inputMode="decimal" value={line.taxRate} onChange={event => setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, taxRate: event.target.value } : current))} placeholder="TVA ligne %" className="bg-white" /><div className="flex gap-2"><Select value={line.discountType} onValueChange={value => setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, discountType: value as BillingLine["discountType"] } : current))}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sans remise</SelectItem><SelectItem value="percent">Remise %</SelectItem><SelectItem value="fixed">Remise montant</SelectItem></SelectContent></Select><Input inputMode="decimal" value={line.discountValue} onChange={event => setInvoiceLines(lines => lines.map((current, row) => row === index ? { ...current, discountValue: event.target.value } : current))} disabled={line.discountType === "none"} className="bg-white" /></div></div></div>)}</div><div className="mt-4 flex justify-end"><div className="w-72 space-y-1 text-right text-sm"><div className="flex justify-between"><span className="text-slate-500">Sous-total HT</span><span>{formatCurrency(invoiceTotals.subtotal, invoiceForm.currency)}</span></div><div className="flex justify-between text-rose-600"><span>Remise</span><span>- {formatCurrency(invoiceTotals.discount, invoiceForm.currency)}</span></div><div className="flex justify-between"><span className="text-slate-500">TVA</span><span>{formatCurrency(invoiceTotals.tax, invoiceForm.currency)}</span></div><div className="flex justify-between border-t border-slate-900 pt-2 text-base font-black"><span>Total TTC</span><span>{formatCurrency(invoiceTotals.total, invoiceForm.currency)}</span></div></div></div><div className="grid gap-4 py-4"><div className="space-y-2"><Label>Notes et conditions de règlement</Label><Textarea value={invoiceForm.notes} onChange={event => setInvoiceForm({ ...invoiceForm, notes: event.target.value })} /></div><div className="space-y-2"><Label>CGV</Label><Textarea value={invoiceForm.termsAndConditions} onChange={event => setInvoiceForm({ ...invoiceForm, termsAndConditions: event.target.value })} placeholder="Délais de paiement, pénalités, indemnité forfaitaire, propriété intellectuelle…" /></div></div><DialogFooter><Button onClick={() => editingInvoiceId ? updateInvoiceDraftMutation.mutate({ id: editingInvoiceId, invoiceNumber: invoiceForm.invoiceNumber, clientId: invoiceForm.clientId, quoteId: invoiceForm.quoteId, issueDate: invoiceForm.issueDate, dueDate: invoiceForm.dueDate, itemsJson: serializeBillingLines(invoiceLines), currency: invoiceForm.currency, documentProfile: invoiceForm.documentProfile, discountType: invoiceForm.discountType, discountValue: invoiceForm.discountValue, taxRate: invoiceForm.taxRate, notes: invoiceForm.notes, termsAndConditions: invoiceForm.termsAndConditions }) : createInvoiceMutation.mutate({ ...invoiceForm, itemsJson: serializeBillingLines(invoiceLines) })} disabled={createInvoiceMutation.isPending || updateInvoiceDraftMutation.isPending} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500">{editingInvoiceId ? "Enregistrer le brouillon" : "Créer la facture"}</Button></DialogFooter></DialogContent></Dialog>

            <Dialog open={invoiceCashConversion !== null} onOpenChange={open => { if (!open) setInvoiceCashConversion(null); }}><DialogContent className="max-w-md rounded-2xl bg-white"><DialogHeader><DialogTitle>Convertir la facture payée en entrée de caisse</DialogTitle><DialogDescription>{invoiceCashConversion?.number} sera enregistré comme une recette comptable.</DialogDescription></DialogHeader><div className="space-y-4 py-4"><div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Montant de référence : <strong>{Number(invoiceCashConversion?.totalAmount || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</strong></div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Devise de l’entrée</Label><Select value={invoiceCashCurrency} onValueChange={value => setInvoiceCashCurrency(value as CurrencyCode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MGA">Ariary (MGA)</SelectItem><SelectItem value="EUR">Euro (EUR)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Mode de paiement</Label><Input value={invoiceCashPaymentMethod} onChange={event => setInvoiceCashPaymentMethod(event.target.value)} placeholder="Virement, espèces…" /></div></div>{invoiceCashCurrency === "MGA" && <div className="space-y-2"><Label>Taux appliqué (1 EUR = MGA)</Label><Input type="number" min="1" step="1" value={invoiceCashRate} onChange={event => setInvoiceCashRate(event.target.value)} /></div>}<p className="text-sm text-slate-600">Montant à enregistrer : <strong>{invoiceCashCurrency === "MGA" ? `${convertEurToMga(Number(invoiceCashConversion?.totalAmount || 0), Number(invoiceCashRate) || DEFAULT_EUR_TO_MGA).toLocaleString("fr-FR")} Ar` : Number(invoiceCashConversion?.totalAmount || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</strong></p></div><DialogFooter><Button onClick={() => { if (!invoiceCashConversion) return; if (invoiceCashCurrency === "MGA" && (!Number.isFinite(Number(invoiceCashRate)) || Number(invoiceCashRate) <= 0)) { toast.error("Indiquez un taux EUR/MGA positif."); return; } convertPaidInvoiceMutation.mutate({ invoiceId: invoiceCashConversion.id, currency: invoiceCashCurrency, exchangeRate: invoiceCashCurrency === "MGA" ? invoiceCashRate : "1", paymentMethod: invoiceCashPaymentMethod.trim() || "Virement" }); }} disabled={convertPaidInvoiceMutation.isPending} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500">{convertPaidInvoiceMutation.isPending ? "Conversion…" : "Ajouter à la caisse"}</Button></DialogFooter></DialogContent></Dialog>

            <Card className="border-slate-200 bg-white shadow-sm"><CardHeader><CardTitle>Factures structurées</CardTitle><CardDescription>Les totaux affichent le montant HT, la remise, la TVA et le TTC. Les brouillons restent modifiables.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Client</TableHead><TableHead>Dates</TableHead><TableHead>HT</TableHead><TableHead>Remise</TableHead><TableHead>TVA</TableHead><TableHead>TTC</TableHead><CommercialMGAColumnHeader show={showMGAEquivalent} /><TableHead>Profil</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{invoicesQuery.data?.map(inv => <TableRow key={inv.id}><TableCell><span className="font-bold text-slate-900">Facture · {inv.invoiceNumber}</span></TableCell><TableCell>Client #{inv.clientId}</TableCell><TableCell className="text-xs">{String(inv.issueDate).slice(0, 10)}<span className="block text-slate-500">Éch. {String(inv.dueDate).slice(0, 10)}</span></TableCell><TableCell>{formatCurrency(Number(inv.subtotalAmount || 0), inv.currency as CurrencyCode)}</TableCell><TableCell className="text-rose-700">- {formatCurrency(Number(inv.discountValue || 0), inv.currency as CurrencyCode)}</TableCell><TableCell>{formatCurrency(Number(inv.taxAmount || 0), inv.currency as CurrencyCode)}</TableCell><TableCell className="font-semibold">{formatCurrency(Number(inv.totalAmount || 0), inv.currency as CurrencyCode)}</TableCell><CommercialMGAColumnCell show={showMGAEquivalent} amount={Number(inv.totalAmount || 0)} rate={Number(eurToMgaRate) || DEFAULT_EUR_TO_MGA} /><TableCell><Badge variant="outline">{inv.documentProfile === "mg" ? "Madagascar" : "France"}</Badge></TableCell><TableCell><Badge variant={inv.status === "brouillon" ? "secondary" : "outline"}>{inv.status}</Badge></TableCell><TableCell className="text-right"><div className="flex flex-wrap justify-end gap-2">{inv.status === "brouillon" ? <><Button size="sm" variant="outline" onClick={() => { setEditingInvoiceId(inv.id); setInvoiceForm({ invoiceNumber: inv.invoiceNumber, clientId: inv.clientId, quoteId: inv.quoteId || undefined, issueDate: String(inv.issueDate).slice(0, 10), dueDate: String(inv.dueDate).slice(0, 10), currency: (inv.currency as CurrencyCode) || "EUR", documentProfile: inv.documentProfile === "mg" ? "mg" : "fr", discountType: inv.discountType === "percent" || inv.discountType === "fixed" ? inv.discountType : "none", discountValue: String(inv.discountValue || 0), taxRate: String(inv.taxRate || 0), notes: inv.notes || "", termsAndConditions: inv.termsAndConditions || "" }); setInvoiceLines(parseBillingLines(inv.itemsJson, (inv.currency as CurrencyCode) || "EUR")); setIsInvoiceOpen(true); }}>Modifier</Button><Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={confirmInvoiceDraftMutation.isPending} onClick={() => confirmInvoiceDraftMutation.mutate({ id: inv.id })}><CheckCircle className="mr-1 h-3.5 w-3.5" /> Confirmer</Button><Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={cancelInvoiceDraftMutation.isPending} onClick={() => { if (window.confirm(`Annuler la facture ${inv.invoiceNumber} ?`)) cancelInvoiceDraftMutation.mutate({ id: inv.id }); }}><Trash2 className="mr-1 h-3.5 w-3.5" /> Annuler</Button></> : inv.status === "payée" ? <Button size="sm" variant="outline" onClick={() => { setInvoiceCashConversion({ id: inv.id, number: inv.invoiceNumber, totalAmount: String(inv.totalAmount) }); setInvoiceCashCurrency("MGA"); setInvoiceCashRate(String(DEFAULT_EUR_TO_MGA)); setInvoiceCashPaymentMethod("Virement"); }} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><WalletCards className="mr-1 h-3.5 w-3.5" /> Vers caisse</Button> : <span className="text-xs text-slate-400">Verrouillée</span>}<Button size="sm" variant="outline" onClick={() => downloadCommercialDocument("facture", { number: inv.invoiceNumber, clientId: inv.clientId, issueDate: inv.issueDate, dueDate: inv.dueDate, totalAmount: inv.totalAmount, itemsJson: inv.itemsJson, notes: inv.notes, termsAndConditions: inv.termsAndConditions, currency: inv.currency as CurrencyCode, documentProfile: inv.documentProfile === "mg" ? "mg" : "fr", subtotalAmount: inv.subtotalAmount, discountType: inv.discountType, discountValue: inv.discountValue, taxRate: inv.taxRate, taxAmount: inv.taxAmount })}><Download className="mr-1 h-3.5 w-3.5" /> Télécharger</Button></div></TableCell></TableRow>)}{(!invoicesQuery.data || invoicesQuery.data.length === 0) && <TableRow><TableCell colSpan={showMGAEquivalent ? 11 : 10} className="py-8 text-center text-slate-500">Aucune facture enregistrée.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
            <Card className="border-slate-200 bg-white shadow-sm"><CardHeader><CardTitle>Devis commerciaux</CardTitle><CardDescription>Devis structurés avec catalogue, remises, TVA, devise et profil de conformité.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Client</TableHead><TableHead>Dates</TableHead><TableHead>HT</TableHead><TableHead>Remise</TableHead><TableHead>TVA</TableHead><TableHead>TTC</TableHead><CommercialMGAColumnHeader show={showMGAEquivalent} /><TableHead>Profil</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{quotesQuery.data?.map(quote => <TableRow key={quote.id}><TableCell><span className="font-bold text-slate-900">Devis · {quote.quoteNumber}</span></TableCell><TableCell>Client #{quote.clientId}</TableCell><TableCell className="text-xs">{String(quote.issueDate).slice(0, 10)}<span className="block text-slate-500">Val. {String(quote.validUntil).slice(0, 10)}</span></TableCell><TableCell>{formatCurrency(Number(quote.subtotalAmount || 0), quote.currency as CurrencyCode)}</TableCell><TableCell className="text-rose-700">- {formatCurrency(Number(quote.discountValue || 0), quote.currency as CurrencyCode)}</TableCell><TableCell>{formatCurrency(Number(quote.taxAmount || 0), quote.currency as CurrencyCode)}</TableCell><TableCell className="font-semibold">{formatCurrency(Number(quote.totalAmount || 0), quote.currency as CurrencyCode)}</TableCell><CommercialMGAColumnCell show={showMGAEquivalent} amount={Number(quote.totalAmount || 0)} rate={Number(eurToMgaRate) || DEFAULT_EUR_TO_MGA} /><TableCell><Badge variant="outline">{quote.documentProfile === "mg" ? "Madagascar" : "France"}</Badge></TableCell><TableCell><Badge variant={quote.status === "brouillon" ? "secondary" : "outline"}>{quote.status}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-2">{quote.status === "brouillon" && <><Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={confirmQuoteDraftMutation.isPending} onClick={() => confirmQuoteDraftMutation.mutate({ id: quote.id })}><CheckCircle className="mr-1 h-3.5 w-3.5" /> Confirmer</Button><Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={cancelQuoteDraftMutation.isPending} onClick={() => { if (window.confirm(`Annuler le devis ${quote.quoteNumber} ?`)) cancelQuoteDraftMutation.mutate({ id: quote.id }); }}><Trash2 className="mr-1 h-3.5 w-3.5" /> Annuler</Button></>}<Button size="sm" variant="outline" onClick={() => downloadCommercialDocument("devis", { number: quote.quoteNumber, clientId: quote.clientId, issueDate: quote.issueDate, validUntil: quote.validUntil, totalAmount: quote.totalAmount, itemsJson: quote.itemsJson, notes: quote.notes, termsAndConditions: quote.termsAndConditions, currency: quote.currency as CurrencyCode, documentProfile: quote.documentProfile === "mg" ? "mg" : "fr", subtotalAmount: quote.subtotalAmount, discountType: quote.discountType, discountValue: quote.discountValue, taxRate: quote.taxRate, taxAmount: quote.taxAmount })}><Download className="mr-1 h-3.5 w-3.5" /> Télécharger</Button><Button size="sm" variant="outline" disabled={quote.status === "facturé" || quote.status === "brouillon" || convertQuoteMutation.isPending} onClick={() => convertQuoteMutation.mutate({ quoteId: quote.id })} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><DollarSign className="mr-1 h-3.5 w-3.5" /> {quote.status === "facturé" ? "En compta" : "Passer en compta"}</Button></div></TableCell></TableRow>)}{(!quotesQuery.data || quotesQuery.data.length === 0) && <TableRow><TableCell colSpan={showMGAEquivalent ? 11 : 10} className="py-8 text-center text-slate-500">Aucun devis enregistré. Cliquez sur « Créer un devis » pour commencer.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
          </TabsContent>

          {/* STATISTIQUES DYNAMIQUES */}
          <TabsContent value="stats" className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Statistiques dynamiques</h2>
                <p className="text-sm text-slate-500">Un tableur mensuel filtrable par client, agent, service et période.</p>
              </div>
              <Dialog open={isStatOpen} onOpenChange={setIsStatOpen}>
                <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"><Plus className="mr-2 h-4 w-4" /> Alimenter le mois</Button></DialogTrigger>
                <DialogContent className="max-w-2xl bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Ajouter une ligne statistique</DialogTitle><DialogDescription>Enregistrez une ligne du tableur pour un mois, un client, un agent et un service.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>Mois</Label><Input type="month" value={statForm.monthKey} onChange={event => setStatForm({ ...statForm, monthKey: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Client</Label><Input value={statForm.clientName} onChange={event => setStatForm({ ...statForm, clientName: event.target.value })} placeholder="Client ou compte" /></div>
                    <div className="space-y-2"><Label>Agent</Label><Input value={statForm.agentName} onChange={event => setStatForm({ ...statForm, agentName: event.target.value })} placeholder="Collaborateur" /></div>
                    <div className="space-y-2"><Label>Service</Label><Input value={statForm.serviceName} onChange={event => setStatForm({ ...statForm, serviceName: event.target.value })} placeholder="Service délivré" /></div>
                    <div className="space-y-2"><Label>CA (MGA)</Label><Input type="number" min="0" value={statForm.revenue} onChange={event => setStatForm({ ...statForm, revenue: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Dépenses (MGA)</Label><Input type="number" min="0" value={statForm.expenses} onChange={event => setStatForm({ ...statForm, expenses: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Jours travaillés</Label><Input type="number" min="0" step="0.25" value={statForm.workDays} onChange={event => setStatForm({ ...statForm, workDays: event.target.value })} /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Note</Label><Textarea value={statForm.notes} onChange={event => setStatForm({ ...statForm, notes: event.target.value })} placeholder="Contexte ou commentaire interne" /></div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setIsStatOpen(false)}>Annuler</Button><Button onClick={handleSaveDynamicStat} disabled={createDynamicStatMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white">{createDynamicStatMutation.isPending ? "Enregistrement…" : "Enregistrer la ligne"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50 shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div><CardTitle>Statistiques RH</CardTitle><CardDescription>Dépenses et sorties RH journalières ou mensuelles, par équipe ou agent individuel.</CardDescription></div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={hrGroupView === "department" ? "default" : "outline"} onClick={() => setHrGroupView("department")} className={hrGroupView === "department" ? "bg-emerald-600 text-white" : "bg-white"}>Par équipe</Button>
                    <Button size="sm" variant={hrGroupView === "agent" ? "default" : "outline"} onClick={() => setHrGroupView("agent")} className={hrGroupView === "agent" ? "bg-emerald-600 text-white" : "bg-white"}>Par agent</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Du mois</Label><Input type="month" value={hrStatFilters.fromMonth} onChange={event => setHrStatFilters({ ...hrStatFilters, fromMonth: event.target.value })} className="bg-white" /></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Au mois</Label><Input type="month" value={hrStatFilters.toMonth} onChange={event => setHrStatFilters({ ...hrStatFilters, toMonth: event.target.value })} className="bg-white" /></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Agent individuel</Label><Select value={hrStatFilters.agentId} onValueChange={value => setHrStatFilters({ ...hrStatFilters, agentId: value })}><SelectTrigger className="bg-white"><SelectValue placeholder="Tous les agents" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les agents</SelectItem>{hrStatisticsQuery.data?.agents.map(agent => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Équipe / service RH</Label><Select value={hrStatFilters.department} onValueChange={value => setHrStatFilters({ ...hrStatFilters, department: value })}><SelectTrigger className="bg-white"><SelectValue placeholder="Toutes les équipes" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les équipes</SelectItem>{hrStatisticsQuery.data?.departments.map(department => <SelectItem key={department} value={department}>{department}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-emerald-600">Jours travaillés</p><p className="mt-1 text-lg font-bold text-slate-950">{Number(hrStatisticsQuery.data?.totals.workDays || 0).toFixed(2)} j</p><p className="text-xs text-slate-500">{Number(hrStatisticsQuery.data?.totals.hours || 0).toFixed(2)} heures</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-rose-600">Sorties journalières / mois</p><p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(Number(hrStatisticsQuery.data?.totals.cashOutMga || 0), "MGA")}</p><p className="text-xs text-slate-500">Mouvements liés aux dépenses RH</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-amber-600">Avances</p><p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(Number(hrStatisticsQuery.data?.totals.advancesMga || 0), "MGA")}</p><p className="text-xs text-slate-500">Avances demandées sur la période</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Masse salariale planifiée</p><p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(Number(hrStatisticsQuery.data?.totals.plannedPayrollMga || 0), "MGA")}</p><p className="text-xs text-slate-500">Agents correspondant aux filtres</p></div>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">Sorties par jour</div><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Jours</TableHead><TableHead>Avances</TableHead><TableHead>Sorties caisse</TableHead></TableRow></TableHeader><TableBody>{hrStatisticsQuery.data?.daily.map(row => <TableRow key={row.date}><TableCell>{row.date}</TableCell><TableCell>{row.workDays.toFixed(2)} j</TableCell><TableCell>{formatCurrency(row.advancesMga, "MGA")}</TableCell><TableCell className="font-semibold text-rose-700">{formatCurrency(row.cashOutMga, "MGA")}</TableCell></TableRow>)}{(!hrStatisticsQuery.data?.daily || hrStatisticsQuery.data.daily.length === 0) && <TableRow><TableCell colSpan={4} className="py-8 text-center text-slate-500">Aucune dépense RH sur la période.</TableCell></TableRow>}</TableBody></Table></div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900">{hrGroupView === "department" ? "Synthèse par équipe" : "Synthèse par agent"}</div><Table><TableHeader><TableRow><TableHead>{hrGroupView === "department" ? "Équipe" : "Agent"}</TableHead><TableHead>Jours</TableHead><TableHead>Avances MGA</TableHead></TableRow></TableHeader><TableBody>{hrGroupView === "department" ? (hrStatisticsQuery.data?.byDepartment || []).map(row => <TableRow key={row.department}><TableCell><div className="font-medium">{row.department}</div><div className="text-xs text-slate-500">{row.agentCount} agent(s)</div></TableCell><TableCell>{row.workDays.toFixed(2)} j</TableCell><TableCell>{formatCurrency(row.advancesMga, "MGA")}</TableCell></TableRow>) : (hrStatisticsQuery.data?.byAgent || []).map(row => <TableRow key={row.agentId}><TableCell><div className="font-medium">{row.agentName}</div><div className="text-xs text-slate-500">{row.department}</div></TableCell><TableCell>{row.workDays.toFixed(2)} j</TableCell><TableCell>{formatCurrency(row.advancesMga, "MGA")}</TableCell></TableRow>)}{((hrGroupView === "department" ? hrStatisticsQuery.data?.byDepartment : hrStatisticsQuery.data?.byAgent) || []).length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-slate-500">Aucune donnée RH.</TableCell></TableRow>}</TableBody></Table></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-sky-100 bg-gradient-to-br from-sky-50 via-white to-slate-50 shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div><CardTitle>Statistiques CA</CardTitle><CardDescription>Nombre et montant des factures par période, client, service et statut.</CardDescription></div>
                  <div className="flex flex-wrap gap-2">
                    {([['period', 'Période'], ['client', 'Client'], ['service', 'Service'], ['status', 'Statut']] as const).map(([key, label]) => <Button key={key} size="sm" variant={caBreakdown === key ? "default" : "outline"} onClick={() => setCaBreakdown(key)} className={caBreakdown === key ? "bg-sky-600 text-white" : "bg-white"}>{label}</Button>)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Du mois</Label><Input type="month" value={caStatFilters.fromMonth} onChange={event => setCaStatFilters({ ...caStatFilters, fromMonth: event.target.value })} className="bg-white" /></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Au mois</Label><Input type="month" value={caStatFilters.toMonth} onChange={event => setCaStatFilters({ ...caStatFilters, toMonth: event.target.value })} className="bg-white" /></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Client</Label><Select value={caStatFilters.clientId} onValueChange={value => setCaStatFilters({ ...caStatFilters, clientId: value })}><SelectTrigger className="bg-white"><SelectValue placeholder="Tous les clients" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les clients</SelectItem>{caStatisticsQuery.data?.clients.map(client => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Service</Label><Select value={caStatFilters.serviceName} onValueChange={value => setCaStatFilters({ ...caStatFilters, serviceName: value })}><SelectTrigger className="bg-white"><SelectValue placeholder="Tous les services" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les services</SelectItem>{caStatisticsQuery.data?.services.map(service => <SelectItem key={service} value={service}>{service}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Statut facture</Label><Select value={caStatFilters.status} onValueChange={value => setCaStatFilters({ ...caStatFilters, status: value })}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tous">Tous les statuts</SelectItem><SelectItem value="encaissée">Encaissée</SelectItem><SelectItem value="en retard">En retard</SelectItem><SelectItem value="annulée">Annulée</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent></Select></div>
                </div>
                <div className="grid gap-3 md:grid-cols-4"><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-sky-600">Factures</p><p className="mt-1 text-2xl font-bold text-slate-950">{caStatisticsQuery.data?.totals.invoiceCount || 0}</p><p className="text-xs text-slate-500">sur la période filtrée</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-emerald-600">Encaissées</p><p className="mt-1 text-2xl font-bold text-slate-950">{caStatisticsQuery.data?.totals.encaissed || 0}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-amber-600">En retard</p><p className="mt-1 text-2xl font-bold text-slate-950">{caStatisticsQuery.data?.totals.overdue || 0}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-rose-600">Annulées</p><p className="mt-1 text-2xl font-bold text-slate-950">{caStatisticsQuery.data?.totals.cancelled || 0}</p></div></div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><Table><TableHeader><TableRow><TableHead>{caBreakdown === "period" ? "Période" : caBreakdown === "client" ? "Client" : caBreakdown === "service" ? "Service" : "Statut"}</TableHead><TableHead>Nombre de factures</TableHead><TableHead>Montant MGA</TableHead><TableHead>Montant EUR</TableHead></TableRow></TableHeader><TableBody>{(caBreakdown === "period" ? caStatisticsQuery.data?.byPeriod || [] : caBreakdown === "client" ? caStatisticsQuery.data?.byClient || [] : caBreakdown === "service" ? caStatisticsQuery.data?.byService || [] : caStatisticsQuery.data?.byStatus || []).map(row => <TableRow key={row.key}><TableCell className="font-medium">{row.key}</TableCell><TableCell>{row.invoiceCount}</TableCell><TableCell className="font-semibold">{formatCurrency(row.amountMga, "MGA")}</TableCell><TableCell>{formatCurrency(row.amountEur, "EUR")}</TableCell></TableRow>)}{((caBreakdown === "period" ? caStatisticsQuery.data?.byPeriod : caBreakdown === "client" ? caStatisticsQuery.data?.byClient : caBreakdown === "service" ? caStatisticsQuery.data?.byService : caStatisticsQuery.data?.byStatus) || []).length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-slate-500">Aucune facture ne correspond aux filtres.</TableCell></TableRow>}</TableBody></Table></div>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-50 shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div><CardTitle>Statistiques issues de la comptabilité</CardTitle><CardDescription>Les données sont calculées directement depuis les mouvements de caisse enregistrés.</CardDescription></div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={accountingStatsView === "sheet" ? "default" : "outline"} onClick={() => setAccountingStatsView("sheet")} className={accountingStatsView === "sheet" ? "bg-indigo-600 text-white" : "bg-white"}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Sheet</Button>
                    <Button size="sm" variant={accountingStatsView === "gantt" ? "default" : "outline"} onClick={() => setAccountingStatsView("gantt")} className={accountingStatsView === "gantt" ? "bg-indigo-600 text-white" : "bg-white"}><Calendar className="mr-1.5 h-4 w-4" /> Gantt</Button>
                    <Button size="sm" variant={accountingStatsView === "eisenhower" ? "default" : "outline"} onClick={() => setAccountingStatsView("eisenhower")} className={accountingStatsView === "eisenhower" ? "bg-indigo-600 text-white" : "bg-white"}><ShieldCheck className="mr-1.5 h-4 w-4" /> Eisenhower</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Mois comptable</Label><Select value={accountingStatFilters.monthKey || "all"} onValueChange={value => setAccountingStatFilters({ ...accountingStatFilters, monthKey: value === "all" ? "" : value })}><SelectTrigger className="bg-white"><SelectValue placeholder="Tous les mois" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les mois</SelectItem>{accountingMonthOptions.map(month => <SelectItem key={month} value={month}>{month}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Type de mouvement</Label><Select value={accountingStatFilters.type} onValueChange={value => setAccountingStatFilters({ ...accountingStatFilters, type: value as "tous" | "entrée" | "sortie" })}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tous">Entrées & sorties</SelectItem><SelectItem value="entrée">Entrées uniquement</SelectItem><SelectItem value="sortie">Sorties uniquement</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Catégorie</Label><Select value={accountingStatFilters.category || "all"} onValueChange={value => setAccountingStatFilters({ ...accountingStatFilters, category: value === "all" ? "" : value })}><SelectTrigger className="bg-white"><SelectValue placeholder="Toutes les catégories" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les catégories</SelectItem>{accountingStatisticsQuery.data?.categories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-indigo-600">Entrées</p><p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(Number(accountingStatisticsQuery.data?.totals.revenueMga || 0), "MGA")}</p><p className="text-xs text-slate-500">{accountingStatisticsQuery.data?.totals.entries || 0} mouvement(s)</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-rose-600">Sorties</p><p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(Number(accountingStatisticsQuery.data?.totals.expensesMga || 0), "MGA")}</p><p className="text-xs text-slate-500">{accountingStatisticsQuery.data?.totals.sorties || 0} mouvement(s)</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-emerald-600">Solde</p><p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(Number(accountingStatisticsQuery.data?.totals.balanceMga || 0), "MGA")}</p><p className="text-xs text-slate-500">Référence comptable EUR convertie</p></div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Vue active</p><p className="mt-1 text-lg font-bold text-slate-950">{accountingStatsView === "sheet" ? "Tableur" : accountingStatsView === "gantt" ? "Gantt" : "Eisenhower"}</p><p className="text-xs text-slate-500">{accountingStatisticsQuery.data?.rows.length || 0} ligne(s) filtrée(s)</p></div>
                </div>
                {accountingStatsView === "sheet" && <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Catégorie</TableHead><TableHead>Description</TableHead><TableHead>Devise saisie</TableHead><TableHead>Montant MGA</TableHead><TableHead>Référence EUR</TableHead></TableRow></TableHeader><TableBody>{accountingStatisticsQuery.data?.rows.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{row.date}</TableCell><TableCell><Badge variant={row.type === "entrée" ? "default" : "secondary"}>{row.type}</Badge></TableCell><TableCell>{row.category}</TableCell><TableCell className="min-w-48">{row.description}</TableCell><TableCell>{formatCurrency(row.amountInCurrency, row.currency as CurrencyCode)}</TableCell><TableCell className={row.type === "entrée" ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{formatCurrency(row.amountMga, "MGA")}</TableCell><TableCell>{formatCurrency(row.amountEur, "EUR")}</TableCell></TableRow>)}{(!accountingStatisticsQuery.data?.rows || accountingStatisticsQuery.data.rows.length === 0) && <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-500">Aucun mouvement ne correspond aux filtres.</TableCell></TableRow>}</TableBody></Table></div>}
                {accountingStatsView === "gantt" && <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"><span>Chronologie mensuelle</span><span>Entrées / sorties</span></div>{(accountingStatisticsQuery.data?.months || []).map(month => <div key={month.monthKey} className="grid gap-3 md:grid-cols-[100px_1fr_180px] md:items-center"><span className="text-sm font-semibold text-slate-700">{month.monthKey}</span><div className="space-y-1"><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (month.revenueEur / Math.max(1, ...(accountingStatisticsQuery.data?.months || []).map(item => Math.max(item.revenueEur, item.expensesEur)))) * 100)}%` }} /></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.min(100, (month.expensesEur / Math.max(1, ...(accountingStatisticsQuery.data?.months || []).map(item => Math.max(item.revenueEur, item.expensesEur)))) * 100)}%` }} /></div></div><div className="text-xs text-slate-500"><p className="text-emerald-700">+ {formatCurrency(month.revenueMga, "MGA")}</p><p className="text-rose-700">− {formatCurrency(month.expensesMga, "MGA")}</p></div></div>)}{(!accountingStatisticsQuery.data?.months || accountingStatisticsQuery.data.months.length === 0) && <p className="py-8 text-center text-sm text-slate-500">Aucune période comptable disponible.</p>}<div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-500"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Entrées</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />Sorties</span></div></div>}
                {accountingStatsView === "eisenhower" && <div className="grid gap-4 md:grid-cols-2">{ACCOUNTING_EISENHOWER_QUADRANTS.map(quadrant => <div key={quadrant.key} className={`rounded-2xl border p-4 ${quadrant.className}`}><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{quadrant.title}</h3><p className="text-xs text-slate-600">{quadrant.description}</p></div><Badge className={quadrant.badgeClassName}>{(accountingStatisticsQuery.data?.rows || []).filter(row => row.eisenhowerQuadrant === quadrant.key).length}</Badge></div><div className="space-y-2">{(accountingStatisticsQuery.data?.rows || []).filter(row => row.eisenhowerQuadrant === quadrant.key).slice(0, 8).map(row => <div key={row.id} className="rounded-xl bg-white/80 p-3 text-sm shadow-sm"><div className="flex items-start justify-between gap-3"><span className="font-semibold text-slate-900">{row.category}</span><span className="whitespace-nowrap font-bold">{formatCurrency(row.amountMga, "MGA")}</span></div><p className="mt-1 line-clamp-2 text-xs text-slate-600">{row.description}</p><p className="mt-1 text-[11px] text-slate-500">{row.date} · {row.type}</p></div>)}{(accountingStatisticsQuery.data?.rows || []).filter(row => row.eisenhowerQuadrant === quadrant.key).length === 0 && <p className="rounded-xl bg-white/60 p-3 text-xs text-slate-500">Aucun mouvement dans cette zone.</p>}</div></div>)}</div>}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader><CardTitle>Vues filtrées</CardTitle><CardDescription>Les totaux se recalculent instantanément à partir des lignes visibles.</CardDescription></CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Mois</Label><Select value={statFilters.monthKey || "all"} onValueChange={value => setStatFilters({ ...statFilters, monthKey: value === "all" ? "" : value })}><SelectTrigger><SelectValue placeholder="Tous les mois" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les mois</SelectItem>{statFilterOptionsQuery.data?.months.map(month => <SelectItem key={month} value={month}>{month}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Client</Label><Select value={statFilters.clientName || "all"} onValueChange={value => setStatFilters({ ...statFilters, clientName: value === "all" ? "" : value })}><SelectTrigger><SelectValue placeholder="Tous les clients" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les clients</SelectItem>{statFilterOptionsQuery.data?.clients.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Agent</Label><Select value={statFilters.agentName || "all"} onValueChange={value => setStatFilters({ ...statFilters, agentName: value === "all" ? "" : value })}><SelectTrigger><SelectValue placeholder="Tous les agents" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les agents</SelectItem>{statFilterOptionsQuery.data?.agents.map(agent => <SelectItem key={agent} value={agent}>{agent}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-xs text-slate-500">Service</Label><Select value={statFilters.serviceName || "all"} onValueChange={value => setStatFilters({ ...statFilters, serviceName: value === "all" ? "" : value })}><SelectTrigger><SelectValue placeholder="Tous les services" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les services</SelectItem>{statFilterOptionsQuery.data?.services.map(service => <SelectItem key={service} value={service}>{service}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-indigo-50 p-4"><p className="text-xs uppercase tracking-wide text-indigo-600">CA visible</p><p className="mt-1 text-xl font-bold text-indigo-950">{formatCurrency(dynamicStatsTotals.revenue, "MGA")}</p></div>
                  <div className="rounded-2xl bg-rose-50 p-4"><p className="text-xs uppercase tracking-wide text-rose-600">Dépenses visibles</p><p className="mt-1 text-xl font-bold text-rose-950">{formatCurrency(dynamicStatsTotals.expenses, "MGA")}</p></div>
                  <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs uppercase tracking-wide text-emerald-600">Jours travaillés</p><p className="mt-1 text-xl font-bold text-emerald-950">{dynamicStatsTotals.workDays.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} j</p></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader><CardTitle>Tableur mensuel</CardTitle><CardDescription>{filteredDynamicStats.length} ligne(s) affichée(s) sur {dynamicStatsQuery.data?.length || 0} enregistrée(s).</CardDescription></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead>Mois</TableHead><TableHead>Client</TableHead><TableHead>Agent</TableHead><TableHead>Service</TableHead><TableHead>CA MGA</TableHead><TableHead>Dépenses MGA</TableHead><TableHead>Jours</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
                  {filteredDynamicStats.map(row => <TableRow key={row.id}><TableCell className="font-medium">{row.monthKey}</TableCell><TableCell>{row.clientName}</TableCell><TableCell>{row.agentName}</TableCell><TableCell>{row.serviceName}</TableCell><TableCell className="font-semibold text-indigo-700">{formatCurrency(Number(row.revenue), "MGA")}</TableCell><TableCell className="text-rose-700">{formatCurrency(Number(row.expenses), "MGA")}</TableCell><TableCell>{Number(row.workDays).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" className="text-rose-700" onClick={() => { if (window.confirm("Supprimer cette ligne statistique ?")) deleteDynamicStatMutation.mutate({ id: row.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell></TableRow>)}
                  {filteredDynamicStats.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-slate-500">Aucune ligne pour ces filtres. Alimentez le mois pour commencer.</TableCell></TableRow>}
                </TableBody></Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BUDGET PLANNER */}
          <TabsContent value="budget" className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div><h2 className="text-2xl font-bold tracking-tight">Budget Planner</h2><p className="text-sm text-slate-500">Planifiez les dépenses récurrentes, sauvegardez la feuille et transformez-la en sortie de caisse.</p></div>
              <Dialog open={isBudgetOpen} onOpenChange={setIsBudgetOpen}>
                <DialogTrigger asChild><Button className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl"><Plus className="mr-2 h-4 w-4" /> Nouvelle feuille</Button></DialogTrigger>
                <DialogContent className="max-w-3xl bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Enregistrer une feuille budgétaire</DialogTitle><DialogDescription>Ajoutez les dépenses récurrentes du mois dans la devise de votre choix.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2 md:col-span-2"><Label>Nom de la feuille</Label><Input value={budgetForm.title} onChange={event => setBudgetForm({ ...budgetForm, title: event.target.value })} /></div><div className="space-y-2"><Label>Mois</Label><Input type="month" value={budgetForm.monthKey} onChange={event => setBudgetForm({ ...budgetForm, monthKey: event.target.value })} /></div></div>
                    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Devise</Label><Select value={budgetForm.currency} onValueChange={value => setBudgetForm({ ...budgetForm, currency: value as CurrencyCode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MGA">Ariary (MGA)</SelectItem><SelectItem value="EUR">Euro (EUR)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Taux EUR/MGA</Label><Input type="number" min="1" value={budgetForm.exchangeRate} onChange={event => setBudgetForm({ ...budgetForm, exchangeRate: event.target.value })} disabled={budgetForm.currency === "EUR"} /></div></div>
                    <div className="rounded-2xl border border-slate-200 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Libellé</TableHead><TableHead>Catégorie</TableHead><TableHead>Montant</TableHead><TableHead>Note</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader><TableBody>{budgetItems.map((item, index) => <TableRow key={index}><TableCell><Input value={item.label} onChange={event => updateBudgetItem(index, "label", event.target.value)} placeholder="Loyer, logiciel…" /></TableCell><TableCell><Input value={item.category} onChange={event => updateBudgetItem(index, "category", event.target.value)} placeholder="Fixe, SaaS…" /></TableCell><TableCell><Input type="number" min="0" value={item.amount} onChange={event => updateBudgetItem(index, "amount", event.target.value)} /></TableCell><TableCell><Input value={item.note} onChange={event => updateBudgetItem(index, "note", event.target.value)} placeholder="Optionnel" /></TableCell><TableCell><Button type="button" size="icon" variant="ghost" onClick={() => setBudgetItems(items => items.length > 1 ? items.filter((_, itemIndex) => itemIndex !== index) : items)}><Trash2 className="h-4 w-4 text-rose-600" /></Button></TableCell></TableRow>)}</TableBody></Table><div className="p-3"><Button type="button" variant="outline" size="sm" onClick={() => setBudgetItems(items => [...items, { label: "", category: "", amount: "0", note: "" }])}><Plus className="mr-1 h-3.5 w-3.5" /> Ajouter une dépense</Button></div></div>
                    <div className="space-y-2"><Label>Notes</Label><Textarea value={budgetForm.notes} onChange={event => setBudgetForm({ ...budgetForm, notes: event.target.value })} /></div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setIsBudgetOpen(false)}>Annuler</Button><Button onClick={handleSaveBudgetSheet} disabled={createBudgetSheetMutation.isPending} className="bg-emerald-600 hover:bg-emerald-500 text-white">{createBudgetSheetMutation.isPending ? "Enregistrement…" : "Enregistrer la feuille"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Card className="border-slate-200 shadow-sm bg-white"><CardHeader><CardTitle>Feuilles enregistrées</CardTitle><CardDescription>Une feuille convertie est verrouillée pour conserver la traçabilité de la sortie.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Feuille</TableHead><TableHead>Mois</TableHead><TableHead>Dépenses</TableHead><TableHead>Devise</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{budgetSheetsQuery.data?.map(sheet => { const items = parseBudgetItems(sheet.itemsJson); return <TableRow key={sheet.id}><TableCell><div className="font-semibold text-slate-900">{sheet.title}</div><div className="text-xs text-slate-500">{items.length} ligne(s){sheet.notes ? ` · ${sheet.notes}` : ""}</div></TableCell><TableCell>{sheet.monthKey}</TableCell><TableCell className="font-semibold text-emerald-700">{formatCurrency(Number(sheet.amountInCurrency || sheet.totalAmount), sheet.currency === "MGA" ? "MGA" : "EUR")}</TableCell><TableCell><Badge variant="outline">{sheet.currency}</Badge><div className="text-xs text-slate-500">1 EUR = {Number(sheet.exchangeRate || 1).toLocaleString("fr-FR")} MGA</div></TableCell><TableCell><Badge variant={sheet.status === "converti_caisse" ? "default" : "secondary"}>{sheet.status === "converti_caisse" ? "Converti en caisse" : sheet.status}</Badge></TableCell><TableCell className="text-right"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={sheet.status === "converti_caisse" || convertBudgetSheetMutation.isPending} onClick={() => convertBudgetSheetMutation.mutate({ budgetSheetId: sheet.id })} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><WalletCards className="mr-1 h-3.5 w-3.5" /> Convertir en sortie de caisse</Button><Button size="sm" variant="outline" disabled={sheet.status === "converti_caisse"} onClick={() => { if (window.confirm("Supprimer cette feuille budgétaire ?")) deleteBudgetSheetMutation.mutate({ id: sheet.id }); }} className="text-rose-700"><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell></TableRow>; })}{(!budgetSheetsQuery.data || budgetSheetsQuery.data.length === 0) && <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">Aucune feuille budgétaire enregistrée.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          </TabsContent>

          {/* PARAMÈTRES & BACKOFFICE */}
          <TabsContent value="settings" className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Paramètres</h2>
                <p className="text-sm text-slate-500">Gérez votre profil, les niveaux d’accès et les espaces projets de l’agence.</p>
              </div>
              <Badge className="w-fit bg-indigo-50 text-indigo-700 border-indigo-200" variant="outline">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> {user?.role || "collaborateur"}
              </Badge>
            </div>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-indigo-600" /> Préférences de travail</CardTitle>
                <CardDescription>Ces préférences sont enregistrées sur votre compte et suivront vos prochaines sessions.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2"><Label>Devise d’affichage</Label><Select value={preferencesQuery.data?.currency || invoiceForm.currency} onValueChange={value => updatePreferencesMutation.mutate({ currency: value as CurrencyCode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MGA">Ariary (MGA)</SelectItem><SelectItem value="EUR">Euro (EUR)</SelectItem></SelectContent></Select><p className="text-xs text-slate-500">Utilisée par défaut dans les nouveaux documents.</p></div>
                <div className="space-y-2"><Label>Équivalent MGA</Label><div className="flex h-10 items-center justify-between rounded-md border border-slate-200 px-3"><span className="text-sm text-slate-600">Afficher dans les tableaux</span><Switch checked={preferencesQuery.data?.showMGAEquivalent ?? showMGAEquivalent} onCheckedChange={checked => { setShowMGAEquivalent(checked); updatePreferencesMutation.mutate({ showMGAEquivalent: checked }); }} /></div><p className="text-xs text-slate-500">Le taux de conversion reste configurable dans les documents.</p></div>
                <div className="space-y-2"><Label>Projet actif</Label><Select value={activeProjectId ? String(activeProjectId) : "none"} onValueChange={value => { const projectId = value === "none" ? null : Number(value); setActiveProjectMutation.mutate({ projectId }); }}><SelectTrigger><SelectValue placeholder="Sélectionner un projet" /></SelectTrigger><SelectContent><SelectItem value="none">Tous les espaces</SelectItem>{projectsQuery.data?.map(project => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500">Les nouvelles écritures peuvent être rattachées à cet espace.</p></div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-indigo-600" /> Mon compte</CardTitle>
                  <CardDescription>Votre rôle est attribué par un administrateur.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">{user?.name || "Utilisateur"}</p>
                    <p className="text-sm text-slate-500">{user?.email || "Email non renseigné"}</p>
                    <Badge className="mt-3 capitalize" variant="secondary">Accès {user?.role || "collaborateur"}</Badge>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Niveaux d’accès</p>
                    <div className="grid gap-2 text-sm">
                      <div className="rounded-xl border border-slate-200 p-3"><span className="font-semibold text-slate-900">Collaborateur</span><span className="ml-2 text-slate-500">consulter et alimenter les modules opérationnels</span></div>
                      <div className="rounded-xl border border-slate-200 p-3"><span className="font-semibold text-slate-900">Superviseur</span><span className="ml-2 text-slate-500">contrôler les opérations et suivre les équipes</span></div>
                      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3"><span className="font-semibold text-indigo-900">Administrateur</span><span className="ml-2 text-indigo-700">gérer les comptes, rôles et projets</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isAdmin ? (
                <Card className="border-indigo-100 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /> Contrôle des accès</CardTitle>
                    <CardDescription>Seuls les administrateurs peuvent créer un compte ou modifier son rôle.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-1.5"><Label>Nom du compte</Label><Input value={adminUserForm.name} onChange={event => setAdminUserForm(current => ({ ...current, name: event.target.value }))} placeholder="Nom et prénom" /></div>
                      <div className="space-y-1.5"><Label>Email de connexion</Label><Input type="email" value={adminUserForm.email} onChange={event => setAdminUserForm(current => ({ ...current, email: event.target.value }))} placeholder="prenom@agence.fr" /></div>
                      <div className="space-y-1.5"><Label>Rôle</Label><Select value={adminUserForm.role} onValueChange={value => setAdminUserForm(current => ({ ...current, role: value as typeof current.role }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collaborateur">Collaborateur</SelectItem><SelectItem value="superviseur">Superviseur</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
                    </div>
                    <Button className="bg-indigo-600 hover:bg-indigo-500" disabled={createAdminUserMutation.isPending || !adminUserForm.name.trim() || !adminUserForm.email.trim()} onClick={() => createAdminUserMutation.mutate(adminUserForm)}><UserPlus className="mr-2 h-4 w-4" /> Créer le compte</Button>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <Table><TableHeader><TableRow><TableHead>Compte</TableHead><TableHead>Rôle</TableHead><TableHead>Activation</TableHead><TableHead>Dernière connexion</TableHead><TableHead className="text-right">Modifier</TableHead></TableRow></TableHeader><TableBody>{adminUsersQuery.data?.map(account => <TableRow key={account.id}><TableCell><div className="font-medium text-slate-900">{account.name || "Compte sans nom"}</div><div className="text-xs text-slate-500">{account.email || "Email non renseigné"}</div></TableCell><TableCell><Badge variant={account.role === "admin" ? "default" : "secondary"}>{account.role}</Badge></TableCell><TableCell><Badge variant={account.accountStatus === "active" ? "default" : "outline"}>{account.accountStatus === "invited" ? "Invité" : account.accountStatus === "suspended" ? "Suspendu" : "Actif"}</Badge></TableCell><TableCell className="text-sm text-slate-500">{account.lastSignedIn ? new Date(account.lastSignedIn).toLocaleDateString("fr-FR") : "Jamais"}</TableCell><TableCell className="text-right"><div className="flex flex-wrap justify-end gap-2"><Select value={account.role} onValueChange={role => updateAdminRoleMutation.mutate({ userId: account.id, role: role as "collaborateur" | "superviseur" | "admin" })}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collaborateur">Collaborateur</SelectItem><SelectItem value="superviseur">Superviseur</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select>{account.accountStatus === "invited" && <Button size="sm" variant="outline" disabled={resendInvitationMutation.isPending} onClick={() => resendInvitationMutation.mutate({ userId: account.id })}>Renvoyer</Button>}</div></TableCell></TableRow>)}{(!adminUsersQuery.data || adminUsersQuery.data.length === 0) && <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-500">Aucun compte à afficher.</TableCell></TableRow>}</TableBody></Table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-amber-200 bg-amber-50/50 shadow-sm"><CardHeader><CardTitle className="text-amber-900">Administration restreinte</CardTitle><CardDescription className="text-amber-800">La création de comptes, la modification des accès et la création de projets sont réservées aux administrateurs.</CardDescription></CardHeader><CardContent><p className="text-sm text-amber-900">Contactez un administrateur pour demander une évolution de votre rôle ou un accès à un nouveau projet.</p></CardContent></Card>
              )}
            </div>

            {isAdmin && <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="border-indigo-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /> Permissions par rôle</CardTitle>
                  <CardDescription>Définissez précisément les modules et actions accessibles aux collaborateurs, superviseurs et administrateurs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="max-w-xs space-y-1.5"><Label>Rôle à configurer</Label><Select value={permissionsRole} onValueChange={value => setPermissionsRole(value as RoleKey)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collaborateur">Collaborateur</SelectItem><SelectItem value="superviseur">Superviseur</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map(group => <div key={group} className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{group}</p><div className="divide-y rounded-xl border border-slate-200 bg-white">{PERMISSION_KEYS.filter(permissionKey => PERMISSION_LABELS[permissionKey].group === group).map(permissionKey => { const permission = rolePermissionsQuery.data?.find(row => row.role === permissionsRole && row.permissionKey === permissionKey); const locked = permissionsRole === "admin"; return <div key={permissionKey} className="flex items-center justify-between gap-4 p-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{PERMISSION_LABELS[permissionKey].label}</p><p className="text-xs text-slate-500">{PERMISSION_LABELS[permissionKey].description}</p></div><Switch checked={Boolean(permission?.enabled)} disabled={locked || updateRolePermissionMutation.isPending} onCheckedChange={enabled => updateRolePermissionMutation.mutate({ role: permissionsRole, permissionKey, enabled })} aria-label={`${PERMISSION_LABELS[permissionKey].label} pour ${permissionsRole}`} /></div>; })}</div></div>)}
                  </div>
                  {permissionsRole === "admin" && <p className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-800">Les droits administrateur restent actifs pour éviter de verrouiller le backoffice.</p>}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border-amber-100 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-amber-600" /> Visibilité du CA dans le pilotage</CardTitle>
                    <CardDescription>Masquez les indicateurs et graphiques de chiffre d’affaires projet par projet.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">{adminProjectsQuery.data?.map(project => <div key={project.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{project.name}</p><p className="text-xs text-slate-500">{project.showRevenueDashboard === false ? "CA masqué dans le pilotage" : "CA visible dans le pilotage"}</p></div><Switch checked={project.showRevenueDashboard !== false} disabled={updateRevenueVisibilityMutation.isPending} onCheckedChange={showRevenueDashboard => updateRevenueVisibilityMutation.mutate({ projectId: project.id, showRevenueDashboard })} aria-label={`Visibilité du CA pour ${project.name}`} /></div>)}{(!adminProjectsQuery.data || adminProjectsQuery.data.length === 0) && <p className="text-sm text-slate-500">Créez d’abord un projet pour configurer la visibilité du CA.</p>}</CardContent>
                </Card>

                <Card className="border-emerald-100 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Équipes des superviseurs</CardTitle>
                    <CardDescription>Attribuez un ou plusieurs départements. Le superviseur ne verra ensuite que les données RH de ces équipes.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5"><Label>Superviseur</Label><Select value={selectedSupervisorId ? String(selectedSupervisorId) : "none"} onValueChange={value => setSelectedSupervisorId(value === "none" ? null : Number(value))}><SelectTrigger><SelectValue placeholder="Choisir un superviseur" /></SelectTrigger><SelectContent><SelectItem value="none">Sélectionner un superviseur</SelectItem>{adminUsersQuery.data?.filter(account => account.role === "superviseur").map(account => <SelectItem key={account.id} value={String(account.id)}>{account.name || account.email || `Compte #${account.id}`}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Input value={supervisorDepartment} onChange={event => setSupervisorDepartment(event.target.value)} placeholder="Département ou équipe" disabled={!selectedSupervisorId} /><Button className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={!selectedSupervisorId || !supervisorDepartment.trim() || assignSupervisorTeamMutation.isPending} onClick={() => selectedSupervisorId && assignSupervisorTeamMutation.mutate({ supervisorUserId: selectedSupervisorId, projectId: activeProjectId, department: supervisorDepartment.trim() })}>Attribuer</Button></div>
                    <p className="text-xs text-slate-500">Périmètre : {activeProjectId ? `projet actif #${activeProjectId}` : "équipes globales"}.</p>
                    <div className="space-y-2">{supervisorTeamsQuery.data?.map(team => <div key={team.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="text-sm font-semibold text-slate-900">{team.department}</p><p className="text-xs text-slate-500">{team.projectId ? `Projet #${team.projectId}` : "Tous les projets"}</p></div><Button variant="ghost" size="sm" className="text-rose-700 hover:bg-rose-50" disabled={removeSupervisorTeamMutation.isPending} onClick={() => removeSupervisorTeamMutation.mutate({ id: team.id })}>Retirer</Button></div>)}{selectedSupervisorId && (!supervisorTeamsQuery.data || supervisorTeamsQuery.data.length === 0) && <p className="text-sm text-slate-500">Aucune équipe attribuée à ce superviseur pour ce périmètre.</p>}</div>
                  </CardContent>
                </Card>
              </div>
            </div>}

            {isAdmin && <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50/60 via-teal-50/40 to-sky-50/60 shadow-sm">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <Badge className="mb-2 bg-indigo-600 text-white font-semibold">Portail Prestataire Multi-Clients</Badge>
                  <CardTitle className="flex items-center gap-2 text-xl"><Building2 className="h-6 w-6 text-indigo-600" /> Pilotage des environnements clients</CardTitle>
                  <CardDescription>Créez, configurez et cloisonnez les espaces de gestion de vos clients avec des accès sécurisés et confidentiels.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Dialog open={isProviderClientOpen} onOpenChange={setIsProviderClientOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-500"><UserPlus className="mr-2 h-4 w-4" /> Créer un compte client</Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl bg-white">
                      <DialogHeader>
                        <DialogTitle>Provisionner un nouvel environnement client</DialogTitle>
                        <DialogDescription>Créez un espace étanche et sécurisé pour votre client, avec envoi d’invitation et rôles managés.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-1.5"><Label>Nom de l’agence / entreprise cliente</Label><Input value={providerClientForm.agencyName} onChange={event => setProviderClientForm(current => ({ ...current, agencyName: event.target.value }))} placeholder="Ex: Studio Paris Création" autoFocus /></div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5"><Label>Nom du contact client</Label><Input value={providerClientForm.clientContactName} onChange={event => setProviderClientForm(current => ({ ...current, clientContactName: event.target.value }))} placeholder="Nom et prénom" /></div>
                          <div className="space-y-1.5"><Label>Email de connexion client</Label><Input type="email" value={providerClientForm.clientEmail} onChange={event => setProviderClientForm(current => ({ ...current, clientEmail: event.target.value }))} placeholder="client@entreprise.fr" /></div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5"><Label>Devise par défaut</Label><Select value={providerClientForm.defaultCurrency} onValueChange={value => setProviderClientForm(current => ({ ...current, defaultCurrency: value as CurrencyCode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MGA">Ariary (MGA)</SelectItem><SelectItem value="EUR">Euro (EUR)</SelectItem></SelectContent></Select></div>
                          <div className="space-y-1.5"><Label>Juridiction documentaire</Label><Select value={providerClientForm.jurisdiction} onValueChange={value => setProviderClientForm(current => ({ ...current, jurisdiction: value as typeof current.jurisdiction }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fr">France (mentions légales FR)</SelectItem><SelectItem value="mg">Madagascar (mentions MG)</SelectItem></SelectContent></Select></div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Template de gestion initial</Label>
                          <Select value={providerClientForm.managementTemplate} onValueChange={value => setProviderClientForm(current => ({ ...current, managementTemplate: value as ProjectTemplateKey }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROJECT_TEMPLATES.map(t => <SelectItem key={t.key} value={t.key}>{t.label} — {t.shortDescription}</SelectItem>)}</SelectContent></Select>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-white p-3">
                          <div><p className="text-sm font-semibold text-slate-900">Administrateur de l’espace</p><p className="text-xs text-slate-500">Donner les pleins pouvoirs au client sur son environnement</p></div>
                          <Switch checked={providerClientForm.assignAsAdmin} onCheckedChange={checked => setProviderClientForm(current => ({ ...current, assignAsAdmin: checked }))} />
                        </div>
                      </div>
                      <DialogFooter><Button variant="outline" onClick={() => setIsProviderClientOpen(false)}>Annuler</Button><Button className="bg-indigo-600 text-white hover:bg-indigo-500" disabled={createProviderClientMutation.isPending || !providerClientForm.agencyName.trim() || !providerClientForm.clientEmail.trim()} onClick={() => createProviderClientMutation.mutate(providerClientForm)}>{createProviderClientMutation.isPending ? "Création…" : "Créer et inviter le client"}</Button></DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {providerEnvironmentsQuery.data?.map(env => (
                    <div key={env.id} className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{env.name}</p>
                          <p className="text-xs text-slate-500">Slug : /{env.slug}</p>
                        </div>
                        <Badge variant={env.status === "actif" ? "default" : "secondary"}>{env.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-600">{env.description || "Environnement client managé"}</p>
                      <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs">
                        <p className="font-semibold text-slate-700">Membres rattachés :</p>
                        {env.members && env.members.length > 0 ? (
                          env.members.map(m => (
                            <div key={m.userId} className="flex items-center justify-between text-slate-600">
                              <span>{m.userName || m.userEmail}</span>
                              <Badge variant="outline" className="text-[10px] capitalize">{m.membershipRole}</Badge>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-400 italic">Aucun membre rattaché</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <Button variant="outline" size="sm" onClick={() => setActiveProjectMutation.mutate({ projectId: env.id })}>
                          Basculer dans l’espace
                        </Button>
                        <Button variant="ghost" size="sm" className="text-rose-700 hover:bg-rose-50" onClick={() => toggleEnvironmentLockMutation.mutate({ projectId: env.id, locked: env.showRevenueDashboard === false })}>
                          {env.showRevenueDashboard === false ? "Déverrouiller" : "Confidentialité"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(!providerEnvironmentsQuery.data || providerEnvironmentsQuery.data.length === 0) && (
                    <div className="rounded-2xl border border-dashed border-indigo-200 bg-white/60 p-8 text-center text-sm text-slate-500 md:col-span-2 lg:col-span-3">
                      Aucun environnement client créé. Cliquez sur « Créer un compte client » pour déployer votre premier espace managé.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>}

            {isAdmin && <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><FolderPlus className="h-5 w-5 text-emerald-600" /> Backoffice projets</CardTitle>
                  <CardDescription>Créez un espace de gestion avec un modèle adapté à son activité.</CardDescription>
                </div>
                <Dialog open={isAdminProjectOpen} onOpenChange={setIsAdminProjectOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"><FolderPlus className="mr-2 h-4 w-4" /> Nouveau projet</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-2xl bg-white">
                    <DialogHeader>
                      <DialogTitle>Créer un nouveau projet</DialogTitle>
                      <DialogDescription>Choisissez un template de gestion : les données resteront isolées dans cet espace projet.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5"><Label>Nom du projet</Label><Input value={adminProjectForm.name} onChange={event => setAdminProjectForm(current => ({ ...current, name: event.target.value }))} placeholder="Nouveau projet client" autoFocus /></div>
                        <div className="space-y-1.5"><Label>Slug (optionnel)</Label><Input value={adminProjectForm.slug} onChange={event => setAdminProjectForm(current => ({ ...current, slug: event.target.value }))} placeholder="projet-client" /></div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5"><Label>Devise principale</Label><Select value={adminProjectForm.defaultCurrency} onValueChange={value => setAdminProjectForm(current => ({ ...current, defaultCurrency: value as CurrencyCode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MGA">Ariary (MGA)</SelectItem><SelectItem value="EUR">Euro (EUR)</SelectItem></SelectContent></Select><p className="text-xs text-slate-500">Utilisée par défaut dans la comptabilité et les documents.</p></div>
                        <div className="space-y-1.5"><Label>Juridiction documentaire</Label><Select value={adminProjectForm.jurisdiction} onValueChange={value => setAdminProjectForm(current => ({ ...current, jurisdiction: value as typeof current.jurisdiction }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fr">France — normes françaises</SelectItem><SelectItem value="mg">Madagascar — normes malgaches</SelectItem></SelectContent></Select><p className="text-xs text-slate-500">Prépare les mentions légales des devis et factures.</p></div>
                      </div>
                      <div className="space-y-2">
                        <div><Label>Template de gestion</Label><p className="mt-1 text-xs text-slate-500">Le template prépare l’espace avec les modules adaptés. Vous pourrez toujours utiliser le périmètre complet de l’agence.</p></div>
                        <div className="grid gap-3 md:grid-cols-3">
                          {PROJECT_TEMPLATES.map(template => {
                            const selected = adminProjectForm.managementTemplate === template.key;
                            return <button key={template.key} type="button" aria-pressed={selected} onClick={() => setAdminProjectForm(current => ({ ...current, managementTemplate: template.key }))} className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400 ${template.accentClassName} ${selected ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`}>
                              <div className="flex items-start justify-between gap-3"><span className="font-semibold text-slate-900">{template.label}</span>{selected && <CheckCircle className="h-5 w-5 shrink-0 text-indigo-600" />}</div>
                              <p className="mt-2 text-sm font-medium text-slate-700">{template.shortDescription}</p>
                              <p className="mt-2 text-xs leading-5 text-slate-600">{template.description}</p>
                              <div className="mt-3 flex flex-wrap gap-1.5">{template.modules.map(module => <Badge key={module} variant="outline" className="border-white/80 bg-white/70 text-[11px]">{module}</Badge>)}</div>
                            </button>;
                          })}
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5"><Label>Compte responsable</Label><Select value={adminProjectForm.ownerUserId} onValueChange={value => setAdminProjectForm(current => ({ ...current, ownerUserId: value }))}><SelectTrigger><SelectValue placeholder="Choisir un compte" /></SelectTrigger><SelectContent><SelectItem value="none">Aucun pour l’instant</SelectItem>{adminUsersQuery.data?.map(account => <SelectItem key={account.id} value={String(account.id)}>{account.name || account.email || `Compte #${account.id}`}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-1.5"><Label>Accès initial</Label><Select value={adminProjectForm.ownerRole} onValueChange={value => setAdminProjectForm(current => ({ ...current, ownerRole: value as typeof current.ownerRole }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collaborateur">Collaborateur</SelectItem><SelectItem value="superviseur">Superviseur</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
                      </div>
                      <div className="space-y-1.5"><Label>Description</Label><Textarea value={adminProjectForm.description} onChange={event => setAdminProjectForm(current => ({ ...current, description: event.target.value }))} placeholder="Objectif, périmètre et informations de suivi du projet" /></div>
                      <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-indigo-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><p>Après création, ce projet deviendra automatiquement votre projet actif afin que les modules affichent immédiatement son périmètre.</p></div>
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setIsAdminProjectOpen(false)}>Annuler</Button><Button className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={createAdminProjectMutation.isPending || !adminProjectForm.name.trim()} onClick={() => createAdminProjectMutation.mutate({ name: adminProjectForm.name.trim(), slug: adminProjectForm.slug.trim() || undefined, description: adminProjectForm.description.trim() || undefined, managementTemplate: adminProjectForm.managementTemplate, defaultCurrency: adminProjectForm.defaultCurrency, jurisdiction: adminProjectForm.jurisdiction, ownerUserId: adminProjectForm.ownerUserId === "none" ? undefined : Number(adminProjectForm.ownerUserId), ownerRole: adminProjectForm.ownerRole, activateForCreator: true })}>{createAdminProjectMutation.isPending ? "Création…" : "Créer et ouvrir le projet"}</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{adminProjectsQuery.data?.map(project => { const template = getProjectTemplate(project.managementTemplate as ProjectTemplateKey); return <div key={project.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{project.name}</p><p className="text-xs text-slate-500">/{project.slug}</p></div><Badge variant={project.status === "actif" ? "default" : "secondary"}>{project.status}</Badge></div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">{template.label}</Badge><Badge variant="outline">{project.defaultCurrency}</Badge><Badge variant="outline">{project.jurisdiction === "mg" ? "MG" : "FR"}</Badge></div><p className="mt-3 line-clamp-2 text-sm text-slate-500">{project.description || template.shortDescription}</p><Button variant="outline" size="sm" className="mt-4" disabled={updateAdminProjectStatusMutation.isPending} onClick={() => updateAdminProjectStatusMutation.mutate({ projectId: project.id, status: project.status === "actif" ? "archive" : "actif" })}>{project.status === "actif" ? "Archiver" : "Réactiver"}</Button></div>; })}{(!adminProjectsQuery.data || adminProjectsQuery.data.length === 0) && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 md:col-span-2 lg:col-span-3">Aucun projet créé. Cliquez sur « Nouveau projet » pour initialiser votre premier espace.</div>}</div>
              </CardContent>
            </Card>}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
