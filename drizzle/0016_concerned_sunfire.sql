ALTER TABLE `leaves` MODIFY COLUMN `status` enum('en_attente','approuvé','refusé','annulé') NOT NULL DEFAULT 'en_attente';--> statement-breakpoint
ALTER TABLE `agents` ADD `leaveBalanceDays` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `leaves` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `leaves` ADD `approvedByUserId` int;--> statement-breakpoint
ALTER TABLE `leaves` ADD `canceledAt` timestamp;--> statement-breakpoint
ALTER TABLE `leaves` ADD `canceledByUserId` int;--> statement-breakpoint
ALTER TABLE `leaves` ADD `deductedAt` timestamp;