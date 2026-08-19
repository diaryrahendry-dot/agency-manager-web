import React, { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { 
  Users, DollarSign, Kanban, Building2, FileText, Ticket, 
  Plus, Search, Download, CheckCircle, Clock, AlertCircle, 
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, FileSpreadsheet, 
  UserPlus, Briefcase, Calendar, ShieldCheck, ExternalLink, RefreshCw, Pencil, ArrowRight, ClipboardCheck, Trash2
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
import { DEFAULT_EUR_TO_MGA, formatMGA } from "@shared/currency";
import { buildCommercialDocumentHtml, getCommercialTableColumnCount, type CommercialDocumentData } from "@shared/commercialDocuments";
import { CommercialMGAColumnCell, CommercialMGAColumnHeader } from "@/components/CommercialMGAColumns";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const openDashboardModule = (tab: string) => {
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
  
  const transactionsQuery = trpc.accounting.listTransactions.useQuery(undefined, { enabled: isAuthenticated });
  const accountingSummary = trpc.accounting.summary.useQuery(undefined, { enabled: isAuthenticated });
  const revenueReportQuery = trpc.accounting.revenueReport.useQuery(undefined, { enabled: isAuthenticated });
  const automaticReportQuery = trpc.accounting.automaticReport.useQuery(undefined, { enabled: isAuthenticated });
  const [reportMonth, setReportMonth] = useState("2026-08");
  const monthlyReportQuery = trpc.accounting.monthlyReport.useQuery({ month: reportMonth }, { enabled: isAuthenticated });
  
  const leadsQuery = trpc.crm.listLeads.useQuery(undefined, { enabled: isAuthenticated });
  
  const clientsQuery = trpc.clientsModule.listClients.useQuery(undefined, { enabled: isAuthenticated });
  const interactionsQuery = trpc.clientsModule.listInteractions.useQuery(undefined, { enabled: isAuthenticated });
  const documentsQuery = trpc.clientsModule.listDocuments.useQuery(undefined, { enabled: isAuthenticated });
  
  const quotesQuery = trpc.billing.listQuotes.useQuery(undefined, { enabled: isAuthenticated });
  const invoicesQuery = trpc.billing.listInvoices.useQuery(undefined, { enabled: isAuthenticated });
  const nextInvoiceNumberQuery = trpc.billing.nextInvoiceNumber.useQuery(undefined, { enabled: isAuthenticated });
  const nextQuoteNumberQuery = trpc.billing.nextQuoteNumber.useQuery(undefined, { enabled: isAuthenticated });

  // États pour les modals de création
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isAgentEditOpen, setIsAgentEditOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const [agentFormError, setAgentFormError] = useState("");
  const [agentForm, setAgentForm] = useState({ name: "", email: "", phone: "", position: "", department: "", hireDate: "2026-01-01", salary: "3000.00", contractType: "CDI", address: "", emergencyContact: "", notes: "" });
  const [agentEditForm, setAgentEditForm] = useState({ name: "", email: "", phone: "", position: "", department: "", hireDate: "2026-01-01", salary: "3000.00", contractType: "CDI", address: "", emergencyContact: "", notes: "" });

  const [isTxOpen, setIsTxOpen] = useState(false);
  const [isTxEditOpen, setIsTxEditOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [isTimeEntryOpen, setIsTimeEntryOpen] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState<number | null>(null);
  const [timeEntryForm, setTimeEntryForm] = useState({ agentId: 0, date: "2026-08-19", hoursWorked: "8", status: "présent" as "présent" | "absent" | "retard" | "congé", notes: "" });
  const [isLeaveEditOpen, setIsLeaveEditOpen] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<number | null>(null);
  const [leaveEditForm, setLeaveEditForm] = useState({ leaveType: "Annuel", startDate: "2026-08-19", endDate: "2026-08-19", daysCount: 1, reason: "" });
  const [txForm, setTxForm] = useState({ type: "entrée" as "entrée" | "sortie", category: "Vente client", amount: "1500.00", date: "2026-08-19", paymentMethod: "Virement", reference: "REF-001", description: "Paiement prestation web", internalNote: "" });

  const [isLeadOpen, setIsLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ companyName: "", contactName: "", email: "", phone: "", expectedAmount: "5000.00", priority: "moyenne" as const, status: "nouveau" as const, nextContactDate: "2026-08-25", notes: "" });
  const [isLeadEditOpen, setIsLeadEditOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  const [leadEditForm, setLeadEditForm] = useState({ companyName: "", contactName: "", email: "", phone: "", expectedAmount: "0.00", priority: "moyenne" as "basse" | "moyenne" | "haute" | "urgente", status: "nouveau" as "nouveau" | "contacté" | "proposition" | "negociation" | "gagne" | "perdu", nextContactDate: "", notes: "" });

  const [isClientOpen, setIsClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ companyName: "", contactName: "", email: "", phone: "", address: "", industry: "Conseil", category: "Standard", notes: "" });

  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [eurToMgaRate, setEurToMgaRate] = useState(String(DEFAULT_EUR_TO_MGA));
  const [showMGAEquivalent, setShowMGAEquivalent] = useState(true);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "FAC-2026-001", clientId: 1, quoteId: undefined as number | undefined, issueDate: "2026-08-19", dueDate: "2026-09-19", totalAmount: "2400.00", itemsJson: "Prestation conseil - 10h", notes: "Merci pour votre confiance", termsAndConditions: "Paiement à 30 jours. Toute prestation commencée est due. Les frais et taxes applicables restent à la charge du client." });
  const [quoteForm, setQuoteForm] = useState({ quoteNumber: "DEV-2026-001", clientId: 1, issueDate: "2026-08-19", validUntil: "2026-09-18", totalAmount: "2400.00", itemsJson: "Prestation conseil - 10h", notes: "Merci pour votre demande.", termsAndConditions: "Validité de l’offre : 30 jours. Paiement selon les conditions convenues au devis." });

  const openAgentEdit = (agent: NonNullable<typeof agentsQuery.data>[number]) => {
    setEditingAgentId(agent.id);
    setAgentEditForm({ name: agent.name, email: agent.email, phone: agent.phone || "", position: agent.position, department: agent.department, hireDate: String(agent.hireDate).slice(0, 10), salary: String(agent.salary), contractType: agent.contractType, address: agent.address || "", emergencyContact: agent.emergencyContact || "", notes: agent.notes || "" });
    setAgentFormError("");
    setIsAgentEditOpen(true);
  };

  const openTransactionEdit = (transaction: NonNullable<typeof transactionsQuery.data>[number]) => {
    setEditingTxId(transaction.id);
    setTxForm({ type: transaction.type, category: transaction.category, amount: String(transaction.amount), date: String(transaction.date).slice(0, 10), paymentMethod: transaction.paymentMethod, reference: transaction.reference || "", description: transaction.description, internalNote: transaction.internalNote || "" });
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

  const utils = trpc.useUtils();

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
      salary: agentForm.salary.trim(),
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
      utils.accounting.monthlyReport.invalidate();
    },
    onError: (err) => toast.error("Impossible de supprimer le congé : " + err.message),
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
      toast.success(`${result.quoteNumber} a été ajouté à la comptabilité.`);
      utils.billing.listQuotes.invalidate();
      utils.accounting.listTransactions.invalidate();
      utils.accounting.summary.invalidate();
      utils.accounting.revenueReport.invalidate();
      utils.accounting.automaticReport.invalidate();
    },
    onError: (err) => toast.error("Conversion impossible : " + err.message)
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

  const handleUpdateAgent = () => {
    if (!editingAgentId) return;
    updateAgentMutation.mutate({ id: editingAgentId, ...agentEditForm, name: agentEditForm.name.trim(), email: agentEditForm.email.trim(), phone: agentEditForm.phone.trim(), position: agentEditForm.position.trim(), department: agentEditForm.department.trim(), salary: agentEditForm.salary.trim(), address: agentEditForm.address.trim(), emergencyContact: agentEditForm.emergencyContact.trim(), notes: agentEditForm.notes.trim() });
  };

  const handleDeleteAgent = (agent: { id: number; name: string }) => {
    if (window.confirm(`Supprimer définitivement la fiche de ${agent.name} ? Les pointages et éléments liés restent conservés séparément.`)) {
      deleteAgentMutation.mutate({ id: agent.id });
    }
  };

  const handleUpdateTransaction = () => {
    if (!editingTxId) return;
    updateTxMutation.mutate({ id: editingTxId, ...txForm, reference: txForm.reference.trim(), internalNote: txForm.internalNote.trim() });
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

  const handleUpdateLeave = () => {
    if (!editingLeaveId) return;
    updateLeaveMutation.mutate({ id: editingLeaveId, ...leaveEditForm, reason: leaveEditForm.reason.trim() });
  };

  const handleDeleteLeave = (leave: { id: number; leaveType: string }) => {
    if (window.confirm(`Supprimer cette demande de congé (${leave.leaveType}) ?`)) {
      deleteLeaveMutation.mutate({ id: leave.id });
    }
  };

  // Export CSV Comptabilité
  const exportAccountingCSV = () => {
    const txs = transactionsQuery.data || [];
    let csv = "ID,Type,Categorie,Montant,Date,ModePaiement,Reference,Description\n";
    txs.forEach(t => {
      csv += `${t.id},${t.type},"${t.category}",${t.amount},${t.date},${t.paymentMethod},"${t.reference || ''}","${t.description.replace(/"/g, '""')}"\n`;
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
    appendSheet("Mouvements", (transactionsQuery.data || []).map(tx => ({ ID: tx.id, Type: tx.type, Catégorie: tx.category, MontantEUR: Number(tx.amount), Date: String(tx.date), Mode: tx.paymentMethod, Référence: tx.reference || "", Description: tx.description, NoteInterne: tx.internalNote || "" })));
    appendSheet("Agents RH", (agentsQuery.data || []).map(agent => ({ ID: agent.id, Nom: agent.name, Email: agent.email, Téléphone: agent.phone || "", Poste: agent.position, Département: agent.department, Embauche: String(agent.hireDate), SalaireEUR: Number(agent.salary), Contrat: agent.contractType, Statut: agent.status, Adresse: agent.address || "", ContactUrgence: agent.emergencyContact || "", Notes: agent.notes || "" })));
    appendSheet("Pointages", (timeEntriesQuery.data || []).map(entry => ({ ID: entry.id, AgentID: entry.agentId, Date: String(entry.date), Heures: Number(entry.hoursWorked), Statut: entry.status, Notes: entry.notes || "" })));
    appendSheet("Congés", (leavesQuery.data || []).map(leave => ({ ID: leave.id, AgentID: leave.agentId, Type: leave.leaveType, Début: String(leave.startDate), Fin: String(leave.endDate), Jours: leave.daysCount, Statut: leave.status, Motif: leave.reason || "" })));
    appendSheet("Avances salaire", (advancesQuery.data || []).map(advance => ({ ID: advance.id, AgentID: advance.agentId, MontantEUR: Number(advance.amount), DateDemande: String(advance.requestedDate), Statut: advance.status, MoisDéduction: advance.deductionMonth, Notes: advance.notes || "" })));
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
        { Section: "Comptabilité", Période: report.monthLabel, Mouvements: report.sections.accounting.transactions, EncaisséEUR: report.sections.accounting.collected, DépensesEUR: report.sections.accounting.expenses, SoldeEUR: report.sections.accounting.balance, FacturéEUR: report.sections.accounting.invoiced, PayéEUR: report.sections.accounting.paid },
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 p-8 rounded-2xl shadow-2xl backdrop-blur-xl text-center space-y-6">
          <div className="inline-flex p-4 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
            <Briefcase className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">AgencyManager Pro</h1>
            <p className="text-slate-400 text-sm">
              Logiciel de gestion d’agence haut de gamme : RH, Comptabilité, CRM Kanban, Base Clients et Facturation.
            </p>
          </div>
          <Button onClick={() => startLogin()} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl shadow-lg transition-all">
            Connexion sécurisée
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600 rounded-xl text-white shadow">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">AgencyManager Pro</h1>
            <p className="text-xs text-slate-400">Gestion intégrée d'agence & ERP</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{user?.name || "Administrateur"}</p>
            <p className="text-xs text-indigo-400">Mode Connecté</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => logout()} className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700">
            Déconnexion
          </Button>
        </div>
      </header>

      {/* Main Container with Tabs */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6 overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="w-full overflow-x-auto pb-2 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm flex w-max min-w-max space-x-1">
              <TabsTrigger value="dashboard" className="rounded-xl px-4 py-2 font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <TrendingUp className="w-4 h-4 mr-2" /> Tableau de Bord
              </TabsTrigger>
              <TabsTrigger value="hr" className="rounded-xl px-4 py-2 font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Users className="w-4 h-4 mr-2" /> RH & Agents
              </TabsTrigger>
              <TabsTrigger value="accounting" className="rounded-xl px-4 py-2 font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <DollarSign className="w-4 h-4 mr-2" /> Comptabilité
              </TabsTrigger>
              <TabsTrigger value="crm" className="rounded-xl px-4 py-2 font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Kanban className="w-4 h-4 mr-2" /> CRM Leads
              </TabsTrigger>
              <TabsTrigger value="clients" className="rounded-xl px-4 py-2 font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <Building2 className="w-4 h-4 mr-2" /> Base Clients
              </TabsTrigger>
              <TabsTrigger value="billing" className="rounded-xl px-4 py-2 font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                <FileText className="w-4 h-4 mr-2" /> Devis & Factures
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TABLEAU DE BORD */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-indigo-400" role="button" tabIndex={0} aria-label="Ouvrir la comptabilité depuis le chiffre d’affaires" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Chiffre d’Affaires Encaissé</CardTitle>
                  <ArrowUpRight className="w-5 h-5 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {accountingSummary.data?.totalEntrees?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || '0,00 €'}
                  </div>
                  <div className="mt-3"><Button variant="ghost" size="sm" className="h-7 px-0 text-emerald-700 hover:bg-transparent hover:text-emerald-900" onClick={event => { event.stopPropagation(); openDashboardModule("accounting"); }}>Voir la comptabilité <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-indigo-400" role="button" tabIndex={0} aria-label="Ouvrir les mouvements de caisse" onClick={() => openDashboardModule("accounting")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openDashboardModule("accounting"); }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Trésorerie / Solde Caisse</CardTitle>
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {accountingSummary.data?.solde?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || '0,00 €'}
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
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                        <ChartTooltip formatter={(value: number) => value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} />
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
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                        <ChartTooltip formatter={(value: number) => value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} />
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
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">Encaissé</p><p className="text-xl font-bold text-emerald-600">{(automaticReportQuery.data?.collected || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p></div>
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">Dépenses</p><p className="text-xl font-bold text-rose-600">{(automaticReportQuery.data?.expenses || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p></div>
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">Factures du mois</p><p className="text-xl font-bold text-indigo-700">{automaticReportQuery.data?.invoicesCount || 0}</p></div>
                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-4"><p className="text-xs text-slate-500">À relancer</p><p className="text-xl font-bold text-amber-600">{automaticReportQuery.data?.unpaidCount || 0}</p></div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white lg:col-span-2">
                <CardHeader className="pb-3"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>Reporting intelligent par section</CardTitle><CardDescription>Analyse mensuelle de chaque pôle de l’agence à partir des données enregistrées.</CardDescription></div><div className="flex items-center gap-2"><Label htmlFor="report-month" className="text-xs text-slate-500">Période</Label><Input id="report-month" type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value)} className="w-40 bg-white" /></div></div></CardHeader>
                <CardContent>{monthlyReportQuery.isLoading ? <div className="flex items-center justify-center py-8 text-sm text-slate-500"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Calcul du reporting mensuel…</div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">{[
                  { key: "rh", title: "RH", accent: "text-indigo-700", values: [`${monthlyReportQuery.data?.sections.rh.newAgents || 0} nouveaux agents`, `${monthlyReportQuery.data?.sections.rh.timeEntries || 0} pointages`, `${monthlyReportQuery.data?.sections.rh.openTickets || 0} tickets ouverts`] },
                  { key: "accounting", title: "Comptabilité", accent: "text-emerald-700", values: [`${(monthlyReportQuery.data?.sections.accounting.collected || 0).toLocaleString("fr-FR")} € encaissés`, `${(monthlyReportQuery.data?.sections.accounting.expenses || 0).toLocaleString("fr-FR")} € dépenses`, `${monthlyReportQuery.data?.sections.accounting.transactions || 0} mouvements`] },
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
                          {tx.type === 'entrée' ? '+' : '-'}{Number(tx.amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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
                      <Label>Salaire net (€)</Label>
                      <Input value={agentForm.salary} onChange={e => setAgentForm({...agentForm, salary: e.target.value})} placeholder="3500.00" />
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
                      <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">{agentTimeEntriesQuery.isLoading ? <p className="text-xs text-slate-500">Chargement de la feuille…</p> : agentTimeEntriesQuery.data?.length ? agentTimeEntriesQuery.data.slice(0, 5).map(entry => <div key={entry.id} className="flex items-center justify-between text-xs text-slate-600"><span>{String(entry.date).slice(0, 10)}</span><span>{entry.hoursWorked} h · {entry.status}</span></div>) : <p className="text-xs text-slate-500">Aucun pointage enregistré pour cet agent.</p>}</div>
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
                      <div className="space-y-2"><Label>Heures travaillées</Label><Input type="number" min="0" max="24" step="0.25" value={timeEntryForm.hoursWorked} onChange={e => setTimeEntryForm({ ...timeEntryForm, hoursWorked: e.target.value })} /></div>
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
                      <div className="space-y-2"><Label>Nombre de jours</Label><Input type="number" min="0.5" step="0.5" value={leaveEditForm.daysCount} onChange={e => setLeaveEditForm({ ...leaveEditForm, daysCount: Number(e.target.value) })} /></div>
                      <div className="space-y-2"><Label>Date de début</Label><Input type="date" value={leaveEditForm.startDate} onChange={e => setLeaveEditForm({ ...leaveEditForm, startDate: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Date de fin</Label><Input type="date" value={leaveEditForm.endDate} onChange={e => setLeaveEditForm({ ...leaveEditForm, endDate: e.target.value })} /></div>
                    </div>
                    <div className="space-y-2"><Label>Motif / note RH</Label><Textarea value={leaveEditForm.reason} onChange={e => setLeaveEditForm({ ...leaveEditForm, reason: e.target.value })} placeholder="Précisez la demande ou sa correction…" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleUpdateLeave} disabled={!editingLeaveId || updateLeaveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{updateLeaveMutation.isPending ? "Enregistrement…" : "Enregistrer la correction"}</Button></DialogFooter>
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
                    <div className="space-y-2"><Label>Salaire net (€)</Label><Input type="number" min="0" value={agentEditForm.salary} onChange={e => setAgentEditForm({ ...agentEditForm, salary: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Type de contrat</Label><Select value={agentEditForm.contractType} onValueChange={value => setAgentEditForm({ ...agentEditForm, contractType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CDI">CDI</SelectItem><SelectItem value="CDD">CDD</SelectItem><SelectItem value="Stage">Stage</SelectItem><SelectItem value="Freelance">Freelance</SelectItem></SelectContent></Select></div>
                    <div className="col-span-2 space-y-2"><Label>Note interne RH</Label><Textarea value={agentEditForm.notes} onChange={e => setAgentEditForm({ ...agentEditForm, notes: e.target.value })} placeholder="Observations utiles sur le dossier agent…" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleUpdateAgent} disabled={updateAgentMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{updateAgentMutation.isPending ? "Enregistrement…" : "Enregistrer les modifications"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Tableau des agents */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Liste des collaborateurs</CardTitle>
                <CardDescription>Fiches de renseignement, ancienneté et contrats de travail</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Collaborateur</TableHead>
                      <TableHead>Poste & Département</TableHead>
                      <TableHead>Contrat</TableHead>
                      <TableHead>Ancienneté</TableHead>
                      <TableHead>Salaire Net</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentsQuery.data?.map(agent => {
                      const hireYear = new Date(agent.hireDate).getFullYear();
                      const seniority = 2026 - hireYear;
                      return (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{agent.name}</span>
                              <span className="text-xs text-slate-500">{agent.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{agent.position}</span>
                              <span className="text-xs text-slate-500">{agent.department}</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{agent.contractType}</Badge></TableCell>
                          <TableCell>{seniority} an(s) (depuis {String(agent.hireDate)})</TableCell>
                          <TableCell>{Number(agent.salary).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</TableCell>
                          <TableCell><Badge className="bg-emerald-100 text-emerald-800">{agent.status}</Badge></TableCell>
                          <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="Modifier la fiche agent" onClick={() => openAgentEdit(agent)}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="outline" className="h-8 w-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50" title="Supprimer la fiche agent" onClick={() => handleDeleteAgent(agent)} disabled={deleteAgentMutation.isPending}><Trash2 className="w-3.5 h-3.5" /></Button><Button size="sm" variant="outline" className="rounded-lg border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => { setSelectedTimeEntryAgentId(agent.id); setTimeEntryForm(form => ({ ...form, agentId: agent.id })); setIsTimeEntryOpen(true); }}><Clock className="w-3.5 h-3.5 mr-1" /> Pointer</Button></div></TableCell>
                        </TableRow>
                      );
                    })}
                    {(!agentsQuery.data || agentsQuery.data.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-slate-500">Aucun agent enregistré.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Section Pointages, Congés et Avances sur salaire */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader>
                  <CardTitle>Feuille de Pointage & Horaires</CardTitle>
                  <CardDescription>Suivi journalier du temps de travail des agents</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Agent ID</TableHead>
                        <TableHead>Heures</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeEntriesQuery.data?.map(te => (
                        <TableRow key={te.id}>
                          <TableCell>{String(te.date).slice(0, 10)}</TableCell>
                          <TableCell>{agentsQuery.data?.find(agent => agent.id === te.agentId)?.name || `Agent #${te.agentId}`}</TableCell>
                          <TableCell className="font-semibold">{te.hoursWorked}h</TableCell>
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
                        <div className="flex justify-end gap-1"><Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="Corriger la demande" onClick={() => openLeaveEdit(leave)}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="outline" className="h-8 w-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50" title="Supprimer la demande" onClick={() => handleDeleteLeave(leave)} disabled={deleteLeaveMutation.isPending}><Trash2 className="w-3.5 h-3.5" /></Button></div>
                      </div>;
                    })}
                    {(!leavesQuery.data || leavesQuery.data.length === 0) && <p className="py-8 text-center text-sm text-slate-500">Aucune demande de congé.</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader>
                  <CardTitle>Avances sur Salaire & Déductions</CardTitle>
                  <CardDescription>Suivi des demandes d’acomptes à déduire du salaire net</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Mois déduction</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {advancesQuery.data?.map(adv => (
                        <TableRow key={adv.id}>
                          <TableCell>Agent #{adv.agentId}</TableCell>
                          <TableCell className="font-bold text-indigo-600">{Number(adv.amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</TableCell>
                          <TableCell>{adv.deductionMonth}</TableCell>
                          <TableCell><Badge>{adv.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {(!advancesQuery.data || advancesQuery.data.length === 0) && (
                        <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-500">Aucune avance en cours.</TableCell></TableRow>
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
                      <div className="space-y-2">
                        <Label>Montant (€)</Label>
                        <Input value={txForm.amount} onChange={e => setTxForm({...txForm, amount: e.target.value})} placeholder="1500.00" />
                      </div>
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
                      <Button onClick={() => createTxMutation.mutate(txForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                        Enregistrer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={isTxEditOpen} onOpenChange={setIsTxEditOpen}>
                  <DialogContent className="max-w-lg bg-white rounded-2xl">
                    <DialogHeader><DialogTitle>Corriger un mouvement comptable</DialogTitle><DialogDescription>Modifiez les informations ou ajoutez une note interne de suivi.</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Type</Label><Select value={txForm.type} onValueChange={value => setTxForm({ ...txForm, type: value as typeof txForm.type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="entrée">Entrée</SelectItem><SelectItem value="sortie">Sortie</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Montant (€)</Label><Input type="number" min="0" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} /></div></div>
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
                      <TableHead className="text-right">Montant</TableHead>
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
                          {tx.type === 'entrée' ? '+' : '-'}{Number(tx.amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
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

            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Répertoire Clients</CardTitle>
                <CardDescription>Regroupements, filtres et accès aux factures et documents</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entreprise</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email & Téléphone</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientsQuery.data?.map(client => (
                      <TableRow key={client.id}>
                        <TableCell className="font-semibold text-slate-900">{client.companyName}</TableCell>
                        <TableCell>{client.contactName}</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs text-slate-500">
                            <span>{client.email}</span>
                            <span>{client.phone || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{client.category}</Badge></TableCell>
                        <TableCell><Badge className="bg-emerald-100 text-emerald-800">{client.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {(!clientsQuery.data || clientsQuery.data.length === 0) && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">Aucun client enregistré.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FACTURATION ET DEVIS */}
          <TabsContent value="billing" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Facturation & Devis</h2>
                <p className="text-sm text-slate-500">Documents professionnels avec libellés clairs, numérotation automatique et statuts contrôlés</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span className="font-semibold text-slate-700">Conversion affichée :</span><span>1 EUR =</span><Input className="h-8 w-24 bg-white" inputMode="decimal" value={eurToMgaRate} onChange={e => setEurToMgaRate(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Taux euro vers ariary" /><span className="font-semibold text-slate-700">MGA</span><span className="text-slate-400">Taux de référence modifiable</span><span className="ml-2 h-4 w-px bg-slate-200" /><div className="flex items-center gap-2"><Switch checked={showMGAEquivalent} onCheckedChange={setShowMGAEquivalent} id="show-mga-equivalent" /><Label htmlFor="show-mga-equivalent" className="cursor-pointer text-xs font-semibold text-slate-700">Afficher l’équivalent MGA</Label></div></div>
              </div>
              <Dialog open={isQuoteOpen} onOpenChange={setIsQuoteOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" onClick={() => { setQuoteForm({ ...quoteForm, quoteNumber: nextQuoteNumberQuery.data || quoteForm.quoteNumber }); setIsQuoteOpen(true); }} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl">
                    <FileText className="w-4 h-4 mr-2" /> Créer un devis
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl bg-white rounded-2xl">
                  <DialogHeader><DialogTitle>Créer un devis professionnel</DialogTitle></DialogHeader>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
                    <div className="flex items-start justify-between border-b border-slate-200 pb-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">AgencyManager Pro</p><p className="mt-1 text-xs text-slate-500">Proposition commerciale</p></div><div className="text-right"><p className="text-2xl font-black tracking-tight">DEVIS</p><p className="text-sm font-semibold text-slate-600">N° {quoteForm.quoteNumber}</p></div></div>
                    <div className="grid grid-cols-2 gap-4 border-b border-slate-200 py-4 text-xs"><div><p className="font-bold uppercase tracking-wider text-slate-400">Proposé à</p><p className="mt-1 font-semibold">Client #{quoteForm.clientId}</p></div><div className="text-right"><p className="font-bold uppercase tracking-wider text-slate-400">Validité</p><p className="mt-1">Jusqu’au <span className="font-semibold">{quoteForm.validUntil}</span></p></div></div>
                    <div className="flex items-start justify-between py-4 text-sm"><span>{quoteForm.itemsJson || "Ligne de prestation à compléter"}</span><span className="text-right font-bold">{Number(quoteForm.totalAmount || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}{showMGAEquivalent && <span className="block text-xs font-medium text-slate-500">{formatMGA(Number(quoteForm.totalAmount || 0), Number(eurToMgaRate) || 0)}</span>}</span></div>
                    <div className="flex justify-end border-t border-slate-200 pt-4 text-sm"><div className="space-y-1 text-right"><div className="font-semibold">Total de la proposition : {Number(quoteForm.totalAmount || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</div>{showMGAEquivalent && <div className="text-xs text-slate-500">Équivalent : {formatMGA(Number(quoteForm.totalAmount || 0), Number(eurToMgaRate) || 0)}</div>}</div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2"><Label>Numéro du devis</Label><Input value={quoteForm.quoteNumber} onChange={e => setQuoteForm({ ...quoteForm, quoteNumber: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Référence client</Label><Input type="number" value={quoteForm.clientId} onChange={e => setQuoteForm({ ...quoteForm, clientId: Number(e.target.value) })} /></div>
                    <div className="space-y-2"><Label>Date d’émission</Label><Input type="date" value={quoteForm.issueDate} onChange={e => setQuoteForm({ ...quoteForm, issueDate: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Valable jusqu’au</Label><Input type="date" value={quoteForm.validUntil} onChange={e => setQuoteForm({ ...quoteForm, validUntil: e.target.value })} /></div>
                    <div className="space-y-2 col-span-2"><Label>Montant total (€)</Label><Input inputMode="decimal" value={quoteForm.totalAmount} onChange={e => setQuoteForm({ ...quoteForm, totalAmount: e.target.value })} /></div>
                    <div className="space-y-2 col-span-2"><Label>Libellé / lignes de prestation</Label><Textarea value={quoteForm.itemsJson} onChange={e => setQuoteForm({ ...quoteForm, itemsJson: e.target.value })} /></div>
                    <div className="space-y-2 col-span-2"><Label>Notes</Label><Textarea value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} /></div>
                    <div className="space-y-2 col-span-2"><Label>Conditions générales de vente (CGV)</Label><Textarea value={quoteForm.termsAndConditions} onChange={e => setQuoteForm({ ...quoteForm, termsAndConditions: e.target.value })} placeholder="Validité, paiement, propriété intellectuelle, annulation…" /></div>
                  </div>
                  <DialogFooter><Button onClick={() => createQuoteMutation.mutate(quoteForm)} disabled={createQuoteMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">{createQuoteMutation.isPending ? "Création…" : "Enregistrer le devis"}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditingInvoiceId(null); setInvoiceForm({ ...invoiceForm, invoiceNumber: nextInvoiceNumberQuery.data || invoiceForm.invoiceNumber }); }} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                    <Plus className="w-4 h-4 mr-2" /> Nouvelle facture
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl bg-white rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingInvoiceId ? "Modifier la facture brouillon" : "Créer une facture professionnelle"}</DialogTitle>
                  </DialogHeader>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-slate-900">
                    <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">AgencyManager Pro</p><p className="mt-1 text-xs text-slate-500">Gestion intégrée d’agence & ERP</p></div>
                      <div className="text-right"><p className="text-2xl font-black tracking-tight">FACTURE</p><p className="text-sm font-semibold text-slate-600">N° {invoiceForm.invoiceNumber || "Nouveau document"}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-b border-slate-200 py-4 text-xs">
                      <div><p className="font-bold uppercase tracking-wider text-slate-400">Facturé à</p><p className="mt-1 font-semibold">Client #{invoiceForm.clientId}</p><p className="text-slate-500">Fiche client associée</p></div>
                      <div className="text-right"><p className="font-bold uppercase tracking-wider text-slate-400">Dates</p><p className="mt-1">Émission : <span className="font-semibold">{invoiceForm.issueDate}</span></p><p>Échéance : <span className="font-semibold">{invoiceForm.dueDate}</span></p></div>
                    </div>
                    <div className="py-4"><div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500"><span>Désignation</span><span>Montant TTC</span></div><div className="flex items-start justify-between px-3 py-3 text-sm"><span className="max-w-[70%]">{invoiceForm.itemsJson || "Ligne de prestation à compléter"}</span><span className="text-right font-bold"><span className="block">{Number(invoiceForm.totalAmount || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span>{showMGAEquivalent && <span className="block text-xs font-medium text-slate-500">{formatMGA(Number(invoiceForm.totalAmount || 0), Number(eurToMgaRate) || 0)}</span>}</span></div></div>
                    <div className="flex justify-end border-t border-slate-200 pt-4"><div className="w-56 space-y-2 text-sm"><div className="flex justify-between text-slate-500"><span>Total TTC (EUR)</span><span>{Number(invoiceForm.totalAmount || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span></div>{showMGAEquivalent && <div className="flex justify-between text-slate-500"><span>Équivalent (MGA)</span><span>{formatMGA(Number(invoiceForm.totalAmount || 0), Number(eurToMgaRate) || 0)}</span></div>}<div className="flex justify-between border-t border-slate-900 pt-2 text-base font-black"><span>Net à payer</span><span>{Number(invoiceForm.totalAmount || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span></div></div></div>
                    <p className="mt-4 text-[11px] text-slate-400">Conditions de règlement : se référer aux notes et à la date d’échéance indiquées.</p><div className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500"><span className="font-bold uppercase tracking-wider text-slate-400">CGV</span><p className="mt-1 whitespace-pre-wrap">{invoiceForm.termsAndConditions || "CGV à compléter"}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2"><Label>Numéro de facture</Label><Input value={invoiceForm.invoiceNumber} disabled={Boolean(editingInvoiceId)} onChange={e => setInvoiceForm({...invoiceForm, invoiceNumber: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Référence client</Label><Input type="number" value={invoiceForm.clientId} onChange={e => setInvoiceForm({...invoiceForm, clientId: Number(e.target.value)})} /></div>
                    <div className="space-y-2"><Label>Date d’émission</Label><Input type="date" value={invoiceForm.issueDate} onChange={e => setInvoiceForm({...invoiceForm, issueDate: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Date d’échéance</Label><Input type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm({...invoiceForm, dueDate: e.target.value})} /></div>
                    <div className="space-y-2 col-span-2"><Label>Montant total TTC (€)</Label><Input value={invoiceForm.totalAmount} onChange={e => setInvoiceForm({...invoiceForm, totalAmount: e.target.value})} placeholder="2400.00" /></div>
                    <div className="space-y-2 col-span-2"><Label>Libellé / lignes de prestation</Label><Textarea value={invoiceForm.itemsJson} onChange={e => setInvoiceForm({...invoiceForm, itemsJson: e.target.value})} placeholder="Conseil stratégique — 10 heures" /></div>
                    <div className="space-y-2 col-span-2"><Label>Notes et conditions de règlement</Label><Textarea value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes: e.target.value})} placeholder="Paiement à 30 jours, merci pour votre confiance." /></div>
                    <div className="space-y-2 col-span-2"><Label>Conditions générales de vente (CGV)</Label><Textarea value={invoiceForm.termsAndConditions} onChange={e => setInvoiceForm({...invoiceForm, termsAndConditions: e.target.value})} placeholder="Délais de paiement, pénalités, propriété intellectuelle…" /></div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => editingInvoiceId ? updateInvoiceDraftMutation.mutate({ id: editingInvoiceId, clientId: invoiceForm.clientId, quoteId: invoiceForm.quoteId, issueDate: invoiceForm.issueDate, dueDate: invoiceForm.dueDate, totalAmount: invoiceForm.totalAmount, itemsJson: invoiceForm.itemsJson, notes: invoiceForm.notes, termsAndConditions: invoiceForm.termsAndConditions }) : createInvoiceMutation.mutate(invoiceForm)} disabled={createInvoiceMutation.isPending || updateInvoiceDraftMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                      {editingInvoiceId ? "Enregistrer le brouillon" : "Créer la facture"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Factures & libellés commerciaux</CardTitle>
                <CardDescription>Présentées dans un format clair, proche des usages de facture.net. Une facture en brouillon reste modifiable.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Libellé</TableHead><TableHead>Client</TableHead><TableHead>Émission</TableHead><TableHead>Échéance</TableHead><TableHead>Montant TTC</TableHead><CommercialMGAColumnHeader show={showMGAEquivalent} /><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {invoicesQuery.data?.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell><div className="flex flex-col"><span className="font-bold text-slate-900">Facture · {inv.invoiceNumber}</span><span className="text-xs text-slate-500">Document commercial AgencyManager Pro</span></div></TableCell>
                        <TableCell>Client #{inv.clientId}</TableCell>
                        <TableCell>{String(inv.issueDate).slice(0, 10)}</TableCell>
                        <TableCell>{String(inv.dueDate).slice(0, 10)}</TableCell>
                        <TableCell className="font-semibold">{Number(inv.totalAmount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</TableCell>
                        <CommercialMGAColumnCell show={showMGAEquivalent} amount={Number(inv.totalAmount)} rate={Number(eurToMgaRate) || 0} />
                        <TableCell><Badge variant={inv.status === "brouillon" ? "secondary" : "outline"}>{inv.status}</Badge></TableCell>
                        <TableCell className="text-right"><div className="flex justify-end gap-2">{inv.status === "brouillon" ? <Button size="sm" variant="outline" onClick={() => { setEditingInvoiceId(inv.id); setInvoiceForm({ invoiceNumber: inv.invoiceNumber, clientId: inv.clientId, quoteId: inv.quoteId || undefined, issueDate: String(inv.issueDate).slice(0, 10), dueDate: String(inv.dueDate).slice(0, 10), totalAmount: String(inv.totalAmount), itemsJson: inv.itemsJson, notes: inv.notes || "", termsAndConditions: inv.termsAndConditions || "" }); setIsInvoiceOpen(true); }}>Modifier</Button> : <span className="text-xs text-slate-400">Verrouillée</span>}<Button size="sm" variant="outline" onClick={() => downloadCommercialDocument("facture", { number: inv.invoiceNumber, clientId: inv.clientId, issueDate: inv.issueDate, dueDate: inv.dueDate, totalAmount: inv.totalAmount, itemsJson: inv.itemsJson, notes: inv.notes, termsAndConditions: inv.termsAndConditions })}><Download className="mr-1 h-3.5 w-3.5" /> Télécharger</Button></div></TableCell>
                      </TableRow>
                    ))}
                    {(!invoicesQuery.data || invoicesQuery.data.length === 0) && <TableRow><TableCell colSpan={getCommercialTableColumnCount(showMGAEquivalent)} className="text-center py-6 text-slate-500">Aucune facture enregistrée.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader><CardTitle>Devis commerciaux</CardTitle><CardDescription>Création, suivi de validité et téléchargement des propositions avec CGV.</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Libellé</TableHead><TableHead>Client</TableHead><TableHead>Émission</TableHead><TableHead>Validité</TableHead><TableHead>Montant EUR</TableHead><CommercialMGAColumnHeader show={showMGAEquivalent} /><TableHead>Statut</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {quotesQuery.data?.map(quote => (
                      <TableRow key={quote.id}>
                        <TableCell><div className="flex flex-col"><span className="font-bold text-slate-900">Devis · {quote.quoteNumber}</span><span className="text-xs text-slate-500">{quote.termsAndConditions ? "CGV renseignées" : "CGV à compléter"}</span></div></TableCell>
                        <TableCell>Client #{quote.clientId}</TableCell>
                        <TableCell>{String(quote.issueDate).slice(0, 10)}</TableCell>
                        <TableCell>{String(quote.validUntil).slice(0, 10)}</TableCell>
                        <TableCell className="font-semibold">{Number(quote.totalAmount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</TableCell>
                        <CommercialMGAColumnCell show={showMGAEquivalent} amount={Number(quote.totalAmount)} rate={Number(eurToMgaRate) || 0} />
                        <TableCell><Badge variant={quote.status === "brouillon" ? "secondary" : "outline"}>{quote.status}</Badge></TableCell>
                        <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => downloadCommercialDocument("devis", { number: quote.quoteNumber, clientId: quote.clientId, issueDate: quote.issueDate, validUntil: quote.validUntil, totalAmount: quote.totalAmount, itemsJson: quote.itemsJson, notes: quote.notes, termsAndConditions: quote.termsAndConditions })}><Download className="mr-1 h-3.5 w-3.5" /> Télécharger</Button><Button size="sm" variant="outline" disabled={quote.status === "facturé" || convertQuoteMutation.isPending} onClick={() => convertQuoteMutation.mutate({ quoteId: quote.id })} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"><DollarSign className="mr-1 h-3.5 w-3.5" /> {quote.status === "facturé" ? "En compta" : "Passer en compta"}</Button></div></TableCell>
                      </TableRow>
                    ))}
                    {(!quotesQuery.data || quotesQuery.data.length === 0) && <TableRow><TableCell colSpan={getCommercialTableColumnCount(showMGAEquivalent)} className="text-center py-6 text-slate-500">Aucun devis enregistré. Cliquez sur « Créer un devis » pour commencer.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
