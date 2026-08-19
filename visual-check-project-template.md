# Vérification visuelle — création de projet

- Le tableau de bord se charge sans erreur de compilation dans les captures desktop et mobile.
- La navigation horizontale existante reste utilisable sur mobile et les cartes KPI s’empilent correctement.
- Le bouton « Nouveau projet » est placé dans l’en-tête de la carte Backoffice projets, avec un modal prévu pour s’adapter aux petits écrans via `max-h-[90vh]` et `overflow-y-auto`.
- Le modal propose trois cartes de templates, puis les champs projet, responsable, rôle initial et description.
- Les captures ont été réalisées hors de l’onglet Paramètres, car le parcours de capture ne permet pas de sélectionner un onglet de façon interactive ; la compilation TypeScript et les tests serveur restent les validations fonctionnelles de référence.

## Vérification interactive authentifiée

Après connexion OAuth dans la prévisualisation, l’onglet « Paramètres · Admin » est accessible. Le panneau affiche les préférences de travail, le projet actif, le contrôle des accès et la carte « Backoffice projets ». Le bouton « Nouveau projet » est visible pour le rôle admin, tandis que l’état vide invite correctement à créer le premier espace.

## Modal authentifié — desktop

Le modal « Créer un nouveau projet » s’ouvre correctement depuis le backoffice. Il contient les champs nom, slug, devise principale, juridiction documentaire, trois cartes de templates, compte responsable, accès initial et description. La mesure DOM effectuée dans le viewport de prévisualisation indique une largeur de 512 px et une hauteur de 990 px dans un viewport de 1280 × 1100 ; le contenu reste défilable dans le conteneur du modal, ce qui confirme la protection contre le débordement vertical.

## Modal défilé — actions finales

Après défilement jusqu’à la fin du modal, les champs de description, le rappel d’activation automatique, ainsi que les boutons « Annuler » et « Créer et ouvrir le projet » restent accessibles. La carte de sélection des templates conserve sa lisibilité et le conteneur présente une barre de défilement interne sans débordement de la page.

## Contrôle après recompilation

Après le rechargement lié aux derniers changements, la session authentifiée reste active et l’application revient proprement au tableau de bord. Le modal se ferme sans erreur ; le bouton Paramètres reste disponible pour rouvrir le parcours. Le contrôle de code confirme une mise en page mobile-first (`grid` simple puis `md:grid-cols-*`) et un modal limité à `90vh` avec défilement vertical interne. Une capture mobile globale du tableau de bord a déjà confirmé l’empilement responsive des cartes et l’absence de débordement horizontal.

## Seconde vérification authentifiée

Le parcours Paramètres → Backoffice projets → Nouveau projet a été rouvert après recompilation. La capture confirme à nouveau la présence des trois templates, des sélecteurs devise/juridiction, du compte responsable et des actions finales. Le modal est indépendant du tableau de bord et peut être fermé sans perdre la session administrateur.

## Vérification authentifiée dédiée — tablette et mobile

Une capture CDP utilisant la session authentifiée a été réalisée aux dimensions 768 × 1024 et 390 × 844. Les deux mesures DOM confirment un modal centré, scrollable, avec les trois templates et les actions « Annuler » et « Créer et ouvrir le projet ». En tablette, le modal mesure 494 × 889 px avec une hauteur de contenu de 1 243 px ; en mobile, il s’adapte à 382 × 744 px, avec un contenu de 1 775 px et un défilement interne. La capture mobile montre les champs empilés, le template sélectionné avec son indicateur et l’absence de débordement horizontal ; les actions restent accessibles après défilement.
