# Vérification responsive RH

- **Desktop 1280×960** : le shell AgencyManager Pro, la navigation, les cartes KPI et les sections de dashboard s’affichent sans débordement visible. La navigation horizontale reste contenue dans une zone défilable.
- **Mobile 390×844** : l’en-tête et la navigation restent utilisables, les onglets sont défilables horizontalement, les cartes KPI passent en colonne et les boutons restent lisibles.
- **À noter** : la boîte superviseur et les cartes agent sont rendues dans l’onglet RH ; la capture initiale est restée sur l’onglet Dashboard, donc ces vues ont été validées par lecture du code et TypeScript/Vitest, sans navigation interactive de session superviseur dédiée.
- **Tests exécutés** : 49 tests Vitest passants, 10 fichiers de test passants ; TypeScript sans erreur dans le serveur de développement.

Date de vérification : 2026-08-19.
