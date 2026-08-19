export const ROLE_KEYS = ["collaborateur", "superviseur", "admin"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSION_KEYS = [
  "dashboard.view",
  "dashboard.revenue.view",
  "hr.self.view",
  "hr.team.view",
  "hr.manage",
  "hr.timeEntry.create",
  "hr.timeEntry.edit",
  "hr.timeEntry.delete",
  "hr.request.create",
  "hr.request.edit",
  "hr.request.cancel",
  "hr.request.manage",
  "tickets.create",
  "tickets.manage",
  "accounting.view",
  "crm.view",
  "billing.view",
  "stats.hr.view",
  "stats.ca.view",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, { label: string; description: string; group: string }> = {
  "dashboard.view": { label: "Tableau de bord", description: "Accéder au tableau de bord personnel ou d’équipe", group: "Pilotage" },
  "dashboard.revenue.view": { label: "Chiffre d’affaires", description: "Afficher les indicateurs et graphiques de CA", group: "Pilotage" },
  "hr.self.view": { label: "Mes données RH", description: "Consulter ses pointages, congés, avances et tickets", group: "Ressources humaines" },
  "hr.team.view": { label: "Données de l’équipe", description: "Consulter les données RH de l’équipe attribuée", group: "Ressources humaines" },
  "hr.manage": { label: "Gestion RH", description: "Créer et gérer les fiches agents, contrats et données RH", group: "Ressources humaines" },
  "hr.timeEntry.create": { label: "Créer un pointage", description: "Ajouter un pointage dans sa feuille ou celle de l’équipe", group: "Ressources humaines" },
  "hr.timeEntry.edit": { label: "Modifier un pointage", description: "Corriger un pointage existant", group: "Ressources humaines" },
  "hr.timeEntry.delete": { label: "Supprimer un pointage", description: "Supprimer un pointage existant", group: "Ressources humaines" },
  "hr.request.create": { label: "Créer une demande RH", description: "Demander une avance, un congé ou une permission", group: "Ressources humaines" },
  "hr.request.edit": { label: "Modifier ses demandes RH", description: "Modifier une demande de congé encore en attente", group: "Ressources humaines" },
  "hr.request.cancel": { label: "Annuler ses demandes RH", description: "Annuler une demande de congé avant sa clôture", group: "Ressources humaines" },
  "hr.request.manage": { label: "Traiter les demandes RH", description: "Mettre à jour les statuts et suivre les demandes", group: "Ressources humaines" },
  "tickets.create": { label: "Créer un ticket", description: "Créer un ticket de suivi rattaché à son compte", group: "Tickets" },
  "tickets.manage": { label: "Gérer les tickets", description: "Mettre à jour les tickets de l’équipe", group: "Tickets" },
  "accounting.view": { label: "Comptabilité", description: "Consulter les mouvements et rapports comptables", group: "Données métier" },
  "crm.view": { label: "CRM", description: "Consulter les leads et clients", group: "Données métier" },
  "billing.view": { label: "Devis & factures", description: "Consulter les documents commerciaux", group: "Données métier" },
  "stats.hr.view": { label: "Statistiques RH", description: "Consulter les statistiques sociales et d’équipe", group: "Statistiques" },
  "stats.ca.view": { label: "Statistiques CA", description: "Consulter les statistiques commerciales", group: "Statistiques" },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  collaborateur: ["dashboard.view", "hr.self.view", "hr.timeEntry.create", "hr.request.create", "hr.request.edit", "hr.request.cancel", "tickets.create"],
  superviseur: ["dashboard.view", "dashboard.revenue.view", "hr.self.view", "hr.team.view", "hr.manage", "hr.timeEntry.create", "hr.timeEntry.edit", "hr.timeEntry.delete", "hr.request.create", "hr.request.edit", "hr.request.cancel", "hr.request.manage", "tickets.create", "tickets.manage", "accounting.view", "crm.view", "billing.view", "stats.hr.view", "stats.ca.view"],
  admin: [...PERMISSION_KEYS],
};

export const PERMISSION_GROUPS = ["Pilotage", "Ressources humaines", "Tickets", "Données métier", "Statistiques"] as const;
