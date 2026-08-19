export const PROJECT_TEMPLATE_KEYS = [
  "agence_complete",
  "studio_creatif",
  "prestations_rh",
] as const;

export type ProjectTemplateKey = (typeof PROJECT_TEMPLATE_KEYS)[number];

export type ProjectTemplateDefinition = {
  key: ProjectTemplateKey;
  label: string;
  shortDescription: string;
  description: string;
  modules: string[];
  accentClassName: string;
};

export const PROJECT_TEMPLATES: ProjectTemplateDefinition[] = [
  {
    key: "agence_complete",
    label: "Agence 360°",
    shortDescription: "Le modèle complet pour piloter toute l’agence.",
    description: "RH, comptabilité, CRM, clients, catalogue, devis, factures, statistiques et budget planner dans un même espace.",
    modules: ["RH", "Comptabilité", "CRM", "Clients", "Facturation", "Statistiques"],
    accentClassName: "border-indigo-200 bg-indigo-50/70",
  },
  {
    key: "studio_creatif",
    label: "Studio créatif",
    shortDescription: "Un espace orienté projets, clients et prestations.",
    description: "Un cadre léger pour les studios créatifs avec CRM, base clients, catalogue, devis/factures et suivi de rentabilité.",
    modules: ["CRM", "Clients", "Catalogue", "Facturation", "Budget"],
    accentClassName: "border-fuchsia-200 bg-fuchsia-50/70",
  },
  {
    key: "prestations_rh",
    label: "Prestations & équipes",
    shortDescription: "Le modèle adapté aux équipes de service et de production.",
    description: "Suivi des collaborateurs, pointages, congés, avances, coûts, projets clients et facturation des prestations.",
    modules: ["RH", "Pointages", "Comptabilité", "Clients", "Facturation"],
    accentClassName: "border-emerald-200 bg-emerald-50/70",
  },
];

export const getProjectTemplate = (key: ProjectTemplateKey) => PROJECT_TEMPLATES.find(template => template.key === key) ?? PROJECT_TEMPLATES[0];
