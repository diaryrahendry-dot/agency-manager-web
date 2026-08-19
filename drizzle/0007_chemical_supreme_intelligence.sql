CREATE TABLE `catalog_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemType` enum('produit','prestation') NOT NULL DEFAULT 'prestation',
	`label` varchar(200) NOT NULL,
	`description` text,
	`unit` varchar(50) NOT NULL DEFAULT 'unité',
	`unitPrice` decimal(12,2) NOT NULL,
	`currency` enum('EUR','MGA') NOT NULL DEFAULT 'MGA',
	`pricingMode` enum('ponctuel','récurrent','mensuel') NOT NULL DEFAULT 'ponctuel',
	`taxRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`clientVisible` int NOT NULL DEFAULT 1,
	`status` enum('actif','inactif') NOT NULL DEFAULT 'actif',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `subtotalAmount` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `discountType` enum('none','percent','fixed') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `discountValue` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `taxRate` decimal(5,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `taxAmount` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `currency` enum('EUR','MGA') DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `documentProfile` enum('fr','mg') DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `complianceJson` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `subtotalAmount` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `discountType` enum('none','percent','fixed') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `discountValue` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `taxRate` decimal(5,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `taxAmount` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `currency` enum('EUR','MGA') DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `documentProfile` enum('fr','mg') DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `complianceJson` text;