CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role` enum('collaborateur','superviseur','admin') NOT NULL,
	`permissionKey` varchar(80) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permission_unique` UNIQUE(`role`,`permissionKey`)
);
--> statement-breakpoint
CREATE TABLE `supervisor_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supervisorUserId` int NOT NULL,
	`projectId` int,
	`department` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supervisor_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `supervisor_team_unique` UNIQUE(`supervisorUserId`,`projectId`,`department`)
);
--> statement-breakpoint
ALTER TABLE `agency_projects` ADD `showRevenueDashboard` boolean DEFAULT true NOT NULL;