# Guide d'Hébergement Local et de Sauvegarde Google Drive - AgencyManager Pro

Ce document détaille l'architecture et la procédure pas à pas pour exécuter **AgencyManager Pro** sur une infrastructure locale (ordinateur personnel, serveur de bureau ou machine virtuelle privée) tout en synchronisant les sauvegardes et documents sur un espace **Google Drive**.

---

## 1. Architecture Autonome et Hébergement Local

Pour libérer l'application de toute dépendance Cloud externe et conserver l'intégralité de vos données en local, l'architecture technique repose sur les composants suivants :

* **Moteur d'exécution :** Node.js (version 20 ou supérieure).
* **Base de données relationnelle locale :** PostgreSQL ou MySQL hébergé en local (ex: via Docker ou une instance locale sur le poste).
* **Stockage de fichiers :** Répertoire local (ex: `/var/app/storage`) remplaçant le compartiment S3, garantissant que les factures, devis et pièces jointes restent sur votre disque.
* **Interface Frontend :** React 19 compilé en fichiers statiques servis par le serveur Node.js ou un reverse-proxy Nginx.

---

## 2. Procédure de Déploiement Local

### Étape A : Récupération du code source
Téléchargez le code source archivé du projet ou clonez le dépôt sur votre serveur local :
```bash
git clone <url-du-depot> agency-manager-pro
cd agency-manager-pro
```

### Étape B : Installation des dépendances
Installez les packages Node.js requis :
```bash
pnpm install
```

### Étape C : Configuration des variables d'environnement (`.env`)
Créez un fichier `.env` à la racine de l'application avec vos paramètres locaux :
```env
PORT=3000
NODE_ENV=production
DATABASE_URL=mysql://utilisateur:motdepasse@localhost:3306/agencymanager
JWT_SECRET=votre_cle_secrete_jwt_aleatoire
LOCAL_STORAGE_PATH=/home/utilisateur/agency-manager-data/storage
```

### Étape D : Application des migrations de base de données
Exécutez les migrations Drizzle pour initialiser les tables (agents, clients, factures, comptabilité, CRM, avoirs, etc.) :
```bash
pnpm drizzle-kit push
```

### Étape E : Lancement de l'application en production
```bash
pnpm build
pnpm start
```
L'application est alors accessible localement sur `http://localhost:3000`.

---

## 3. Stratégie de Sauvegarde et Synchronisation Google Drive

Pour assurer la sécurité et la redondance des données sans passer par un hébergeur Cloud tiers, vous pouvez automatiser une sauvegarde quotidienne vers **Google Drive** :

### Option 1 : Utilisation de l'outil rclone (Recommandé)
1. Installez `rclone` sur votre serveur local :
   ```bash
   sudo apt install rclone
   ```
2. Configurez une liaison vers votre Google Drive via la commande interactive :
   ```bash
   rclone config
   ```
   *(Nommez le dépôt distant `gdrive` par exemple).*
3. Créez un script de sauvegarde automatique (ex: `/home/utilisateur/backup-agency.sh`) :
   ```bash
   #!/bin/bash
   BACKUP_DIR="/home/utilisateur/agency-manager-backups"
   DATE=$(date +%Y%m%d_%H%M%S)
   
   # Sauvegarde de la base de données MySQL
   mysqldump -u utilisateur -pmotdepasse agencymanager > "$BACKUP_DIR/db_$DATE.sql"
   
   # Sauvegarde des fichiers et documents stockés localement
   tar -czf "$BACKUP_DIR/storage_$DATE.tar.gz" /home/utilisateur/agency-manager-data/storage
   
   # Synchronisation vers Google Drive
   rclone copy "$BACKUP_DIR" gdrive:AgencyManager_Backups
   
   # Nettoyage des archives locales de plus de 7 jours
   find "$BACKUP_DIR" -type f -mtime +7 -delete
   ```
4. Automatisez l'exécution via une tâche Cron quotidienne (`crontab -e`) :
   ```cron
   0 2 * * * /bin/bash /home/utilisateur/backup-agency.sh
   ```

### Option 2 : Export manuel depuis l'interface
L'application propose des boutons d'export natifs (comptabilité, factures, CSV/Excel) que vous pouvez enregistrer directement dans un dossier synchronisé par l'application de bureau Google Drive sur votre poste.

---

## 4. Mises à jour de l'application sans perte de données

1. **Isolation stricte :** Le code applicatif et la base de données sont totalement indépendants. Lors d'une mise à jour du code, la base de données SQLite/MySQL et le dossier de stockage restent intacts.
2. **Migrations sécurisées :** Les évolutions de schéma utilisent Drizzle ORM qui applique uniquement les ajouts incrémentaux nécessaires.
3. **Vérification :** Effectuez toujours une sauvegarde de la base et du dossier de stockage avant de basculer vers une nouvelle version majeure du code.

---
*Document rédigé pour AgencyManager Pro — Tous droits réservés.*
