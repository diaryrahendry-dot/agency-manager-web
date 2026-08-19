ALTER TABLE `budget_sheets` ADD `amountInCurrency` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_sheets` ADD `exchangeRate` decimal(12,6) DEFAULT '1' NOT NULL;