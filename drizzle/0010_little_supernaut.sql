ALTER TABLE `users` ADD `accountStatus` enum('invited','active','suspended') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `invitationToken` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `preferredCurrency` enum('EUR','MGA') DEFAULT 'MGA' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `showMGAEquivalent` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `activeProjectId` int;