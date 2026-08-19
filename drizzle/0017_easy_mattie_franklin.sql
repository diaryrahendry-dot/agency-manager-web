CREATE TABLE `credit_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`invoiceId` int NOT NULL,
	`creditNoteNumber` varchar(50) NOT NULL,
	`clientId` int NOT NULL,
	`clientName` varchar(150) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` enum('EUR','MGA') NOT NULL DEFAULT 'MGA',
	`exchangeRate` decimal(12,6) NOT NULL DEFAULT '1',
	`status` enum('brouillon','émis','converti_caisse','annulé') NOT NULL DEFAULT 'brouillon',
	`itemsJson` text NOT NULL,
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_notes_id` PRIMARY KEY(`id`)
);
