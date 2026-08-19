# Vérification visuelle — Documents commerciaux

## Desktop

La navigation et les cartes du tableau de bord restent lisibles en vue large. Les graphiques mensuel et annuel sont contenus dans leurs cartes, et le reporting automatique conserve une hiérarchie visuelle claire.

## Mobile

La vue mobile empile correctement les cartes et conserve les libellés essentiels. Les deux graphiques se réduisent sans débordement horizontal visible. La navigation est dense sur petit écran et devra rester testée avec l’ouverture des onglets Facturation & Devis dans le navigateur réel.

## Limite de la capture

La capture initiale est authentifiée sur le tableau de bord mais ne simule pas l’ouverture interactive du nouvel onglet Facturation & Devis. Les procédures TypeScript et Vitest ont toutefois été validées séparément.

## Vérification ciblée du mode MGA masqué

Le mode `showMGAEquivalent` contrôle désormais les aperçus, les documents HTML téléchargés, les en-têtes de tableaux, les cellules des lignes et les colSpan des états vides. Lorsque le mode est désactivé, aucune valeur ni colonne MGA n’est rendue.

## Vérification conversion comptable

Chaque devis non encore marqué `facturé` expose l’action « Passer en compta ». La procédure crée une entrée de caisse en EUR, reprend le numéro du devis comme référence, invalide les indicateurs comptables et bloque une conversion répétée.

## Tests

`pnpm check` passe sans erreur TypeScript. `pnpm test` passe avec 3 fichiers de tests et 5 tests réussis.
