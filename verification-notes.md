# Vérification visuelle — 19 août 2026

- Le shell desktop affiche correctement la navigation principale, les KPI et les graphiques du tableau de bord.
- L’onglet Paramètres est intégré dans la navigation et reste réservé à l’espace applicatif existant.
- Les dernières modifications TypeScript passent sans erreur et le serveur de développement reste actif.
- Les vérifications fonctionnelles approfondies de Paramètres, des comptes, des projets et des transitions de brouillon sont couvertes par Vitest et doivent être complétées par un contrôle mobile avant checkpoint.

## Contrôle tablette

À 768 × 1024, la navigation reste horizontalement défilable et les cartes KPI se réorganisent en colonnes sans rupture de la page. Les libellés longs peuvent se rapprocher de la limite des cartes, mais le shell demeure utilisable et les graphiques s’adaptent à la largeur disponible.
