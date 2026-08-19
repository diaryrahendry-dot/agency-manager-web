ALTER TABLE `cash_transactions` ADD `currency` enum('EUR','MGA') DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_transactions` ADD `amountInCurrency` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_transactions` ADD `exchangeRate` decimal(12,2) DEFAULT '1.00' NOT NULL;