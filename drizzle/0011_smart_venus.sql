ALTER TABLE `agents` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `cash_transactions` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `catalog_items` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `clients` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `leads` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `quotes` ADD `projectId` int;