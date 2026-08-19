CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`position` varchar(150) NOT NULL,
	`department` varchar(100) NOT NULL,
	`hireDate` date NOT NULL,
	`salary` decimal(10,2) NOT NULL,
	`contractType` varchar(50) NOT NULL DEFAULT 'CDI',
	`status` enum('actif','inactif','conge') NOT NULL DEFAULT 'actif',
	`address` text,
	`emergencyContact` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('entrée','sortie') NOT NULL,
	`category` varchar(100) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`date` date NOT NULL,
	`paymentMethod` varchar(50) NOT NULL DEFAULT 'Virement',
	`reference` varchar(100),
	`description` text NOT NULL,
	`attachedUrl` text,
	`attachedKey` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`type` varchar(50) NOT NULL DEFAULT 'Appel',
	`summary` text NOT NULL,
	`date` timestamp NOT NULL DEFAULT (now()),
	`agentName` varchar(150),
	CONSTRAINT `client_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(150) NOT NULL,
	`contactName` varchar(150) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`address` text,
	`industry` varchar(100),
	`category` varchar(50) NOT NULL DEFAULT 'Standard',
	`status` enum('actif','inactif') NOT NULL DEFAULT 'actif',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`contractType` varchar(50) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date,
	`documentUrl` text,
	`documentKey` text,
	`status` enum('actif','expiré','résilié') NOT NULL DEFAULT 'actif',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`category` varchar(100) NOT NULL,
	`entityId` int,
	`fileUrl` text NOT NULL,
	`fileKey` text NOT NULL,
	`fileSize` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(50) NOT NULL,
	`clientId` int NOT NULL,
	`quoteId` int,
	`issueDate` date NOT NULL,
	`dueDate` date NOT NULL,
	`totalAmount` decimal(12,2) NOT NULL,
	`status` enum('brouillon','émise','payée','en_retard','annulée') NOT NULL DEFAULT 'brouillon',
	`itemsJson` text NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(150) NOT NULL,
	`contactName` varchar(150) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(50),
	`expectedAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`priority` enum('basse','moyenne','haute','urgente') NOT NULL DEFAULT 'moyenne',
	`status` enum('nouveau','contacté','proposition','negociation','gagne','perdu') NOT NULL DEFAULT 'nouveau',
	`nextContactDate` date,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leaves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`leaveType` varchar(50) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`daysCount` int NOT NULL,
	`status` enum('en_attente','approuvé','refusé') NOT NULL DEFAULT 'en_attente',
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leaves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteNumber` varchar(50) NOT NULL,
	`clientId` int NOT NULL,
	`issueDate` date NOT NULL,
	`validUntil` date NOT NULL,
	`totalAmount` decimal(12,2) NOT NULL,
	`status` enum('brouillon','envoyé','accepté','refusé','facturé') NOT NULL DEFAULT 'brouillon',
	`itemsJson` text NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_quoteNumber_unique` UNIQUE(`quoteNumber`)
);
--> statement-breakpoint
CREATE TABLE `salary_advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`requestedDate` date NOT NULL,
	`status` enum('demandé','accordé','déduit','refusé') NOT NULL DEFAULT 'demandé',
	`deductionMonth` varchar(20) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_advances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`agentId` int,
	`clientId` int,
	`priority` enum('basse','normale','haute','urgente') NOT NULL DEFAULT 'normale',
	`status` enum('ouvert','en_cours','résolu','fermé') NOT NULL DEFAULT 'ouvert',
	`category` varchar(100) NOT NULL DEFAULT 'Technique',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`date` date NOT NULL,
	`hoursWorked` decimal(4,2) NOT NULL,
	`status` enum('présent','absent','retard','congé') NOT NULL DEFAULT 'présent',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `time_entries_id` PRIMARY KEY(`id`)
);
