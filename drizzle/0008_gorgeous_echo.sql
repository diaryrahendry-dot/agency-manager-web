CREATE TABLE `agency_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(180) NOT NULL,
	`description` text,
	`status` enum('actif','archive') NOT NULL DEFAULT 'actif',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `agency_projects_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`membershipRole` enum('collaborateur','superviseur','admin') NOT NULL DEFAULT 'collaborateur',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('collaborateur','superviseur','admin') NOT NULL DEFAULT 'collaborateur';