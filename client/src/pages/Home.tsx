import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { 
  Users, DollarSign, Kanban, Building2, FileText, Ticket, 
  Plus, Search, Download, CheckCircle, Clock, AlertCircle, 
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, FileSpreadsheet, 
  UserPlus, Briefcase, Calendar, ShieldCheck, ExternalLink, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { startLogin } from "@/const";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Requêtes tRPC
  const agentsQuery = trpc.hr.listAgents.useQuery(undefined, { enabled: isAuthenticated });
  const timeEntriesQuery = trpc.hr.listTimeEntries.useQuery(undefined, { enabled: isAuthenticated });
  const leavesQuery = trpc.hr.listLeaves.useQuery(undefined, { enabled: isAuthenticated });
  const advancesQuery = trpc.hr.listSalaryAdvances.useQuery(undefined, { enabled: isAuthenticated });
  const contractsQuery = trpc.hr.listContracts.useQuery(undefined, { enabled: isAuthenticated });
  const ticketsQuery = trpc.hr.listTickets.useQuery(undefined, { enabled: isAuthenticated });
  
  const transactionsQuery = trpc.accounting.listTransactions.useQuery(undefined, { enabled: isAuthenticated });
  const accountingSummary = trpc.accounting.summary.useQuery(undefined, { enabled: isAuthenticated });
  
  const leadsQuery = trpc.crm.listLeads.useQuery(undefined, { enabled: isAuthenticated });
  
  const clientsQuery = trpc.clientsModule.listClients.useQuery(undefined, { enabled: isAuthenticated });
  const interactionsQuery = trpc.clientsModule.listInteractions.useQuery(undefined, { enabled: isAuthenticated });
  const documentsQuery = trpc.clientsModule.listDocuments.useQuery(undefined, { enabled: isAuthenticated });
  
  const quotesQuery = trpc.billing.listQuotes.useQuery(undefined, { enabled: isAuthenticated });
  const invoicesQuery = trpc.billing.listInvoices.useQuery(undefined, { enabled: isAuthenticated });

  // États pour les modals de création
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [agentForm, setAgentForm] = useState({ name: "", email: "", phone: "", position: "", department: "", hireDate: "2026-01-01", salary: "3000.00", contractType: "CDI", address: "", emergencyContact: "", notes: "" });

  const [isTxOpen, setIsTxOpen] = useState(false);
  const [txForm, setTxForm] = useState({ type: "entrée" as "entrée" | "sortie", category: "Vente client", amount: "1500.00", date: "2026-08-19", paymentMethod: "Virement", reference: "REF-001", description: "Paiement prestation web" });

  const [isLeadOpen, setIsLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ companyName: "", contactName: "", email: "", phone: "", expectedAmount: "5000.00", priority: "moyenne" as const, status: "nouveau" as const, nextContactDate: "2026-08-25", notes: "" });

  const [isClientOpen, setIsClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ companyName: "", contactName: "", email: "", phone: "", address: "", industry: "Conseil", category: "Standard", notes: "" });

  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "FAC-2026-001", clientId: 1, issueDate: "2026-08-19", dueDate: "2026-09-19", totalAmount: "2400.00", itemsJson: "Prestation conseil - 10h", notes: "Merci pour votre confiance" });

  const utils = trpc.useUtils();

  const createAgentMutation = trpc.hr.createAgent.useMutation({
    onSuccess: () => {
      toast.success("Agent enregistré avec succès !");
      setIsAgentOpen(false);
      utils.hr.listAgents.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
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

  const createInvoiceMutation = trpc.billing.createInvoice.useMutation({
    onSuccess: () => {
      toast.success("Facture générée avec style !");
      setIsInvoiceOpen(false);
      utils.billing.listInvoices.invalidate();
    },
    onError: (err) => toast.error("Erreur : " + err.message)
  });

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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex overflow-x-auto pb-2 scrollbar-none">
            <TabsList className="bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm flex space-x-1">
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
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Chiffre d’Affaires Encaissé</CardTitle>
                  <ArrowUpRight className="w-5 h-5 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {accountingSummary.data?.totalEntrees?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || '0,00 €'}
                  </div>
                  <p className="text-xs text-emerald-600 mt-1 font-medium">+12% ce mois-ci</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Trésorerie / Solde Caisse</CardTitle>
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {accountingSummary.data?.solde?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) || '0,00 €'}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Entrées vs Sorties</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Agents Actifs</CardTitle>
                  <Users className="w-5 h-5 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {agentsQuery.data?.length || 0} collaborateurs
                  </div>
                  <p className="text-xs text-blue-600 mt-1 font-medium">Contrats CDI & CDD</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Leads en Pipeline</CardTitle>
                  <Kanban className="w-5 h-5 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {leadsQuery.data?.length || 0} prospects
                  </div>
                  <p className="text-xs text-amber-600 mt-1 font-medium">Kanban dynamique</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-slate-200 shadow-sm bg-white">
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

              <Card className="border-slate-200 shadow-sm bg-white">
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
              <Dialog open={isAgentOpen} onOpenChange={setIsAgentOpen}>
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
                  <DialogFooter>
                    <Button onClick={() => createAgentMutation.mutate(agentForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                      Enregistrer l'agent
                    </Button>
                  </DialogFooter>
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
                        </TableRow>
                      );
                    })}
                    {(!agentsQuery.data || agentsQuery.data.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-slate-500">Aucun agent enregistré.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Section Pointages, Congés et Avances sur salaire */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeEntriesQuery.data?.map(te => (
                        <TableRow key={te.id}>
                          <TableCell>{String(te.date)}</TableCell>
                          <TableCell>Agent #{te.agentId}</TableCell>
                          <TableCell className="font-semibold">{te.hoursWorked}h</TableCell>
                          <TableCell><Badge variant="outline">{te.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {(!timeEntriesQuery.data || timeEntriesQuery.data.length === 0) && (
                        <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-500">Aucun pointage récent.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
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
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Exporter CSV / Excel
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
                    </div>
                    <DialogFooter>
                      <Button onClick={() => createTxMutation.mutate(txForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                        Enregistrer
                      </Button>
                    </DialogFooter>
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
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
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
                        <TableCell>{tx.paymentMethod}</TableCell>
                        <TableCell className={`text-right font-bold ${tx.type === 'entrée' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.type === 'entrée' ? '+' : '-'}{Number(tx.amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!transactionsQuery.data || transactionsQuery.data.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">Aucun mouvement enregistré.</TableCell></TableRow>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {['nouveau', 'contacté', 'proposition', 'gagne'].map(statusCol => (
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
                        <div className="text-xs text-slate-400 flex items-center pt-1 border-t border-slate-100 justify-between">
                          <span>RDV : {lead.nextContactDate ? String(lead.nextContactDate) : 'Non planifié'}</span>
                          {statusCol !== 'gagne' && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-indigo-600 hover:bg-indigo-50" onClick={() => convertLeadMutation.mutate({ leadId: lead.id })}>
                              Convertir → Client
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
                <h2 className="text-2xl font-bold tracking-tight">Facturation & Devis (Style Facture.net)</h2>
                <p className="text-sm text-slate-500">Génération de documents professionnels, numérotation automatique et statuts</p>
              </div>
              <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                    <Plus className="w-4 h-4 mr-2" /> Nouvelle Facture
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-white rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Générer une facture</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Numéro de facture</Label>
                      <Input value={invoiceForm.invoiceNumber} onChange={e => setInvoiceForm({...invoiceForm, invoiceNumber: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Client ID (référence base clients)</Label>
                      <Input type="number" value={invoiceForm.clientId} onChange={e => setInvoiceForm({...invoiceForm, clientId: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Montant Total (€)</Label>
                      <Input value={invoiceForm.totalAmount} onChange={e => setInvoiceForm({...invoiceForm, totalAmount: e.target.value})} placeholder="2400.00" />
                    </div>
                    <div className="space-y-2">
                      <Label>Détail / Lignes de facture</Label>
                      <Textarea value={invoiceForm.itemsJson} onChange={e => setInvoiceForm({...invoiceForm, itemsJson: e.target.value})} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => createInvoiceMutation.mutate(invoiceForm)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                      Créer la facture
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Liste des Factures</CardTitle>
                <CardDescription>Suivi des règlements et statuts comptables</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro</TableHead>
                      <TableHead>Client ID</TableHead>
                      <TableHead>Date d'émission</TableHead>
                      <TableHead>Échéance</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesQuery.data?.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-bold text-slate-900">{inv.invoiceNumber}</TableCell>
                        <TableCell>Client #{inv.clientId}</TableCell>
                        <TableCell>{String(inv.issueDate)}</TableCell>
                        <TableCell>{String(inv.dueDate)}</TableCell>
                        <TableCell className="font-semibold">{Number(inv.totalAmount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</TableCell>
                        <TableCell><Badge variant="outline">{inv.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {(!invoicesQuery.data || invoicesQuery.data.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-slate-500">Aucune facture émise.</TableCell></TableRow>
                    )}
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
