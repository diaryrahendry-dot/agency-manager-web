CREATE TABLE `budget_sheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(150) NOT NULL,
	`monthKey` varchar(20) NOT NULL,
	`itemsJson` text NOT NULL,
	`totalAmount` decimal(12,2) NOT NULL,
	`currency` enum('EUR','MGA') NOT NULL DEFAULT 'MGA',
	`status` enum('brouillon','validé','converti_caisse') NOT NULL DEFAULT 'brouillon',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `budget_sheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dynamic_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthKey` varchar(20) NOT NULL,
	`clientName` varchar(150) NOT NULL,
	`agentName` varchar(150) NOT NULL,
	`serviceName` varchar(150) NOT NULL,
	`revenue` decimal(12,2) NOT NULL DEFAULT '0.00',
	`expenses` decimal(12,2) NOT NULL DEFAULT '0.00',
	`workDays` decimal(6,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dynamic_stats_id` PRIMARY KEY(`id`)
);
