# Vérification visuelle RBAC et espace collaborateur

Date : 19 août 2026.

La capture desktop confirme que le tableau de bord conserve une hiérarchie lisible, des cartes KPI et les sections de pilotage sans débordement horizontal visible. La capture mobile en largeur 390 px confirme que les cartes passent en colonne, que les graphiques et reportings restent lisibles et que les boutons d’action restent accessibles dans les cartes empilées. La navigation horizontale des onglets reste compacte mais utilisable ; la visibilité effective des modules pour un collaborateur est contrôlée par la règle de rôle côté interface et par les protections serveur.

Le build de production et les 46 tests Vitest sont passants au moment de cette vérification. La validation authentifiée des panneaux Settings/RBAC et du dashboard collaborateur reste à effectuer dans une session correspondant respectivement à un administrateur, un superviseur et un collaborateur si une preuve visuelle par rôle est requise.


## Vérification authentifiée — administrateur

Source : [prévisualisation AgencyManager Pro](https://3000-ijzlluhbf62momn2bbzmt-69e92598.us4.manus.computer/), session connectée le 19 août 2026.

La session administrateur affiche bien l’onglet **Paramètres · Admin**. Le panneau expose la création de comptes avec rôle, la matrice « Permissions par rôle » avec des interrupteurs pour le tableau de bord, le CA, les données RH personnelles, les données d’équipe, la gestion RH, les pointages, les demandes RH, les tickets, la comptabilité, le CRM, les devis/factures et les statistiques. Le panneau expose également « Visibilité du CA dans le pilotage », le sélecteur de superviseur et l’attribution de départements, ainsi que le backoffice projets et le bouton « Nouveau projet ».

La vérification authentifiée confirme donc que le contrôle admin est visible et opérationnel structurellement. La page était en session admin ; une session superviseur et une session collaborateur distinctes seraient nécessaires pour produire une preuve visuelle indépendante de chaque rôle sans modifier le compte admin courant.
